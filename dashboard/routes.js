const express = require('express');
const router = express.Router();
const AppointmentLogic = require('../logic/appointmentLogic');
const DatabaseService = require('../services/databaseService');

// ===== APPOINTMENT ENDPOINTS =====

/**
 * POST /api/appointments
 * Yeni randevu oluştur
 */
router.post('/', async (req, res, next) => {
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

    // Validasyon
    if (!customerId || !customerName || !customerPhone || !barberId || !barberName || !appointmentDate) {
      return res.status(400).json({
        error: 'Gerekli alanlar eksik (customerId, customerName, customerPhone, barberId, barberName, appointmentDate)',
      });
    }

    const appointment = await AppointmentLogic.createAppointment({
      customerId,
      customerName,
      customerPhone,
      barberId,
      barberName,
      serviceType: serviceType || 'haircut',
      appointmentDate: new Date(appointmentDate),
      duration: duration || 30,
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
 * GET /api/appointments/:id
 * Randevu detaylarını getir
 */
router.get('/:id', async (req, res, next) => {
  try {
    const appointment = await DatabaseService.getAppointmentById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ error: 'Randevu bulunamadı' });
    }

    res.json(appointment);
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
    const appointments = await DatabaseService.getAppointmentsByBarber(req.params.barberId);
    res.json(appointments);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/appointments/:id
 * Randevuyu güncelle
 */
router.put('/:id', async (req, res, next) => {
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
router.delete('/:id', async (req, res, next) => {
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

// ===== AVAILABILITY ENDPOINTS =====

/**
 * GET /api/appointments/barber/:barberId/available-slots
 * Berber'in kullanılabilir saatlerini getir
 */
router.get('/barber/:barberId/available-slots', async (req, res, next) => {
  try {
    const { date, duration } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Tarih parametresi gerekli' });
    }

    const slots = await AppointmentLogic.getAvailableSlots(
      req.params.barberId,
      new Date(date),
      duration || 30
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
router.get('/barber/:barberId/upcoming', async (req, res, next) => {
  try {
    const { days } = req.query;
    const appointments = await DatabaseService.getUpcomingAppointments(
      req.params.barberId,
      days || 7
    );

    res.json(appointments);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
