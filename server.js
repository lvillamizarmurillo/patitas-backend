require('dotenv').config();
const app = require('./src/app');
const User = require('./src/models/User');
const Pet = require('./src/models/Pet');
const VetClinic = require('./src/models/VetClinic');
const Appointment = require('./src/models/Appointment');
const sequelize = require('./src/config/database');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Validar conexión con PostgreSQL
    await sequelize.authenticate();
    console.log('🐘 Conexión a PostgreSQL establecida correctamente.');

    // Relaciones Usuario - Mascota (Ya existían)
    User.hasMany(Pet, { foreignKey: 'ownerId', as: 'pets' });
    Pet.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

    // Relaciones Citas
    User.hasMany(Appointment, { foreignKey: 'adopterId', as: 'appointments' });
    Appointment.belongsTo(User, { foreignKey: 'adopterId', as: 'adopter' });

    Pet.hasMany(Appointment, { foreignKey: 'petId', as: 'appointments' });
    Appointment.belongsTo(Pet, { foreignKey: 'petId', as: 'pet' });

    VetClinic.hasMany(Appointment, { foreignKey: 'clinicId', as: 'appointments' });
    Appointment.belongsTo(VetClinic, { foreignKey: 'clinicId', as: 'clinic' });
    
    // Sincronizar modelos (crea las tablas si no existen)
    await sequelize.sync({ alter: true });
    
    app.listen(PORT, () => {
      console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

startServer();