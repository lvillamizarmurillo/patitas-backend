const Appointment = require('../models/Appointment');
const Pet = require('../models/Pet');
const User = require('../models/User');
const VetClinic = require('../models/VetClinic');

// Adoptante solicita una cita
exports.createAppointment = async (req, res, next) => {
  try {
    const { petId, clinicId, meetingDate, notes } = req.body;
    const adopterId = req.user.id;

    const appointment = await Appointment.create({
      petId, clinicId, adopterId, meetingDate, notes
    });

    // Cambiar estado de la mascota a "en proceso"
    await Pet.update({ status: 'in_process' }, { where: { id: petId } });

    res.status(201).json({ message: 'Cita agendada', appointment });
  } catch (error) {
    next(error);
  }
};

// Obtener citas (depende del rol: el adoptante ve las suyas, el refugio ve las de sus mascotas)
exports.getAppointments = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let include = [
      { model: Pet, as: 'pet', include: [{ model: User, as: 'owner', attributes: ['fullName'] }] },
      { model: VetClinic, as: 'clinic' },
      { model: User, as: 'adopter', attributes: ['fullName', 'email', 'phone'] }
    ];

    let whereClause = {};
    if (userRole === 'adopter') {
      whereClause.adopterId = userId;
    } else {
      // Si es refugio/criador, filtramos las citas donde la mascota le pertenece
      include[0].where = { ownerId: userId };
    }

    const appointments = await Appointment.findAll({ where: whereClause, include });
    res.json({ appointments });
  } catch (error) {
    next(error);
  }
};

// Refugio confirma o rechaza la cita
exports.updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'confirmed', 'cancelled', 'completed'
    
    await Appointment.update({ status }, { where: { id } });
    
    if (status === 'cancelled') {
       // Devolver la mascota a disponible
       const appt = await Appointment.findByPk(id);
       await Pet.update({ status: 'available' }, { where: { id: appt.petId } });
    }

    res.json({ message: `Cita actualizada a ${status}` });
  } catch (error) {
    next(error);
  }
};