const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  // 1. Extraer el token del header Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No autorizado. Token no proporcionado.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // 2. Verificar el token usando la clave secreta
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 3. Adjuntar la información del usuario decodificada al objeto request
    req.user = decoded;
    
    // 4. Continuar al siguiente middleware o controlador
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido o expirado.' });
  }
};

// Middleware opcional para restringir el acceso según el rol
const roleMiddleware = (rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.user || !rolesPermitidos.includes(req.user.role)) {
      return res.status(403).json({ message: 'Acceso denegado. Rol insuficiente.' });
    }
    next();
  };
};

module.exports = { authMiddleware, roleMiddleware };