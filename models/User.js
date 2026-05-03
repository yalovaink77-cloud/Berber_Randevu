const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  id: {
    type: String,
    unique: true,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    lowercase: true,
  },
  role: {
    type: String,
    enum: ['barber', 'customer'],
    default: 'customer',
  },
  passwordHash: {
    type: String,
    select: false, // Sorgularda varsayılan olarak gelmez
  },
  // Berber için özel alanlar
  specialties: [
    {
      type: String, // Saç kesimi, tıraş vb.
    },
  ],
  workDays: {
    type: Object, // { monday: true, tuesday: true, ...}
  },
  workHours: {
    start: Number, // 10
    end: Number,   // 20
  },
  // Müşteri için özel alanlar
  preferences: {
    favoriteBarbers: [String],
    preferredTime: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', userSchema);
