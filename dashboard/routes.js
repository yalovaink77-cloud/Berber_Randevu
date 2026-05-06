const express = require('express');
const Joi = require('joi');
const router = express.Router();
const AppointmentLogic = require('../logic/appointmentLogic');
const DatabaseService = require('../services/databaseService');

const serviceTypes = ['haircut', 'shave', 'beard_trim', 'full_service', 'hair_coloring', 'hair_wash', 'other'];
const appointmentStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];

const createAppointmentSchema = Joi.object({
  customerId: Joi.string().trim().required(),
  customerName: Joi.string().trim().min(2).required(),
  customerPhone: Joi.string().trim().min(8).required(),
  barberId: Joi.string().trim().required(),
  barberName: Joi.string().trim().min(2).required(),
  serviceType: Joi.string().valid(...serviceTypes).default('haircut'),
  appointmentDate: Joi.date().iso().required(),
  duration: Joi.number().integer().min(10).max(240).default(30),
  notes: Joi.string().allow('', null),
  price: Joi.number().min(0).allow(null),
});

const updateAppointmentSchema = Joi.object({
  serviceType: Joi.string().valid(...serviceTypes),
  appointmentDate: Joi.date().iso(),
  duration: Joi.number().integer().min(10).max(240),
  status: Joi.string().valid(...appointmentStatuses),
  notes: Joi.string().allow('', null),
  price: Joi.number().min(0).allow(null),
}).min(1);

const availabilityQuerySchema = Joi.object({
  date: Joi.date().iso().required(),
  duration: Joi.number().integer().min(10).max(240).default(30),
});

const upcomingQuerySchema = Joi.object({
  days: Joi.number().integer().min(1).max(90).default(7),
});

function validateBody(schema) {
  return (req, res, next) => {
    const { value, error } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: 'Geçersiz istek verisi',
        details: error.details.map((detail) => detail.message),
      });
    }

    req.body = value;
    next();
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    const { value, error } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: 'Geçersiz sorgu parametresi',
        details: error.details.map((detail) => detail.message),
      });
    }

    req.query = value;
    next();
  };
}

function canAccessUserData(req, userId) {
  return req.user?.role === 'barber' || req.user?.id === userId;
}

async function loadAppointment(req, res, next) {
  try {
    const appointment = await DatabaseService.getAppointmentById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ error: 'Randevu bulunamadı' });
    }

    req.appointment = appointment;
    next();
  } catch (error) {
    next(error);
  }
}

function requireAppointmentAccess(req, res, next) {
  const appointment = req.appointment;

  if (
    req.user?.role === 'barber' ||
    req.user?.id === appointment.customerId ||
    req.user?.id === appointment.barberId
  ) {
    return next();
  }

  return res.status(403).json({ error: 'Bu randevuya erişim yetkiniz yok' });
}

// ===== APPOINTMENT ENDPOINTS =====

/**
 * POST /api/appointments
 * Yeni randevu oluştur
 */
router.post('/', validateBody(createAppointmentSchema), async (req, res, next) => {
  try {
    const {
      customerId,
      customerName,
      customerPhone,
      barberId,
      barberName,
      serviceType,
      appointmentDate,
      duration,
      notes,
      price,
    } = req.body;

    if (!canAccessUserData(req, customerId) && req.user?.id !== barberId) {
      return res.status(403).json({ error: 'Bu müşteri adına randevu oluşturma yetkiniz yok' });
    }

    const appointment = await AppointmentLogic.createAppointment({
      customerId,
      customerName,
      customerPhone,
      barberId,
      barberName,
      serviceType,
      appointmentDate: new Date(appointmentDate),
      duration,
      notes,
      price,
    });

    res.status(201).json({
      success: true,
      message: 'Randevu başarıyla oluşturuldu',
      appointment,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/appointments/customer/:customerId
 * Müşterinin randevularını listele
 */
router.get('/customer/:customerId', async (req, res, next) => {
  try {
    if (!canAccessUserData(req, req.params.customerId)) {
      return res.status(403).json({ error: 'Bu müşterinin randevularına erişim yetkiniz yok' });
    }

    const appointments = await DatabaseService.getAppointmentsByCustomer(req.params.customerId);
    res.json(appointments);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/appointments/barber/:barberId
 * Berber'in randevularını listele
 */
router.get('/barber/:barberId', async (req, res, next) => {
  try {
    if (!canAccessUserData(req, req.params.barberId)) {
      return res.status(403).json({ error: 'Bu berberin randevularına erişim yetkiniz yok' });
    }

    const appointments = await DatabaseService.getAppointmentsByBarber(req.params.barberId);
    res.json(appointments);
  } catch (error) {
    next(error);
  }
});

// ===== AVAILABILITY ENDPOINTS =====

/**
 * GET /api/appointments/barber/:barberId/available-slots
 * Berber'in kullanılabilir saatlerini getir
 */
router.get('/barber/:barberId/available-slots', validateQuery(availabilityQuerySchema), async (req, res, next) => {
  try {
    const { date, duration } = req.query;

    if (!canAccessUserData(req, req.params.barberId)) {
      return res.status(403).json({ error: 'Bu berberin uygun saatlerine erişim yetkiniz yok' });
    }

    const slots = await AppointmentLogic.getAvailableSlots(
      req.params.barberId,
      new Date(date),
      duration
    );

    res.json({
      date,
      slots,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/appointments/barber/:barberId/upcoming
 * Berber'in yaklaşan randevularını getir
 */
router.get('/barber/:barberId/upcoming', validateQuery(upcomingQuerySchema), async (req, res, next) => {
  try {
    const { days } = req.query;

    if (!canAccessUserData(req, req.params.barberId)) {
      return res.status(403).json({ error: 'Bu berberin randevularına erişim yetkiniz yok' });
    }

    const appointments = await DatabaseService.getUpcomingAppointments(
      req.params.barberId,
      days
    );

    res.json(appointments);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/appointments/:id
 * Randevu detaylarını getir
 */
router.get('/:id', loadAppointment, requireAppointmentAccess, (req, res) => {
  res.json(req.appointment);
});

/**
 * PUT /api/appointments/:id
 * Randevuyu güncelle
 */
router.put('/:id', validateBody(updateAppointmentSchema), loadAppointment, requireAppointmentAccess, async (req, res, next) => {
  try {
    const {
      serviceType,
      appointmentDate,
      duration,
      status,
      notes,
      price,
    } = req.body;

    const appointment = await AppointmentLogic.updateAppointment(req.params.id, {
      serviceType,
      appointmentDate,
      duration,
      status,
      notes,
      price,
    });

    res.json({
      success: true,
      message: 'Randevu başarıyla güncellendi',
      appointment,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/appointments/:id
 * Randevuyu iptal et
 */
router.delete('/:id', loadAppointment, requireAppointmentAccess, async (req, res, next) => {
  try {
    await AppointmentLogic.cancelAppointment(req.params.id);

    res.json({
      success: true,
      message: 'Randevu başarıyla iptal edildi',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
