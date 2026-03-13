const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

class AIService {
  constructor() {
    this.aiProvider = (process.env.AI_PROVIDER || 'auto').toLowerCase();

    // Meta AI (Llama API veya OpenAI-uyumlu endpoint) ayarları
    this.metaApiKey = process.env.META_AI_API_KEY;
    this.metaBaseUrl = (process.env.META_AI_BASE_URL || 'https://api.llama.com/compat/v1')
      .replace(/\/+$/, '');
    this.metaModel = process.env.META_AI_MODEL || 'Llama-4-Maverick-17B-128E-Instruct';

    // Claude fallback - META_AI_API_KEY yoksa ya da Meta çağrısı başarısızsa kullanılabilir
    this.anthropicClient = process.env.CLAUDE_API_KEY
      ? new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })
      : null;
    this.anthropicModel = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';

    this.requestTimeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || 30000);
    this.conversationHistoryLimit = Math.max(
      2,
      Number(process.env.AI_CONVERSATION_HISTORY_LIMIT || 4)
    );

    // Maliyet düşürme: basit taleplerde API çağrısı yapmadan yerel kural kullan.
    this.enableHeuristicRequestParsing =
      String(process.env.AI_HEURISTIC_REQUEST_PARSING || 'true').toLowerCase() !== 'false';
    this.enableHeuristicFeedbackParsing =
      String(process.env.AI_HEURISTIC_FEEDBACK_PARSING || 'true').toLowerCase() !== 'false';
    this.summaryWithModel =
      String(process.env.AI_SUMMARY_WITH_MODEL || 'false').toLowerCase() === 'true';
  }

  resolveProvider() {
    if (this.aiProvider === 'meta' || this.aiProvider === 'anthropic') {
      return this.aiProvider;
    }

    // auto: Meta ana tercih, yoksa Claude fallback
    if (this.metaApiKey) return 'meta';
    return 'anthropic';
  }

  normalizeMessages(messages = [], allowSystem = false) {
    return messages
      .filter((item) => item && typeof item.content === 'string' && item.content.trim())
      .map((item) => {
        let role = 'user';

        if (item.role === 'assistant') {
          role = 'assistant';
        } else if (allowSystem && item.role === 'system') {
          role = 'system';
        }

        return {
          role,
          content: item.content,
        };
      });
  }

  extractTextFromAnthropicResponse(message) {
    if (!message || !Array.isArray(message.content)) return '';

    return message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim();
  }

  extractTextFromMetaResponse(responseData) {
    const content = responseData?.choices?.[0]?.message?.content;

    if (typeof content === 'string') {
      return content.trim();
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part.text === 'string') return part.text;
          return '';
        })
        .join('\n')
        .trim();
    }

    return '';
  }

  extractJsonResponse(responseText, fallbackValue) {
    if (!responseText || typeof responseText !== 'string') {
      return fallbackValue;
    }

    try {
      return JSON.parse(responseText);
    } catch (error) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (jsonError) {
          return fallbackValue;
        }
      }
    }

    return fallbackValue;
  }

  formatDateAsYmd(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  buildLocalAppointmentSummary(appointmentDetails) {
    const date = new Date(appointmentDetails.appointmentDate);
    const dateStr = date.toLocaleDateString('tr-TR');
    const timeStr = date.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const duration = appointmentDetails.duration || 30;

    return `${appointmentDetails.customerName} icin ${appointmentDetails.barberName} ile ${dateStr} ${timeStr} saatinde randevu olusturuldu. Hizmet: ${appointmentDetails.serviceType}, sure: ${duration} dakika.`;
  }

  detectServiceType(message) {
    const text = (message || '').toLowerCase();

    if (/renk|boya/.test(text)) return 'hair_coloring';
    if (/sakal/.test(text) && /(kes|duzen|trim|sekil)/.test(text)) return 'beard_trim';
    if (/tras|tıras|tiras|shave/.test(text)) return 'shave';
    if (/yikama|yıkama/.test(text)) return 'hair_wash';
    if (/sac|saç|kesim|haircut/.test(text)) return 'haircut';

    return null;
  }

  extractPreferredTime(message) {
    const text = (message || '').toLowerCase();

    const hhmmMatch = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
    if (hhmmMatch) {
      return `${hhmmMatch[1].padStart(2, '0')}:${hhmmMatch[2]}`;
    }

    const hourMatch = text.match(/\b([01]?\d|2[0-3])\s*(gibi|civari|civarı|de|da|te|ta)\b/);
    if (hourMatch) {
      return `${hourMatch[1].padStart(2, '0')}:00`;
    }

    return null;
  }

  extractPreferredDate(message) {
    const text = (message || '').toLowerCase();
    const now = new Date();

    if (/bugun|bugün/.test(text)) {
      return this.formatDateAsYmd(now);
    }

    if (/yarin|yarın/.test(text)) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return this.formatDateAsYmd(tomorrow);
    }

    if (/haftaya/.test(text)) {
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return this.formatDateAsYmd(nextWeek);
    }

    const weekdayMap = {
      pazartesi: 1,
      sali: 2,
      salı: 2,
      carsamba: 3,
      carşamba: 3,
      çarsamba: 3,
      çarşamba: 3,
      persembe: 4,
      perşembe: 4,
      cuma: 5,
      cumartesi: 6,
      pazar: 0,
    };

    for (const [name, targetDay] of Object.entries(weekdayMap)) {
      if (text.includes(name)) {
        const date = new Date(now);
        const diff = (targetDay - date.getDay() + 7) % 7;
        date.setDate(date.getDate() + diff);
        return this.formatDateAsYmd(date);
      }
    }

    const isoMatch = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);
      const date = new Date(year, month - 1, day);
      if (!Number.isNaN(date.getTime())) {
        return this.formatDateAsYmd(date);
      }
    }

    const trDateMatch = text.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
    if (trDateMatch) {
      const day = Number(trDateMatch[1]);
      const month = Number(trDateMatch[2]);
      let year = trDateMatch[3] ? Number(trDateMatch[3]) : now.getFullYear();

      if (year < 100) year += 2000;

      const date = new Date(year, month - 1, day);
      if (!Number.isNaN(date.getTime())) {
        return this.formatDateAsYmd(date);
      }
    }

    return null;
  }

  analyzeCustomerRequestHeuristically(customerMessage) {
    const serviceType = this.detectServiceType(customerMessage);
    const preferredDate = this.extractPreferredDate(customerMessage);
    const preferredTime = this.extractPreferredTime(customerMessage);

    const explicitAppointmentIntent = /randevu|uygun|musait|müsait|alabilir miyim|gelmek istiyorum/.test(
      (customerMessage || '').toLowerCase()
    );

    const signalCount = [serviceType, preferredDate, preferredTime].filter(Boolean).length;
    const isConfident = signalCount >= 2 || (signalCount >= 1 && explicitAppointmentIntent);

    return {
      isConfident,
      data: {
        serviceType: serviceType || 'haircut',
        preferredDate,
        preferredTime,
        additionalNotes: customerMessage,
      },
    };
  }

  normalizeConversationResponse(parsed, fallbackStep, fallbackMessage) {
    if (!parsed || typeof parsed !== 'object') {
      return {
        message: fallbackMessage,
        nextStep: fallbackStep,
        data: {},
        appointment: null,
        newCustomer: null,
      };
    }

    return {
      message:
        typeof parsed.message === 'string' && parsed.message.trim()
          ? parsed.message.trim()
          : fallbackMessage,
      nextStep:
        typeof parsed.nextStep === 'string' && parsed.nextStep.trim()
          ? parsed.nextStep.trim()
          : fallbackStep,
      data: parsed.data && typeof parsed.data === 'object' ? parsed.data : {},
      appointment: parsed.appointment && typeof parsed.appointment === 'object' ? parsed.appointment : null,
      newCustomer: parsed.newCustomer && typeof parsed.newCustomer === 'object' ? parsed.newCustomer : null,
    };
  }

  analyzeFeedbackHeuristically(feedbackText) {
    const text = (feedbackText || '').toLowerCase();

    const positiveWords = [
      'memnun',
      'harika',
      'iyi',
      'super',
      'süper',
      'hizli',
      'hızlı',
      'guleryuz',
      'güler yüz',
      'temiz',
      'tesekkur',
      'teşekkür',
    ];

    const negativeWords = [
      'kotu',
      'kötü',
      'berbat',
      'gec',
      'geç',
      'pahali',
      'pahalı',
      'rezalet',
      'memnun degil',
      'bekledim',
      'uzun surdu',
      'uzun sürdü',
    ];

    const topicsMap = {
      waiting: ['bekle', 'sira', 'sıra', 'gec', 'geç'],
      price: ['fiyat', 'ucret', 'ücret', 'pahali', 'pahalı'],
      service_quality: ['kesim', 'sakal', 'hizmet', 'temiz', 'kalite'],
      staff_attitude: ['davranis', 'davranış', 'guleryuz', 'güler yüz', 'personel'],
    };

    const positiveScore = positiveWords.filter((word) => text.includes(word)).length;
    const negativeScore = negativeWords.filter((word) => text.includes(word)).length;

    let sentiment = 'neutral';
    if (positiveScore > negativeScore) sentiment = 'positive';
    if (negativeScore > positiveScore) sentiment = 'negative';

    const mainTopics = Object.entries(topicsMap)
      .filter(([, keywords]) => keywords.some((word) => text.includes(word)))
      .map(([topic]) => topic);

    const confidence = Math.abs(positiveScore - negativeScore) + mainTopics.length;

    return {
      isConfident: confidence >= 2,
      data: {
        sentiment,
        mainTopics,
        suggestions: feedbackText,
      },
    };
  }

  async callMetaApi({ systemPrompt, messages, maxTokens, temperature }) {
    if (!this.metaApiKey) {
      throw new Error('META_AI_API_KEY tanımlı değil');
    }

    const chatMessages = [];

    if (systemPrompt) {
      chatMessages.push({ role: 'system', content: systemPrompt });
    }

    chatMessages.push(...this.normalizeMessages(messages, true));

    const response = await axios.post(
      `${this.metaBaseUrl}/chat/completions`,
      {
        model: this.metaModel,
        messages: chatMessages,
        max_tokens: maxTokens,
        temperature,
      },
      {
        headers: {
          Authorization: `Bearer ${this.metaApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: this.requestTimeoutMs,
      }
    );

    return this.extractTextFromMetaResponse(response.data);
  }

  async callAnthropicApi({ systemPrompt, messages, maxTokens }) {
    if (!this.anthropicClient) {
      throw new Error('CLAUDE_API_KEY tanımlı değil');
    }

    const message = await this.anthropicClient.messages.create({
      model: this.anthropicModel,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: this.normalizeMessages(messages, false),
    });

    return this.extractTextFromAnthropicResponse(message);
  }

  async createTextCompletion({ systemPrompt, messages, maxTokens = 300, temperature = 0.2 }) {
    const provider = this.resolveProvider();

    if (provider === 'meta') {
      try {
        return await this.callMetaApi({ systemPrompt, messages, maxTokens, temperature });
      } catch (error) {
        // Meta çağrısı hata verirse sistem tamamen düşmesin, Claude ile devam etsin
        if (this.anthropicClient) {
          console.warn('⚠️ Meta AI hatası, Claude fallback kullanılacak:', error.message);
          return this.callAnthropicApi({ systemPrompt, messages, maxTokens });
        }
        throw error;
      }
    }

    return this.callAnthropicApi({ systemPrompt, messages, maxTokens });
  }

  /**
   * Randevu detaylarından AI özeti oluştur
   */
  async generateAppointmentSummary(appointmentDetails) {
    try {
      if (!this.summaryWithModel) {
        return this.buildLocalAppointmentSummary(appointmentDetails);
      }

      const prompt = `
Aşağıdaki berber randevu detaylarından kısa ve profesyonel bir özet oluştur:

Müşteri: ${appointmentDetails.customerName}
Berber: ${appointmentDetails.barberName}
Hizmet: ${appointmentDetails.serviceType}
Tarih: ${new Date(appointmentDetails.appointmentDate).toLocaleDateString('tr-TR')}
Saat: ${new Date(appointmentDetails.appointmentDate).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
Süre: ${appointmentDetails.duration} dakika
Notlar: ${appointmentDetails.notes || 'Yok'}

Özet (maksimum 2 cümle):`;

      return await this.createTextCompletion({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 150,
        temperature: 0.2,
      });
    } catch (error) {
      console.error('❌ AI özet oluşturma hatası:', error.message);
      throw new Error(`AI özeti oluşturulamadı: ${error.message}`);
    }
  }

  /**
   * Müşteri talebini analiz et ve randevu önerisi yap
   */
  async analyzeCustomerRequest(customerMessage) {
    const heuristic = this.enableHeuristicRequestParsing
      ? this.analyzeCustomerRequestHeuristically(customerMessage)
      : null;

    try {
      if (heuristic?.isConfident) {
        return heuristic.data;
      }

      const prompt = `
Bir berber müşterisi tarafından gönderilen aşağıdaki mesajı analiz et ve:
1. İstenen hizmet türünü belirle (saç kesimi, tıraş, sakal kesimi vb.)
2. Tercih edilen tarih/saat varsa çıkar
3. Ek notları belirle

Müşteri mesajı: "${customerMessage}"

JSON formatında cevap ver:
{
  "serviceType": "hizmet türü",
  "preferredDate": "tarih (varsa)",
  "preferredTime": "saat (varsa)",
  "additionalNotes": "ek notlar"
}`;

      const responseText = await this.createTextCompletion({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 300,
        temperature: 0.1,
      });

      const parsed = this.extractJsonResponse(responseText, null);
      if (parsed) {
        return {
          serviceType:
            typeof parsed.serviceType === 'string' && parsed.serviceType.trim()
              ? parsed.serviceType
              : (heuristic?.data?.serviceType || 'haircut'),
          preferredDate:
            typeof parsed.preferredDate === 'string' && parsed.preferredDate.trim()
              ? parsed.preferredDate
              : (heuristic?.data?.preferredDate || null),
          preferredTime:
            typeof parsed.preferredTime === 'string' && parsed.preferredTime.trim()
              ? parsed.preferredTime
              : (heuristic?.data?.preferredTime || null),
          additionalNotes:
            typeof parsed.additionalNotes === 'string' && parsed.additionalNotes.trim()
              ? parsed.additionalNotes
              : customerMessage,
        };
      }
      
      return {
        serviceType: heuristic?.data?.serviceType || 'haircut',
        preferredDate: heuristic?.data?.preferredDate || null,
        preferredTime: heuristic?.data?.preferredTime || null,
        additionalNotes: customerMessage,
      };
    } catch (error) {
      console.error('❌ Müşteri talebi analizi hatası:', error.message);
      return {
        serviceType: heuristic?.data?.serviceType || 'haircut',
        preferredDate: heuristic?.data?.preferredDate || null,
        preferredTime: heuristic?.data?.preferredTime || null,
        additionalNotes: customerMessage,
      };
    }
  }

  /**
   * Berber için haftalık planlama önerisi oluştur
   */
  async generateWeeklySchedulingSuggestion(barberData) {
    try {
      const prompt = `
Aşağıdaki veriler doğrultusunda bir berber için haftalık planlama önerisi oluştur:

Berber: ${barberData.name}
Uzmanlıkları: ${barberData.specialties.join(', ')}
Çalışma Saatleri: ${barberData.workHours.start}:00 - ${barberData.workHours.end}:00
Toplam Randevu: ${barberData.totalAppointments}
Ortalama Süre: ${barberData.averageDuration} dakika

Profesyonel bir planlama önerisi (3-4 cümle):`;

      return await this.createTextCompletion({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 300,
        temperature: 0.3,
      });
    } catch (error) {
      console.error('❌ Planlama önerisi oluşturma hatası:', error.message);
      throw new Error(`Planlama önerisi oluşturulamadı: ${error.message}`);
    }
  }

  /**
   * Müşteri memnuniyeti çözümlemesi
   */
  async analyzeFeedback(feedbackText) {
    const heuristic = this.enableHeuristicFeedbackParsing
      ? this.analyzeFeedbackHeuristically(feedbackText)
      : null;

    try {
      if (heuristic?.isConfident) {
        return heuristic.data;
      }

      const prompt = `
Aşağıdaki müşteri geri bildirimini analiz et:

Geri Bildirim: "${feedbackText}"

Şunları belirle:
1. Genel duygu (pozitif/negatif/nötr)
2. Ana konular
3. Öneriler

JSON formatında cevap ver:
{
  "sentiment": "positive/negative/neutral",
  "mainTopics": ["konu1", "konu2"],
  "suggestions": "öneriler"
}`;

      const responseText = await this.createTextCompletion({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 300,
        temperature: 0.1,
      });

      const parsed = this.extractJsonResponse(responseText, null);
      if (parsed) {
        return {
          sentiment:
            typeof parsed.sentiment === 'string' && parsed.sentiment.trim()
              ? parsed.sentiment
              : (heuristic?.data?.sentiment || 'neutral'),
          mainTopics: Array.isArray(parsed.mainTopics)
            ? parsed.mainTopics
            : (heuristic?.data?.mainTopics || []),
          suggestions:
            typeof parsed.suggestions === 'string' && parsed.suggestions.trim()
              ? parsed.suggestions
              : feedbackText,
        };
      }
      
      return {
        sentiment: heuristic?.data?.sentiment || 'neutral',
        mainTopics: heuristic?.data?.mainTopics || [],
        suggestions: feedbackText,
      };
    } catch (error) {
      console.error('❌ Geri bildirim analizi hatası:', error.message);
      return {
        sentiment: heuristic?.data?.sentiment || 'neutral',
        mainTopics: heuristic?.data?.mainTopics || [],
        suggestions: feedbackText,
      };
    }
  }

  async generateConversationResponse(text, session, customer) {
    try {
      const customerName = customer ? customer.name : 'Müşteri';
      
      const systemPrompt = `Sen bir berber salonunun WhatsApp asistanısın. 
Samimi ve kısa cevaplar ver. Türkçe konuş.
Müşteri adı: ${customerName}
Mevcut adım: ${session.step}

Görevin:
- Randevu almak isteyeni yönlendir
- Uygun saat sor
- İsim al (yeni müşteriyse)
- Randevuyu onayla

JSON formatında cevap ver:
{
  "message": "müşteriye gönderilecek mesaj",
  "nextStep": "greeting/name/date/time/confirm/done",
  "data": {},
  "appointment": null,
  "newCustomer": null
}`;

      const responseText = await this.createTextCompletion({
        systemPrompt,
        messages: [
          ...session.history.slice(-this.conversationHistoryLimit),
          { role: 'user', content: text },
        ],
        maxTokens: 500,
        temperature: 0.4,
      });

      const parsed = this.extractJsonResponse(responseText, null);
      if (parsed) {
        return this.normalizeConversationResponse(parsed, session.step, responseText);
      }

      return {
        message: responseText,
        nextStep: session.step,
        data: {},
        appointment: null,
        newCustomer: null,
      };

    } catch (error) {
      console.error('❌ AI cevap hatası:', error.message);
      return {
        message: 'Şu an yoğunuz, birazdan tekrar dener misiniz?',
        nextStep: session.step,
        data: {},
        appointment: null,
        newCustomer: null,
      };
    }
  }
}
module.exports = new AIService();
