const AIService = require('./aiService');
const WhatsAppService = require('./whatsappService');
const DatabaseService = require('./databaseService');
const AppointmentLogic = require('../logic/appointmentLogic');

// Konuşma hafızası - her müşteri için ayrı
const sessions = {};

class ConversationService {
  static async handleMessage(from, text) {
    try {
      // Oturum yoksa oluştur
      if (!sessions[from]) {
        sessions[from] = {
          step: 'greeting',
          data: {},
          history: [],
        };
      }

      const session = sessions[from];
      session.history.push({ role: 'user', content: text });

      // Müşteriyi tanı
      let customer = await DatabaseService.getUserByPhone(from);

      // AI ile cevap üret
      const response = await AIService.generateConversationResponse(
        text,
        session,
        customer
      );

      // Cevabı gönder
      await WhatsAppService.sendMessage(from, response.message);

      // Randevu alındıysa kaydet
      if (response.appointment) {
        await AppointmentLogic.createAppointment(response.appointment);
      }

      // Yeni müşteriyse kaydet
      if (response.newCustomer) {
        customer = await DatabaseService.createUser({
          name: response.newCustomer.name,
          phone: from,
          role: 'customer',
        });
      }

      // Oturumu güncelle
      session.history.push({ role: 'assistant', content: response.message });
      session.step = response.nextStep || session.step;
      session.data = { ...session.data, ...response.data };

    } catch (error) {
      console.error('❌ Konuşma hatası:', error.message);
      await WhatsAppService.sendMessage(from, 'Üzgünüm, bir sorun oluştu. Lütfen tekrar deneyin.');
    }
  }
}

module.exports = ConversationService;