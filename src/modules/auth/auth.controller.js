const service = require('./auth.service');
const env = require('../../config/env');

const cookieOpts = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/v1/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

exports.register = async (req, res) => {
  const { user, accessToken, refreshToken } = await service.register(req.valid.body, req.headers['user-agent']);
  res.cookie('refreshToken', refreshToken, cookieOpts);
  res.status(201).json({ data: { user, accessToken } });
};

exports.login = async (req, res) => {
  const { user, accessToken, refreshToken } = await service.login(req.valid.body, req.headers['user-agent']);
  res.cookie('refreshToken', refreshToken, cookieOpts);
  res.json({ data: { user, accessToken } });
};

exports.refresh = async (req, res) => {
  const { accessToken, refreshToken } = await service.refresh(req.cookies?.refreshToken, req.headers['user-agent']);
  res.cookie('refreshToken', refreshToken, cookieOpts);
  res.json({ data: { accessToken } });
};

exports.logout = async (req, res) => {
  await service.logout(req.cookies?.refreshToken);
  res.clearCookie('refreshToken', { path: '/api/v1/auth' });
  res.status(204).send();
};

exports.me = async (req, res) => res.json({ data: await service.me(req.user.id) });