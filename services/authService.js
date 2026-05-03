const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'degistir_bunu_production_da';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Yeni kullanıcı kaydı
 * role: 'barber' | 'customer'
 */
async function register({ name, phone, email, password, role = 'customer' }) {
  // Telefon numarası zaten kayıtlı mı?
  const existing = await User.findOne({ phone });
  if (existing) {
    const err = new Error('Bu telefon numarası zaten kayıtlı');
    err.status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    id: uuidv4(),
    name,
    phone,
    email,
    passwordHash,
    role,
  });

  const token = generateToken(user);
  return { user: sanitize(user), token };
}

/**
 * Giriş
 */
async function login({ phone, password }) {
  const user = await User.findOne({ phone });
  if (!user || !user.passwordHash) {
    const err = new Error('Telefon numarası veya şifre hatalı');
    err.status = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const err = new Error('Telefon numarası veya şifre hatalı');
    err.status = 401;
    throw err;
  }

  const token = generateToken(user);
  return { user: sanitize(user), token };
}

/**
 * Token oluştur
 */
function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, phone: user.phone },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Token doğrula
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Hassas alanları çıkar
 */
function sanitize(user) {
  const obj = user.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
}

module.exports = { register, login, verifyToken, sanitize };
