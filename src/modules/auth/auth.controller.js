const service = require('./auth.service');
const env = require('../../config/env');

const cookieBase = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production' || env.COOKIE_SAMESITE === 'none',
  sameSite: env.COOKIE_SAMESITE,
  path: '/api/v1/auth',
};
const cookieOpts = { ...cookieBase, maxAge: 30 * 24 * 60 * 60 * 1000 };

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
  const { accessToken, refreshToken, user } = await service.refresh(req.cookies?.refreshToken, req.headers['user-agent']);
  res.cookie('refreshToken', refreshToken, cookieOpts);
  res.json({ data: { accessToken, user } });
};

exports.logout = async (req, res) => {
  await service.logout(req.cookies?.refreshToken);
  res.clearCookie('refreshToken', cookieBase);
  res.status(204).send();
};

exports.me = async (req, res) => res.json({ data: await service.me(req.user.id) });

exports.updateMe = async (req, res) => res.json({ data: await service.updateMe(req.user.id, req.valid.body) });

exports.changePassword = async (req, res) => {
  await service.changePassword(req.user.id, req.valid.body, req.cookies?.refreshToken);
  res.status(204).send();
};

exports.forgotPassword = async (req, res) => {
  await service.forgotPassword(req.valid.body);
  res.json({ data: { message: 'Si el correo está registrado, te enviamos un enlace para restablecer la contraseña.' } });
};

exports.resetPassword = async (req, res) => {
  await service.resetPassword(req.valid.body);
  res.clearCookie('refreshToken', cookieBase);
  res.json({ data: { message: 'Contraseña actualizada. Inicia sesión de nuevo.' } });
};

exports.getPayoutInfo = async (req, res) => res.json({ data: await service.getPayoutInfo(req.user.id) });
exports.setPayoutInfo = async (req, res) => res.json({ data: await service.setPayoutInfo(req.user.id, req.valid.body) });
