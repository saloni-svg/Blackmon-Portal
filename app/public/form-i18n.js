// Enrollment form: the "doesn't match your Winter Camp registration" messages in each portal language
// (the languages in chat-i18n.js). The rest of the form is in English.

const T = {
  en: {
    name: "This doesn't match the child's name on your Winter Camp registration. Please enter the same name you used when you signed up.",
    age: "This doesn't match the age on your Winter Camp registration. Please enter the same age you used when you signed up.",
    fix: "Please fix the highlighted fields. Need help? Call 469-261-1625.",
  },
  es: {
    name: "No coincide con el nombre del niño en su inscripción al Winter Camp. Escriba el mismo nombre que usó al inscribirse.",
    age: "No coincide con la edad en su inscripción al Winter Camp. Escriba la misma edad que usó al inscribirse.",
    fix: "Corrija los campos marcados. ¿Necesita ayuda? Llame al 469-261-1625.",
  },
  hi: {
    name: "यह आपके Winter Camp पंजीकरण में दिए गए बच्चे के नाम से मेल नहीं खाता। कृपया वही नाम लिखें जो आपने पंजीकरण के समय दिया था।",
    age: "यह आपके Winter Camp पंजीकरण में दी गई उम्र से मेल नहीं खाता। कृपया वही उम्र लिखें जो आपने पंजीकरण के समय दी थी।",
    fix: "कृपया चिह्नित फ़ील्ड ठीक करें। मदद चाहिए? 469-261-1625 पर कॉल करें।",
  },
  ur: {
    name: "یہ آپ کی Winter Camp رجسٹریشن میں دیے گئے بچے کے نام سے مطابقت نہیں رکھتا۔ براہِ کرم وہی نام لکھیں جو آپ نے رجسٹریشن کے وقت دیا تھا۔",
    age: "یہ آپ کی Winter Camp رجسٹریشن میں دی گئی عمر سے مطابقت نہیں رکھتی۔ براہِ کرم وہی عمر لکھیں جو آپ نے رجسٹریشن کے وقت دی تھی۔",
    fix: "براہِ کرم نمایاں کردہ خانے درست کریں۔ مدد چاہیے؟ 469-261-1625 پر کال کریں۔",
  },
  ar: {
    name: "هذا لا يطابق اسم الطفل في تسجيلك في Winter Camp. يُرجى إدخال الاسم نفسه الذي استخدمته عند التسجيل.",
    age: "هذا لا يطابق العمر في تسجيلك في Winter Camp. يُرجى إدخال العمر نفسه الذي استخدمته عند التسجيل.",
    fix: "يُرجى تصحيح الحقول المميّزة. هل تحتاج إلى مساعدة؟ اتصل على 469-261-1625.",
  },
  vi: {
    name: "Thông tin này không khớp với tên của trẻ trong đơn đăng ký Winter Camp của bạn. Vui lòng nhập đúng tên bạn đã dùng khi đăng ký.",
    age: "Thông tin này không khớp với tuổi trong đơn đăng ký Winter Camp của bạn. Vui lòng nhập đúng tuổi bạn đã dùng khi đăng ký.",
    fix: "Vui lòng sửa các ô được đánh dấu. Cần hỗ trợ? Gọi 469-261-1625.",
  },
  zh: {
    name: "与您 Winter Camp 报名时填写的孩子姓名不一致。请输入您报名时使用的姓名。",
    age: "与您 Winter Camp 报名时填写的年龄不一致。请输入您报名时使用的年龄。",
    fix: "请修改标出的栏目。需要帮助？请致电 469-261-1625。",
  },
  fr: {
    name: "Cela ne correspond pas au nom de l'enfant indiqué lors de l'inscription au Winter Camp. Veuillez saisir le même nom que lors de votre inscription.",
    age: "Cela ne correspond pas à l'âge indiqué lors de l'inscription au Winter Camp. Veuillez saisir le même âge que lors de votre inscription.",
    fix: "Veuillez corriger les champs signalés. Besoin d'aide ? Appelez le 469-261-1625.",
  },
};

export const enrollText = (code) => T[code] || T.en;

