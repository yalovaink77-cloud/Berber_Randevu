const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

class DatabaseService {

  // ===== USER İŞLEMLERİ =====

  static async createUser(userData) {
    const { data, error } = await supabase
      .from('users')
      .insert([{
        id: uuidv4(),
        name: userData.name,
        phone: userData.phone,
        email: userData.email,
        role: userData.role || 'customer',
        specialties: userData.specialties || [],
        work_days: userData.workDays,
        work_hours: userData.workHours,
        preferences: userData.preferences,
      }])
      .select()
      .single();
    if (error) throw new Error(`Kullanıcı oluşturma hatası: ${error.message}`);
    return data;
  }

  static async getUserById(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) return null;
    return data;
  }

  static async getUserByPhone(phone) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .single();
    if (error) return null;
    return data;
  }

  static async getAllBarbers() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'barber');
    if (error) throw new Error(`Berber getirme hatası: ${error.message}`);
    return data || [];
  }

  static async updateUser(userId, updateData) {
    const { data, error } = await supabase
      .from('users')
      .update({ ...updateData, updated_at: new Date() })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw new Error(`Kullanıcı güncelleme hatası: ${error.message}`);
    return data;
  }

  // ===== APPOINTMENT İŞLEMLERİ =====

  static async createAppointment(appointmentData) {
    const { data, error } = await supabase
      .from('appointments')
      .insert([{
        id: uuidv4(),
        customer_id: appointmentData.customerId,
        customer_name: appointmentData.customerName,
        customer_phone: appointmentData.customerPhone,
        barber_id: appointmentData.barberId,
        barber_name: appointmentData.barberName,
        service_type: appointmentData.serviceType || 'haircut',
        appointment_date: appointmentData.appointmentDate,
        duration: appointmentData.duration || 30,
        notes: appointmentData.notes,
        price: appointmentData.price,
        status: 'pending',
      }])
      .select()
      .single();
    if (error) throw new Error(`Randevu oluşturma hatası: ${error.message}`);
    return data;
  }

  static async getAppointmentById(appointmentId) {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single();
    if (error) return null;
    return data;
  }

  static async getAppointmentsByCustomer(customerId) {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('customer_id', customerId)
      .order('appointment_date', { ascending: false });
    if (error) throw new Error(`Müşteri randevuları hatası: ${error.message}`);
    return data || [];
  }

  static async getAppointmentsByBarber(barberId) {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('barber_id', barberId)
      .order('appointment_date', { ascending: true });
    if (error) throw new Error(`Berber randevuları hatası: ${error.message}`);
    return data || [];
  }

  static async getAvailableSlots(barberId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('barber_id', barberId)
      .gte('appointment_date', startOfDay.toISOString())
      .lte('appointment_date', endOfDay.toISOString())
      .neq('status', 'cancelled');
    if (error) throw new Error(`Boş saatler hatası: ${error.message}`);
    return data || [];
  }

  static async updateAppointment(appointmentId, updateData) {
    const { data, error } = await supabase
      .from('appointments')
      .update({ ...updateData, updated_at: new Date() })
      .eq('id', appointmentId)
      .select()
      .single();
    if (error) throw new Error(`Randevu güncelleme hatası: ${error.message}`);
    return data;
  }

  static async cancelAppointment(appointmentId) {
    const { data, error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled', updated_at: new Date() })
      .eq('id', appointmentId)
      .select()
      .single();
    if (error) throw new Error(`Randevu iptal hatası: ${error.message}`);
    return data;
  }

  static async getAppointmentsByDate(date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .gte('appointment_date', startOfDay.toISOString())
      .lte('appointment_date', endOfDay.toISOString())
      .order('appointment_date', { ascending: true });
    if (error) throw new Error(`Tarih randevuları hatası: ${error.message}`);
    return data || [];
  }

  static async getUpcomingAppointments(barberId, days = 7) {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('barber_id', barberId)
      .gte('appointment_date', now.toISOString())
      .lte('appointment_date', futureDate.toISOString())
      .neq('status', 'cancelled')
      .order('appointment_date', { ascending: true });
    if (error) throw new Error(`Yaklaşan randevular hatası: ${error.message}`);
    return data || [];
  }
}

module.exports = DatabaseService;