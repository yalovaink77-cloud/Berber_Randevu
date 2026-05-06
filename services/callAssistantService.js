const DatabaseService = require('./databaseService');
const WhatsAppService = require('./whatsappService');

const CUSTOMER_REPLY =
  'Merhaba, şu an müşterimle ilgileniyorum. Randevu almak için WhatsApp üzerinden gün ve işlem bilgisini yazabilirsiniz; uygun saatleri hemen paylaşacağım.';

const UNKNOWN_REPLY =
  'Merhaba, şu an çalışıyorum. Randevu almak veya not bırakmak için WhatsApp üzerinden yazabilirsiniz; müsait olunca dönüş yapacağım.';

const PRIVATE_REPLY =
  'Şu an çalışıyorum, müsait olunca seni arayacağım.';

class CallAssistantService {
  static normalizeStatus(status) {
    if (['available', 'working', 'break', 'closed'].includes(status)) {
      return status;
    }
    return 'working';
  }

  static decideReply({ contact, hasAppointmentHistory, barberStatus, assistantSettings = {} }) {
    const status = this.normalizeStatus(barberStatus);

    if (status === 'available') {
      return {
        action: 'none',
        message: '',
        reason: 'Berber müsait görünüyor; otomatik mesaj gerekmedi.',
      };
    }

    if (contact?.category === 'blocked' || contact?.autoReplyEnabled === false) {
      return {
        action: 'none',
        message: '',
        reason: 'Bu kişi için otomatik mesaj kapalı.',
      };
    }

    if (['vip', 'family', 'friend'].includes(contact?.category)) {
      return {
        action: assistantSettings.privateContactAutoReply ? 'send' : 'manual_review',
        message: PRIVATE_REPLY,
        reason: 'Özel kişi olduğu için randevu mesajı yerine kişisel dönüş mesajı önerildi.',
      };
    }

    if (contact?.category === 'customer' || hasAppointmentHistory) {
      return {
        action: 'send',
        message: CUSTOMER_REPLY,
        reason: 'Bilinen müşteri olduğu için randevu kanalına yönlendirildi.',
      };
    }

    return {
      action: assistantSettings.unknownCallerAutoReply ? 'send' : 'manual_review',
      message: UNKNOWN_REPLY,
      reason: 'Kişi sınıflandırılmadığı için nötr mesaj önerildi.',
    };
  }

  static async handleMissedCall({
    barberId,
    fromPhone,
    fromName,
    barberStatus = 'working',
    sendAutoReply = false,
    assistantSettings,
    callAt,
  }) {
    const contact = await DatabaseService.getContactByPhone(barberId, fromPhone);
    const hasAppointmentHistory = await DatabaseService.hasAppointmentHistoryWithPhone(
      barberId,
      fromPhone
    );
    const decision = this.decideReply({
      contact,
      hasAppointmentHistory,
      barberStatus,
      assistantSettings,
    });

    let autoReplySent = false;
    if (sendAutoReply && decision.action === 'send' && decision.message) {
      await WhatsAppService.sendMessage(fromPhone, decision.message);
      autoReplySent = true;
    }

    const missedCall = await DatabaseService.createMissedCall({
      barberId,
      fromPhone,
      fromName: fromName || contact?.name,
      contactCategory: contact?.category || (hasAppointmentHistory ? 'customer' : 'unknown'),
      barberStatus: this.normalizeStatus(barberStatus),
      autoReplyMessage: decision.message,
      autoReplyAction: decision.action,
      autoReplySent,
      callAt,
    });

    return {
      missedCall,
      decision: {
        ...decision,
        autoReplySent,
      },
      contact,
      hasAppointmentHistory,
    };
  }
}

module.exports = CallAssistantService;