// Payment plan page: the "Your registration" card (labels; the item values come from the GHL invoice).
const PAY = {
  en: { location: "Location", title: "Your registration", paid: "Paid in full", length: "Length", package: "Package", includes: "Includes", campPackage: "Camp package", extendedCare: "Extended care", transport: "Transportation", subTotal: "Subtotal", discount: "Discount", fee: "Processing fee", totalPaid: "Total paid", balance: "Balance due", invoice: "Invoice", order: "Order", paidOn: "Paid", none: "Payment details will appear here after checkout.", error: "We couldn't load your payment right now. Please try again in a minute, or call 469-261-1625." },
  es: { location: "Ubicación", title: "Su inscripción", paid: "Pagado en su totalidad", length: "Duración", package: "Paquete", includes: "Incluye", campPackage: "Paquete del campamento", extendedCare: "Cuidado extendido", transport: "Transporte", subTotal: "Subtotal", discount: "Descuento", fee: "Cargo por procesamiento", totalPaid: "Total pagado", balance: "Saldo pendiente", invoice: "Factura", order: "Pedido", paidOn: "Pagado", none: "Los detalles del pago aparecerán aquí después de pagar.", error: "No pudimos cargar su pago en este momento. Inténtelo de nuevo en un minuto o llame al 469-261-1625." },
  hi: { location: "स्थान", title: "आपका पंजीकरण", paid: "पूरा भुगतान हो गया", length: "अवधि", package: "पैकेज", includes: "शामिल", campPackage: "कैंप पैकेज", extendedCare: "विस्तारित देखभाल", transport: "परिवहन", subTotal: "उप-योग", discount: "छूट", fee: "प्रोसेसिंग शुल्क", totalPaid: "कुल भुगतान", balance: "बकाया राशि", invoice: "इनवॉइस", order: "ऑर्डर", paidOn: "भुगतान", none: "चेकआउट के बाद भुगतान का विवरण यहाँ दिखेगा।", error: "अभी आपका भुगतान लोड नहीं हो सका। कृपया एक मिनट बाद फिर कोशिश करें, या 469-261-1625 पर कॉल करें।" },
  ur: { location: "مقام", title: "آپ کی رجسٹریشن", paid: "مکمل ادائیگی ہو گئی", length: "دورانیہ", package: "پیکج", includes: "شامل", campPackage: "کیمپ پیکج", extendedCare: "اضافی نگہداشت", transport: "ٹرانسپورٹ", subTotal: "ذیلی کل", discount: "رعایت", fee: "پروسیسنگ فیس", totalPaid: "کل ادائیگی", balance: "باقی رقم", invoice: "انوائس", order: "آرڈر", paidOn: "ادا شدہ", none: "چیک آؤٹ کے بعد ادائیگی کی تفصیلات یہاں نظر آئیں گی۔", error: "ابھی آپ کی ادائیگی لوڈ نہیں ہو سکی۔ براہِ کرم ایک منٹ بعد دوبارہ کوشش کریں، یا 469-261-1625 پر کال کریں۔" },
  ar: { location: "الموقع", title: "تسجيلك", paid: "مدفوع بالكامل", length: "المدة", package: "الباقة", includes: "تشمل", campPackage: "باقة المخيم", extendedCare: "الرعاية الممتدة", transport: "المواصلات", subTotal: "المجموع الفرعي", discount: "الخصم", fee: "رسوم المعالجة", totalPaid: "إجمالي المدفوع", balance: "الرصيد المستحق", invoice: "فاتورة", order: "طلب", paidOn: "مدفوع", none: "ستظهر تفاصيل الدفع هنا بعد إتمام الدفع.", error: "تعذّر تحميل دفعتك الآن. يُرجى المحاولة بعد دقيقة، أو الاتصال على 469-261-1625." },
  vi: { location: "Địa điểm", title: "Đăng ký của bạn", paid: "Đã thanh toán đủ", length: "Thời gian", package: "Gói", includes: "Bao gồm", campPackage: "Gói trại", extendedCare: "Chăm sóc mở rộng", transport: "Đưa đón", subTotal: "Tạm tính", discount: "Giảm giá", fee: "Phí xử lý", totalPaid: "Tổng đã trả", balance: "Số dư còn lại", invoice: "Hóa đơn", order: "Đơn hàng", paidOn: "Đã thanh toán", none: "Chi tiết thanh toán sẽ hiển thị ở đây sau khi thanh toán.", error: "Hiện không tải được thông tin thanh toán. Vui lòng thử lại sau một phút hoặc gọi 469-261-1625." },
  zh: { location: "地点", title: "您的报名", paid: "已全额付清", length: "时长", package: "套餐", includes: "包含", campPackage: "营地套餐", extendedCare: "延时看护", transport: "接送", subTotal: "小计", discount: "折扣", fee: "手续费", totalPaid: "已付总额", balance: "应付余额", invoice: "发票", order: "订单", paidOn: "付款于", none: "结账后，付款详情将显示在这里。", error: "暂时无法加载您的付款信息。请一分钟后重试，或致电 469-261-1625。" },
  fr: { location: "Lieu", title: "Votre inscription", paid: "Payé en totalité", length: "Durée", package: "Forfait", includes: "Comprend", campPackage: "Forfait du camp", extendedCare: "Garde prolongée", transport: "Transport", subTotal: "Sous-total", discount: "Remise", fee: "Frais de traitement", totalPaid: "Total payé", balance: "Solde dû", invoice: "Facture", order: "Commande", paidOn: "Payé le", none: "Les détails du paiement apparaîtront ici après le paiement.", error: "Impossible de charger votre paiement pour le moment. Réessayez dans une minute ou appelez le 469-261-1625." },
};
export const payText = (code) => PAY[code] || PAY.en;
