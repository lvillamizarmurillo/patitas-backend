const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Controlador para Registro
exports.register = async (req, res, next) => {
  try {
    const { role, fullName, city, email, phone, password, termsAccepted } = req.body;

    // Validación básica (se recomienda usar librerías como Joi o express-validator en el futuro)
    if (!termsAccepted) {
      return res.status(400).json({ message: 'Debes aceptar los términos y condiciones.' });
    }

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: 'El correo electrónico ya está registrado.' });
    }

    // Crear el usuario (el hook beforeCreate encriptará la contraseña)
    const newUser = await User.create({
      role,
      fullName,
      city,
      email,
      phone,
      password,
      termsAccepted
    });

    // Crear token para autologin después del registro
    const token = jwt.sign(
      { id: newUser.id, role: newUser.role, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      user: { id: newUser.id, fullName: newUser.fullName, email: newUser.email, role: newUser.role }
    });
  } catch (error) {
    next(error); // Pasa el error al middleware centralizado
  }
};

// Controlador para Login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Buscar el usuario
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    // Verificar contraseña usando el método definido en el modelo
    const isValidPassword = await user.validPassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    // Generar Token
    const token = jwt.sign(
      { id: user.id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      message: 'Inicio de sesión exitoso',
      token,
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role }
    });
  } catch (error) {
    next(error);
  }
};