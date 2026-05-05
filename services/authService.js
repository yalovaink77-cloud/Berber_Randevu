const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'degistir_bunu_production_da';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

async function register({ name, phone, email, password, role = 'customer' }) {
  const existing = await User.findOne({ phone });
  if (existing) {
    const err = new Error('Bu telefon numarası zaten kayıtlı');
    err.status = 409;
    throw err;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ id: uuidv4(), name, phone, email, passwordHash, role });
  const token = generateToken(user);
  return { user: sanitize(user), token };
}

async function login({ phone, password }) {
  // Raw MongoDB sorgusu - Mongoose model filtrelerini bypass eder
  const raw = await User.collection.findOne({ phone });
  if (!raw || !raw.passwordHash) {
    const err = new Error('Telefon numarası veya şifre hatalı');
    err.status = 401;
    throw err;
  }
  const valid = await bcrypt.compare(password, raw.passwordHash);
  if (!valid) {
    const err = new Error('Telefon numarası veya şifre hatalı');
    err.status = 401;
    throw err;
  }
  const token = generateToken(raw);
  delete raw.passwordHash;
  delete raw.__v;
  return { user: raw, token };
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, phone: user.phone },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function sanitize(user) {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
}

module.exports = { register, login, verifyToken, sanitize };