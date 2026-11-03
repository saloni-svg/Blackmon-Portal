// "Ask Blackmon" chat: the languages a parent can pick and the fixed chat wording in each.
// Shared by the browser (chat bubble) and the server (handoff reply). Answers themselves are
// written by the assistant in the chosen language.

export const LANGS = {
  en: { name: "English", dir: "ltr" },
  es: { name: "Español", dir: "ltr" },
  hi: { name: "हिन्दी", dir: "ltr" },
  ur: { name: "اردو", dir: "rtl" },
  ar: { name: "العربية", dir: "rtl" },
  vi: { name: "Tiếng Việt", dir: "ltr" },
  zh: { name: "中文", dir: "ltr" },
  fr: { name: "Français", dir: "ltr" },
};
// English names, for the assistant's instructions and the admin view.
export const LANG_EN = { en: "English", es: "Spanish", hi: "Hindi", ur: "Urdu", ar: "Arabic", vi: "Vietnamese", zh: "Chinese (Simplified)", fr: "French" };

const T = {
  en: {
    talk: "Talk", talkLabel: "Start a voice call with Ask Blackmon", endCall: "End call", mute: "Mute", unmute: "Unmute", connecting: "Connecting…", listening: "Listening…", speaking: "Speaking…", working: "Looking that up…", voiceStarted: "Voice call started", voiceEnded: "Voice call ended", voiceHint: "Speak naturally. Ask Blackmon listens again as soon as it finishes talking.", voiceGreet: "Hi! I'm Ask Blackmon. What would you like to know about camp?", micBlocked: "Microphone access is blocked. Allow the microphone in your browser, then try again.", voiceError: "The voice call couldn't connect. Please try again, or type your question.", voiceLimit: "Voice calls end automatically after 10 minutes.",
    title: "Ask Blackmon", open: "Ask a question", close: "Close", language: "Language", newChat: "New chat",
    intro: "Hi! Ask me anything about camp: hours, pickup, lunch, prices, documents or your enrollment.",
    starters: ["What time is pickup?", "Is lunch included for my child?", "What do I still need to do?"],
    placeholder: "Type your question…", send: "Send",
    human: "Talk to a person", humanConfirm: "Send this chat to the Blackmon team? Someone will contact you by phone or email.",
    humanYes: "Yes, send it", cancel: "Cancel", offerYes: "Yes, connect me with a person",
    humanDone: "Thanks! The Blackmon team has your chat and will contact you soon. For anything urgent, call 469-261-1625.",
    humanSent: "Sent to the Blackmon team", from: "From", helpful: "Helpful", notHelpful: "Not helpful",
    error: "Sorry, something went wrong. Please try again.", unavailable: "Ask Blackmon isn't available right now. Please call the camp office at 469-261-1625.", thinking: "Looking that up…",
    off: "The assistant isn't set up yet. You can still use “Talk to a person”, or call 469-261-1625.",
    disclaimer: "Answers come from Blackmon's camp information. For waivers, the signed document is what counts.",
  },
  es: {
    talk: "Hablar", talkLabel: "Iniciar una llamada de voz con Pregunta a Blackmon", endCall: "Terminar llamada", mute: "Silenciar", unmute: "Activar micrófono", connecting: "Conectando…", listening: "Escuchando…", speaking: "Hablando…", working: "Buscando…", voiceStarted: "Llamada de voz iniciada", voiceEnded: "Llamada de voz terminada", voiceHint: "Habla con naturalidad. Ask Blackmon vuelve a escucharte en cuanto termina de hablar.", voiceGreet: "¡Hola! Soy Ask Blackmon. ¿Qué te gustaría saber sobre el campamento?", micBlocked: "El acceso al micrófono está bloqueado. Permite el micrófono en tu navegador e inténtalo de nuevo.", voiceError: "No se pudo conectar la llamada de voz. Inténtalo de nuevo o escribe tu pregunta.", voiceLimit: "Las llamadas de voz terminan automáticamente a los 10 minutos.",
    title: "Pregunta a Blackmon", open: "Hacer una pregunta", close: "Cerrar", language: "Idioma", newChat: "Nuevo chat",
    intro: "¡Hola! Pregúntame lo que quieras sobre el campamento: horarios, recogida, almuerzo, precios, documentos o tu inscripción.",
    starters: ["¿A qué hora es la recogida?", "¿Mi hijo tiene el almuerzo incluido?", "¿Qué me falta por hacer?"],
    placeholder: "Escribe tu pregunta…", send: "Enviar",
    human: "Hablar con una persona", humanConfirm: "¿Enviar este chat al equipo de Blackmon? Alguien te contactará por teléfono o correo electrónico.",
    humanYes: "Sí, enviarlo", cancel: "Cancelar", offerYes: "Sí, comunícame con una persona",
    humanDone: "¡Gracias! El equipo de Blackmon tiene tu chat y te contactará pronto. Si es urgente, llama al 469-261-1625.",
    humanSent: "Enviado al equipo de Blackmon", from: "Fuente", helpful: "Útil", notHelpful: "No fue útil",
    error: "Lo sentimos, algo salió mal. Inténtalo de nuevo.", unavailable: "Ask Blackmon no está disponible en este momento. Llame a la oficina del campamento al 469-261-1625.", thinking: "Buscando…",
    off: "El asistente aún no está configurado. Puedes usar “Hablar con una persona” o llamar al 469-261-1625.",
    disclaimer: "Las respuestas provienen de la información del campamento de Blackmon. Para las exenciones, lo que cuenta es el documento firmado.",
  },
  hi: {
    talk: "बात करें", talkLabel: "Blackmon से वॉइस कॉल शुरू करें", endCall: "कॉल खत्म करें", mute: "म्यूट करें", unmute: "अनम्यूट करें", connecting: "कनेक्ट हो रहा है…", listening: "सुन रहे हैं…", speaking: "बोल रहे हैं…", working: "खोज रहे हैं…", voiceStarted: "वॉइस कॉल शुरू हुई", voiceEnded: "वॉइस कॉल खत्म हुई", voiceHint: "स्वाभाविक रूप से बोलें। Ask Blackmon अपनी बात पूरी करते ही फिर से आपको सुनेगा।", voiceGreet: "नमस्ते! मैं आस्क ब्लैकमॉन हूँ। आप कैंप के बारे में क्या जानना चाहेंगे?", micBlocked: "माइक्रोफ़ोन की अनुमति बंद है। ब्राउज़र में माइक्रोफ़ोन की अनुमति दें, फिर दोबारा कोशिश करें।", voiceError: "वॉइस कॉल कनेक्ट नहीं हो पाई। कृपया फिर से कोशिश करें या अपना सवाल लिखें।", voiceLimit: "वॉइस कॉल 10 मिनट बाद अपने आप खत्म हो जाती है।",
    title: "Blackmon से पूछें", open: "सवाल पूछें", close: "बंद करें", language: "भाषा", newChat: "नई चैट",
    intro: "नमस्ते! कैंप के बारे में कुछ भी पूछें: समय, पिकअप, लंच, कीमतें, दस्तावेज़ या आपका नामांकन।",
    starters: ["पिकअप कितने बजे है?", "क्या मेरे बच्चे का लंच शामिल है?", "मुझे अभी क्या करना बाकी है?"],
    placeholder: "अपना सवाल लिखें…", send: "भेजें",
    human: "किसी व्यक्ति से बात करें", humanConfirm: "क्या यह चैट Blackmon टीम को भेजें? कोई आपसे फ़ोन या ईमेल से संपर्क करेगा।",
    humanYes: "हाँ, भेजें", cancel: "रद्द करें", offerYes: "हाँ, मुझे किसी व्यक्ति से जोड़ें",
    humanDone: "धन्यवाद! Blackmon टीम के पास आपकी चैट है और वे जल्द ही आपसे संपर्क करेंगे। ज़रूरी हो तो 469-261-1625 पर कॉल करें।",
    humanSent: "Blackmon टीम को भेजा गया", from: "स्रोत", helpful: "मददगार", notHelpful: "मददगार नहीं",
    error: "माफ़ कीजिए, कुछ गलत हो गया। कृपया फिर से कोशिश करें।", unavailable: "Ask Blackmon अभी उपलब्ध नहीं है। कृपया कैंप कार्यालय को 469-261-1625 पर कॉल करें।", thinking: "खोज रहे हैं…",
    off: "सहायक अभी सेट नहीं है। आप “किसी व्यक्ति से बात करें” चुन सकते हैं या 469-261-1625 पर कॉल करें।",
    disclaimer: "जवाब Blackmon कैंप की जानकारी से आते हैं। वेवर के लिए, हस्ताक्षर किया गया दस्तावेज़ ही मान्य है।",
  },
  ur: {
    talk: "بات کریں", talkLabel: "Blackmon کے ساتھ وائس کال شروع کریں", endCall: "کال ختم کریں", mute: "خاموش کریں", unmute: "آواز کھولیں", connecting: "کنیکٹ ہو رہا ہے…", listening: "سن رہے ہیں…", speaking: "بول رہے ہیں…", working: "تلاش کر رہے ہیں…", voiceStarted: "وائس کال شروع ہوئی", voiceEnded: "وائس کال ختم ہوئی", voiceHint: "قدرتی انداز میں بات کریں۔ Ask Blackmon اپنی بات ختم کرتے ہی دوبارہ آپ کو سنے گا۔", voiceGreet: "السلام علیکم! میں آسک بلیک مون ہوں۔ آپ کیمپ کے بارے میں کیا جاننا چاہیں گے؟", micBlocked: "مائیکروفون کی اجازت بند ہے۔ براؤزر میں مائیکروفون کی اجازت دیں اور دوبارہ کوشش کریں۔", voiceError: "وائس کال کنیکٹ نہیں ہو سکی۔ دوبارہ کوشش کریں یا اپنا سوال لکھیں۔", voiceLimit: "وائس کال 10 منٹ بعد خود بخود ختم ہو جاتی ہے۔",
    title: "Blackmon سے پوچھیں", open: "سوال پوچھیں", close: "بند کریں", language: "زبان", newChat: "نئی چیٹ",
    intro: "السلام علیکم! کیمپ کے بارے میں کچھ بھی پوچھیں: اوقات، پک اپ، لنچ، قیمتیں، دستاویزات یا آپ کا اندراج۔",
    starters: ["پک اپ کتنے بجے ہے؟", "کیا میرے بچے کا لنچ شامل ہے؟", "مجھے ابھی کیا کرنا باقی ہے؟"],
    placeholder: "اپنا سوال لکھیں…", send: "بھیجیں",
    human: "کسی شخص سے بات کریں", humanConfirm: "کیا یہ چیٹ Blackmon ٹیم کو بھیج دیں؟ کوئی آپ سے فون یا ای میل کے ذریعے رابطہ کرے گا۔",
    humanYes: "ہاں، بھیج دیں", cancel: "منسوخ کریں", offerYes: "ہاں، مجھے کسی شخص سے ملائیں",
    humanDone: "شکریہ! Blackmon ٹیم کے پاس آپ کی چیٹ ہے اور وہ جلد آپ سے رابطہ کریں گے۔ فوری ضرورت ہو تو 469-261-1625 پر کال کریں۔",
    humanSent: "Blackmon ٹیم کو بھیج دیا گیا", from: "ماخذ", helpful: "مددگار", notHelpful: "مددگار نہیں",
    error: "معذرت، کچھ غلط ہو گیا۔ براہ کرم دوبارہ کوشش کریں۔", unavailable: "Ask Blackmon ابھی دستیاب نہیں ہے۔ براہ کرم کیمپ آفس کو 469-261-1625 پر کال کریں۔", thinking: "تلاش کر رہے ہیں…",
    off: "اسسٹنٹ ابھی سیٹ نہیں ہوا۔ آپ “کسی شخص سے بات کریں” استعمال کر سکتے ہیں یا 469-261-1625 پر کال کریں۔",
    disclaimer: "جوابات Blackmon کیمپ کی معلومات سے آتے ہیں۔ ویور کے لیے دستخط شدہ دستاویز ہی معتبر ہے۔",
  },
  ar: {
    talk: "تحدّث", talkLabel: "ابدأ مكالمة صوتية مع اسأل Blackmon", endCall: "إنهاء المكالمة", mute: "كتم الصوت", unmute: "إلغاء الكتم", connecting: "جارٍ الاتصال…", listening: "أستمع…", speaking: "أتحدث…", working: "جارٍ البحث…", voiceStarted: "بدأت المكالمة الصوتية", voiceEnded: "انتهت المكالمة الصوتية", voiceHint: "تحدّث بشكل طبيعي. يستمع إليك Ask Blackmon مجددًا فور انتهائه من الكلام.", voiceGreet: "مرحبًا! أنا آسك بلاكمون. ماذا تودّ أن تعرف عن المخيم؟", micBlocked: "الوصول إلى الميكروفون محظور. اسمح بالميكروفون في المتصفح ثم حاول مرة أخرى.", voiceError: "تعذّر الاتصال بالمكالمة الصوتية. حاول مرة أخرى أو اكتب سؤالك.", voiceLimit: "تنتهي المكالمات الصوتية تلقائياً بعد 10 دقائق.",
    title: "اسأل Blackmon", open: "اطرح سؤالاً", close: "إغلاق", language: "اللغة", newChat: "محادثة جديدة",
    intro: "مرحباً! اسألني أي شيء عن المخيم: المواعيد، الاستلام، الغداء، الأسعار، المستندات أو تسجيلك.",
    starters: ["متى موعد استلام الأطفال؟", "هل الغداء مشمول لطفلي؟", "ما الذي بقي عليّ فعله؟"],
    placeholder: "اكتب سؤالك…", send: "إرسال",
    human: "التحدث إلى شخص", humanConfirm: "هل ترسل هذه المحادثة إلى فريق Blackmon؟ سيتواصل معك أحدهم عبر الهاتف أو البريد الإلكتروني.",
    humanYes: "نعم، أرسلها", cancel: "إلغاء", offerYes: "نعم، صلني بشخص",
    humanDone: "شكراً! وصلت محادثتك إلى فريق Blackmon وسيتواصلون معك قريباً. للأمور العاجلة اتصل على 469-261-1625.",
    humanSent: "أُرسلت إلى فريق Blackmon", from: "المصدر", helpful: "مفيد", notHelpful: "غير مفيد",
    error: "عذراً، حدث خطأ ما. يرجى المحاولة مرة أخرى.", unavailable: "Ask Blackmon غير متاح الآن. يرجى الاتصال بمكتب المخيم على 469-261-1625.", thinking: "جارٍ البحث…",
    off: "المساعد غير مُعد بعد. يمكنك استخدام “التحدث إلى شخص” أو الاتصال على 469-261-1625.",
    disclaimer: "تأتي الإجابات من معلومات مخيم Blackmon. بالنسبة لنماذج الإعفاء، المستند الموقّع هو المعتمد.",
  },
  vi: {
    talk: "Nói", talkLabel: "Bắt đầu cuộc gọi thoại với Hỏi Blackmon", endCall: "Kết thúc cuộc gọi", mute: "Tắt tiếng", unmute: "Bật tiếng", connecting: "Đang kết nối…", listening: "Đang nghe…", speaking: "Đang nói…", working: "Đang tìm…", voiceStarted: "Đã bắt đầu cuộc gọi thoại", voiceEnded: "Đã kết thúc cuộc gọi thoại", voiceHint: "Hãy nói tự nhiên. Ask Blackmon sẽ nghe bạn ngay khi nói xong.", voiceGreet: "Xin chào! Tôi là Ask Blackmon. Bạn muốn biết gì về trại?", micBlocked: "Micrô đang bị chặn. Hãy cho phép micrô trong trình duyệt rồi thử lại.", voiceError: "Không thể kết nối cuộc gọi thoại. Vui lòng thử lại hoặc nhập câu hỏi.", voiceLimit: "Cuộc gọi thoại tự kết thúc sau 10 phút.",
    title: "Hỏi Blackmon", open: "Đặt câu hỏi", close: "Đóng", language: "Ngôn ngữ", newChat: "Cuộc trò chuyện mới",
    intro: "Xin chào! Hãy hỏi tôi bất cứ điều gì về trại: giờ giấc, đón con, bữa trưa, giá cả, giấy tờ hoặc việc ghi danh.",
    starters: ["Mấy giờ đón con?", "Con tôi có được bao gồm bữa trưa không?", "Tôi còn cần làm gì nữa?"],
    placeholder: "Nhập câu hỏi của bạn…", send: "Gửi",
    human: "Nói chuyện với nhân viên", humanConfirm: "Gửi cuộc trò chuyện này cho đội ngũ Blackmon? Sẽ có người liên hệ với bạn qua điện thoại hoặc email.",
    humanYes: "Có, gửi đi", cancel: "Hủy", offerYes: "Có, kết nối tôi với nhân viên",
    humanDone: "Cảm ơn bạn! Đội ngũ Blackmon đã nhận cuộc trò chuyện và sẽ sớm liên hệ. Nếu khẩn cấp, hãy gọi 469-261-1625.",
    humanSent: "Đã gửi cho đội ngũ Blackmon", from: "Nguồn", helpful: "Hữu ích", notHelpful: "Không hữu ích",
    error: "Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.", unavailable: "Ask Blackmon hiện không khả dụng. Vui lòng gọi văn phòng trại theo số 469-261-1625.", thinking: "Đang tìm…",
    off: "Trợ lý chưa được thiết lập. Bạn vẫn có thể chọn “Nói chuyện với nhân viên” hoặc gọi 469-261-1625.",
    disclaimer: "Câu trả lời dựa trên thông tin trại của Blackmon. Với giấy miễn trừ, văn bản đã ký là căn cứ.",
  },
  zh: {
    talk: "语音", talkLabel: "与问问 Blackmon 开始语音通话", endCall: "结束通话", mute: "静音", unmute: "取消静音", connecting: "正在连接…", listening: "正在聆听…", speaking: "正在说话…", working: "正在查找…", voiceStarted: "语音通话已开始", voiceEnded: "语音通话已结束", voiceHint: "自然地说话即可。Ask Blackmon 说完后会马上继续听您说。", voiceGreet: "您好！我是 Ask Blackmon。您想了解营地的哪些信息？", micBlocked: "麦克风权限被阻止。请在浏览器中允许使用麦克风，然后重试。", voiceError: "语音通话无法连接。请重试，或直接输入您的问题。", voiceLimit: "语音通话将在 10 分钟后自动结束。",
    title: "问问 Blackmon", open: "提问", close: "关闭", language: "语言", newChat: "新对话",
    intro: "您好！关于营地的任何问题都可以问我：时间、接送、午餐、价格、文件或报名情况。",
    starters: ["几点接孩子？", "我的孩子包含午餐吗？", "我还需要做什么？"],
    placeholder: "输入您的问题…", send: "发送",
    human: "联系工作人员", humanConfirm: "要把这段对话发送给 Blackmon 团队吗？工作人员会通过电话或电子邮件联系您。",
    humanYes: "是的，发送", cancel: "取消", offerYes: "是的，帮我联系工作人员",
    humanDone: "谢谢！Blackmon 团队已收到您的对话，会尽快联系您。如有急事，请致电 469-261-1625。",
    humanSent: "已发送给 Blackmon 团队", from: "来源", helpful: "有帮助", notHelpful: "没有帮助",
    error: "抱歉，出了点问题。请重试。", unavailable: "Ask Blackmon 目前无法使用。请致电营地办公室 469-261-1625。", thinking: "正在查找…",
    off: "助手尚未设置。您仍可选择“联系工作人员”，或致电 469-261-1625。",
    disclaimer: "回答来自 Blackmon 营地信息。关于弃权书，以签署的文件为准。",
  },
  fr: {
    talk: "Parler", talkLabel: "Démarrer un appel vocal avec Demandez à Blackmon", endCall: "Raccrocher", mute: "Couper le micro", unmute: "Activer le micro", connecting: "Connexion…", listening: "J'écoute…", speaking: "Je parle…", working: "Recherche en cours…", voiceStarted: "Appel vocal commencé", voiceEnded: "Appel vocal terminé", voiceHint: "Parlez naturellement. Ask Blackmon vous écoute de nouveau dès qu'il a fini de parler.", voiceGreet: "Bonjour ! Je suis Ask Blackmon. Que voulez-vous savoir sur le camp ?", micBlocked: "L'accès au micro est bloqué. Autorisez le micro dans votre navigateur, puis réessayez.", voiceError: "L'appel vocal n'a pas pu se connecter. Réessayez ou écrivez votre question.", voiceLimit: "Les appels vocaux se terminent automatiquement après 10 minutes.",
    title: "Demandez à Blackmon", open: "Poser une question", close: "Fermer", language: "Langue", newChat: "Nouvelle discussion",
    intro: "Bonjour ! Posez-moi vos questions sur le camp : horaires, récupération, déjeuner, tarifs, documents ou inscription.",
    starters: ["À quelle heure récupérer mon enfant ?", "Le déjeuner est-il inclus pour mon enfant ?", "Que me reste-t-il à faire ?"],
    placeholder: "Écrivez votre question…", send: "Envoyer",
    human: "Parler à une personne", humanConfirm: "Envoyer cette discussion à l'équipe Blackmon ? Quelqu'un vous contactera par téléphone ou par e-mail.",
    humanYes: "Oui, l'envoyer", cancel: "Annuler", offerYes: "Oui, mettez-moi en contact avec une personne",
    humanDone: "Merci ! L'équipe Blackmon a reçu votre discussion et vous contactera bientôt. En cas d'urgence, appelez le 469-261-1625.",
    humanSent: "Envoyé à l'équipe Blackmon", from: "Source", helpful: "Utile", notHelpful: "Pas utile",
    error: "Désolé, une erreur s'est produite. Veuillez réessayer.", unavailable: "Ask Blackmon n'est pas disponible pour le moment. Veuillez appeler le bureau du camp au 469-261-1625.", thinking: "Recherche en cours…",
    off: "L'assistant n'est pas encore configuré. Vous pouvez utiliser « Parler à une personne » ou appeler le 469-261-1625.",
    disclaimer: "Les réponses proviennent des informations du camp Blackmon. Pour les décharges, c'est le document signé qui fait foi.",
  },
};

export const chatLang = (code) => (LANGS[code] ? code : "en");
export const chatText = (code) => T[chatLang(code)];

// ----- Talk -----
// True when a voice-call transcript isn't real speech from the parent: no letters, letters in a
// script none of the chat languages use (the transcriber turns noise or the agent's own voice
// into words like "とり" or "Отлично"), or one of the transcriber's stock phrases for silence.
const STOCK = /thanks? (you )?for watching|please subscribe|like and subscribe|subtitles by|amara\.org/i;
export function voiceNoise(text) {
  const letters = String(text || "").match(/\p{L}/gu) || [];
  if (!letters.length) return true;
  if (letters.some((ch) => !/[\p{Script=Latin}\p{Script=Devanagari}\p{Script=Arabic}\p{Script=Han}]/u.test(ch))) return true;
  return STOCK.test(text);
}
