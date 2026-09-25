const crypto = require('crypto');
const env = require('../../config/env');

let client;
const getClient = () => {
  if (!client) {
    const { S3Client } = require('@aws-sdk/client-s3');
    client = new S3Client({ region: env.AWS_REGION }); // en ECS usa el IAM Task Role, sin credenciales explícitas
  }
  return client;
};

exports.upload = async (buffer, { folder = 'pets', ext = 'webp', private: isPrivate = false } = {}) => {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const key = `${folder}/${crypto.randomUUID()}.${ext}`;
  await getClient().send(new PutObjectCommand({
    Bucket: env.S3_BUCKET, Key: key, Body: buffer,
    ContentType: ext === 'pdf' ? 'application/pdf' : `image/${ext}`,
    CacheControl: isPrivate ? 'private, no-cache' : 'public, max-age=31536000, immutable',
  }));
  const url = isPrivate ? null : `https://${env.CDN_DOMAIN || env.S3_BUCKET + '.s3.amazonaws.com'}/${key}`;
  return { url, key };
};

exports.remove = async (key) => {
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  await getClient().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key })).catch(() => {});
};

exports.getSignedUrl = async (key, { expiresInSeconds = 300 } = {}) => {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl: presign } = require('@aws-sdk/s3-request-presigner');
  return presign(getClient(), new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn: expiresInSeconds });
};