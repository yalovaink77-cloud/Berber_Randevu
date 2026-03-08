const axios = require('axios');

class WhatsAppService {
  constructor() {
    this.token = process.env.META_ACCESS_TOKEN;
    this.phoneNumberId = process.env.META_PHONE_NUMBER_ID;
    this.verifyToken = process.env.META_VERIFY_TOKEN;
    this.baseUrl = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
  }

  async sendMessage(to, text) {
    try {
      await axios.post(
        this.baseUrl,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log(`✅ Mesaj gönderildi: ${to}`);
    } catch (error) {
      console.error('❌ Mesaj hatası:', error.response?.data || error.message);
      throw new Error('Mesaj gönderilemedi');
    }
  }

  verifyWebhook(mode, token, challenge) {
    if (mode === 'subscribe' && token === this.verifyToken) {
      console.log('✅ Webhook doğrulandı');
      return challenge;
    }
    throw new Error('Webhook doğrulama başarısız');
  }

  parseIncomingMessage(body) {
    try {
      const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!message) return null;
      return {
        from: message.from,
        messageId: message.id,
        type: message.type,
        text: message.text?.body || '',
        timestamp: message.timestamp,
      };
    } catch (error) {
      console.error('❌ Parse hatası:', error.message);
      return null;
    }
  }
}

module.exports = new WhatsAppService();