const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const Appointment = require('../models/Appointment');

// MongoDB bağlantısı
if (!mongoose.connection.readyState) {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/berber_randevu')
    .then(() => console.log('✅ MongoDB bağlantısı başarılı'))
    .catch(err => console.error('❌ MongoDB bağlantı hatası:', err.message));
}

class DatabaseService {

  static async createUser(userData) {
    return await User.create({
      id: uuidv4(),
      name: userData.name,
      phone: userData.phone,
      email: userData.email,
      role: userData.role || 'customer',
      specialties: userData.specialties || [],
      workDays: userData.workDays,
      workHours: userData.workHours,
      preferences: userData.preferences,
    });
  }

  static async getUserById(userId) {
    return await User.findOne({ id: userId });
  }

  static async getUserByPhone(phone) {
    return await User.findOne({ phone });
  }

  static async getAllBarbers() {
    return await User.find({ role: 'barber' });
  }

  static async updateUser(userId, updateData) {
    return await User.findOneAndUpdate(
      { id: userId },
      { ...updateData, updatedAt: new Date() },
      { new: true }
    );
  }

  static async createAppointment(appointmentData) {
    return await Appointment.create({
      id: uuidv4(),
      customerId: appointmentData.customerId,
      customerName: appointmentData.customerName,
      customerPhone: appointmentData.customerPhone,
      barberId: appointmentData.barberId,
      barberName: appointmentData.barberName,
      serviceType: appointmentData.serviceType || 'haircut',
      appointmentDate: appointmentData.appointmentDate,
      duration: appointmentData.duration || 30,
      notes: appointmentData.notes,
      price: appointmentData.price,
      status: 'pending',
    });
  }

  static async getAppointmentById(appointmentId) {
    return await Appointment.findOne({ id: appointmentId });
  }

  static async getAppointmentsByCustomer(customerId) {
    return await Appointment.find({ customerId }).sort({ appointmentDate: -1 });
  }

  static async getAppointmentsByBarber(barberId) {
    return await Appointment.find({ barberId }).sort({ appointmentDate: 1 });
  }

  static async getAvailableSlots(barberId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    return await Appointment.find({
      barberId,
      appointmentDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'cancelled' },
    });
  }

  static async updateAppointment(appointmentId, updateData) {
    return await Appointment.findOneAndUpdate(
      { id: appointmentId },
      { ...updateData, updatedAt: new Date() },
      { new: true }
    );
  }

  static async cancelAppointment(appointmentId) {
    return await Appointment.findOneAndUpdate(
      { id: appointmentId },
      { status: 'cancelled', updatedAt: new Date() },
      { new: true }
    );
  }

  static async getAppointmentsByDate(date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    return await Appointment.find({
      appointmentDate: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ appointmentDate: 1 });
  }

  static async getUpcomingAppointments(barberId, days = 7) {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + Number(days));
    return await Appointment.find({
      barberId,
      appointmentDate: { $gte: now, $lte: futureDate },
      status: { $ne: 'cancelled' },
    }).sort({ appointmentDate: 1 });
  }
}

module.exports = DatabaseService;