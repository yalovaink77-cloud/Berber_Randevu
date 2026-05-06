const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const Contact = require('../models/Contact');
const MissedCall = require('../models/MissedCall');

// MongoDB bağlantısı
if (!mongoose.connection.readyState) {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/berber_randevu', {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000),
  })
    .then(() => console.log('✅ MongoDB bağlantısı başarılı'))
    .catch((err) => {
      console.error('❌ MongoDB bağlantı hatası:', err.message);
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }
    });
}

class DatabaseService {

  static async createUser(userData) {
    return await User.create({
      id: uuidv4(),
      name: userData.name,
      phone: userData.phone,
      email: userData.email,
      role: userData.role || 'customer',
      businessName: userData.businessName,
      businessAddress: userData.businessAddress,
      assistantStatus: userData.assistantStatus || 'working',
      assistantSettings: userData.assistantSettings,
      onboarding: userData.onboarding,
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

  static async upsertContact(ownerId, contactData) {
    return await Contact.findOneAndUpdate(
      { ownerId, phone: contactData.phone },
      {
        $set: {
          name: contactData.name,
          category: contactData.category || 'unknown',
          autoReplyEnabled: contactData.autoReplyEnabled !== false,
          notes: contactData.notes,
          lastInteractionAt: new Date(),
          updatedAt: new Date(),
        },
        $setOnInsert: {
          id: uuidv4(),
          ownerId,
          phone: contactData.phone,
          createdAt: new Date(),
        },
      },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    );
  }

  static async getContactByPhone(ownerId, phone) {
    return await Contact.findOne({ ownerId, phone });
  }

  static async getContacts(ownerId, category) {
    const query = { ownerId };
    if (category) query.category = category;
    return await Contact.find(query).sort({ updatedAt: -1 });
  }

  static async createMissedCall(callData) {
    return await MissedCall.create({
      id: uuidv4(),
      barberId: callData.barberId,
      fromPhone: callData.fromPhone,
      fromName: callData.fromName,
      contactCategory: callData.contactCategory || 'unknown',
      barberStatus: callData.barberStatus || 'working',
      autoReplyMessage: callData.autoReplyMessage,
      autoReplyAction: callData.autoReplyAction || 'manual_review',
      autoReplySent: callData.autoReplySent || false,
      replyChannel: callData.replyChannel || 'whatsapp',
      callAt: callData.callAt || new Date(),
    });
  }

  static async getMissedCalls(barberId, limit = 25) {
    return await MissedCall.find({ barberId })
      .sort({ callAt: -1 })
      .limit(Number(limit));
  }

  static async hasAppointmentHistoryWithPhone(barberId, phone) {
    const count = await Appointment.countDocuments({
      barberId,
      customerPhone: phone,
    });
    return count > 0;
  }

  static async updateUser(userId, updateData) {
    return await User.findOneAndUpdate(
      { id: userId },
      { ...updateData, updatedAt: new Date() },
      { returnDocument: 'after' }
    );
  }

  static async updateBarberProfile(userId, profileData) {
    return await User.findOneAndUpdate(
      { id: userId, role: 'barber' },
      {
        ...profileData,
        updatedAt: new Date(),
      },
      { returnDocument: 'after' }
    ).select('-passwordHash -__v');
  }

  static async updateAssistantStatus(userId, assistantStatus) {
    return await User.findOneAndUpdate(
      { id: userId, role: 'barber' },
      {
        assistantStatus,
        updatedAt: new Date(),
      },
      { returnDocument: 'after' }
    ).select('-passwordHash -__v');
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

  static async getActiveAppointmentsByBarber(barberId) {
    return await Appointment.find({
      barberId,
      status: { $ne: 'cancelled' },
    }).sort({ appointmentDate: 1 });
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
      { returnDocument: 'after' }
    );
  }

  static async cancelAppointment(appointmentId) {
    return await Appointment.findOneAndUpdate(
      { id: appointmentId },
      { status: 'cancelled', updatedAt: new Date() },
      { returnDocument: 'after' }
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
