const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const authRoutes = require('./routes/auth.routes');
const path = require('path');
const petRoutes = require('./routes/pet.routes');
const catalogRoutes = require('./routes/catalog.routes');
const appointmentRoutes = require('./routes/appointment.routes');

const app = express();

// Middlewares globales
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Añadir debajo de los middlewares globales
// Sirve la carpeta public/uploads estáticamente para ver las imágenes
app.use(express.static(path.join(__dirname, '../public')));

// Ruta de Healthcheck para verificar que la API responde
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Patitas API funcionando correctamente' });
});

app.use('/api/auth', authRoutes);

app.use('/api/pets', petRoutes);

app.use('/api/catalogs', catalogRoutes);

app.use('/api/appointments', appointmentRoutes);

// Middleware centralizado de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = app;