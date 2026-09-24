/**
 * Connect locales — typical website languages.
 * First visit: language gate. Later: Settings.
 */

export type Locale =
  | "de"
  | "en"
  | "fr"
  | "es"
  | "it"
  | "pt"
  | "nl"
  | "pl"
  | "tr"
  | "sv"
  | "ja"
  | "zh"
  | "ko"
  | "ru"
  | "ar";

export type LocaleOption = {
  code: Locale;
  /** Native name shown in the picker */
  label: string;
  /** Short hint under the label */
  hint: string;
};

/** Order: DE/EN first, then common EU, then global. */
export const LOCALE_OPTIONS: LocaleOption[] = [
  { code: "de", label: "Deutsch", hint: "Weiter auf Deutsch" },
  { code: "en", label: "English", hint: "Continue in English" },
  { code: "fr", label: "Français", hint: "Continuer en français" },
  { code: "es", label: "Español", hint: "Continuar en español" },
  { code: "it", label: "Italiano", hint: "Continua in italiano" },
  { code: "pt", label: "Português", hint: "Continuar em português" },
  { code: "nl", label: "Nederlands", hint: "Doorgaan in het Nederlands" },
  { code: "pl", label: "Polski", hint: "Kontynuuj po polsku" },
  { code: "tr", label: "Türkçe", hint: "Türkçe devam et" },
  { code: "sv", label: "Svenska", hint: "Fortsätt på svenska" },
  { code: "ja", label: "日本語", hint: "日本語で続ける" },
  { code: "zh", label: "中文", hint: "用中文继续" },
  { code: "ko", label: "한국어", hint: "한국어로 계속" },
  { code: "ru", label: "Русский", hint: "Продолжить на русском" },
  { code: "ar", label: "العربية", hint: "المتابعة بالعربية" },
];

const LOCALE_SET = new Set<string>(LOCALE_OPTIONS.map((o) => o.code));

const KEY = "connect.locale";
const EVENT = "connect-locale-changed";

export function isLocale(value: string | null | undefined): value is Locale {
  return typeof value === "string" && LOCALE_SET.has(value);
}

export function getLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  return isLocale(raw) ? raw : null;
}

export function setLocale(locale: Locale): Locale {
  window.localStorage.setItem(KEY, locale);
  window.document.documentElement.lang = locale;
  window.document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  window.dispatchEvent(new Event(EVENT));
  return locale;
}

export function subscribeLocale(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export type MessageKey =
  | "lang.title"
  | "lang.subtitle"
  | "lang.continue"
  | "browser.local"
  | "browser.cloud"
  | "browser.mode"
  | "settings.language"
  | "settings.donate"
  | "marketplace.title"
  | "marketplace.find"
  | "company.sell"
  | "company.buy"
  | "employees.sell"
  | "pin"
  | "unpin"
  | "post"
  | "stock.live";

type Table = Record<MessageKey, string>;

const DE: Table = {
  "lang.title": "Sprache wählen",
  "lang.subtitle":
    "Connect in deiner Sprache — jederzeit in den Einstellungen änderbar.",
  "lang.continue": "Weiter",
  "browser.local": "Browser lokal",
  "browser.cloud": "Browser cloud",
  "browser.mode": "Browser-Modus",
  "settings.language": "Sprache",
  "settings.donate": "Spenden machen",
  "marketplace.title": "Marketplace",
  "marketplace.find": "Bots und Unternehmen finden — Kauf beim Anbieter.",
  "company.sell": "Unternehmen verkaufen",
  "company.buy": "Unternehmen kaufen",
  "employees.sell": "Mitarbeiter listen",
  pin: "Anpinnen",
  unpin: "Loslösen",
  post: "Posten",
  "stock.live": "Live-Kurs",
};

const EN: Table = {
  "lang.title": "Choose language",
  "lang.subtitle": "Use Connect in your language — change anytime in Settings.",
  "lang.continue": "Continue",
  "browser.local": "Browser local",
  "browser.cloud": "Browser cloud",
  "browser.mode": "Browser mode",
  "settings.language": "Language",
  "settings.donate": "Donate",
  "marketplace.title": "Marketplace",
  "marketplace.find": "Find bots and companies — buy on the seller’s site.",
  "company.sell": "Sell company",
  "company.buy": "Buy company",
  "employees.sell": "List employees",
  pin: "Pin",
  unpin: "Unpin",
  post: "Post",
  "stock.live": "Live quote",
};

const FR: Table = {
  "lang.title": "Choisir la langue",
  "lang.subtitle":
    "Utilisez Connect dans votre langue — modifiable à tout moment.",
  "lang.continue": "Continuer",
  "browser.local": "Navigateur local",
  "browser.cloud": "Navigateur cloud",
  "browser.mode": "Mode navigateur",
  "settings.language": "Langue",
  "settings.donate": "Faire un don",
  "marketplace.title": "Marketplace",
  "marketplace.find":
    "Trouver bots et entreprises — achat chez le vendeur.",
  "company.sell": "Vendre l’entreprise",
  "company.buy": "Acheter l’entreprise",
  "employees.sell": "Lister les employés",
  pin: "Épingler",
  unpin: "Désépingler",
  post: "Publier",
  "stock.live": "Cours en direct",
};

const ES: Table = {
  "lang.title": "Elegir idioma",
  "lang.subtitle":
    "Usa Connect en tu idioma — cámbialo cuando quieras en Ajustes.",
  "lang.continue": "Continuar",
  "browser.local": "Navegador local",
  "browser.cloud": "Navegador cloud",
  "browser.mode": "Modo de navegador",
  "settings.language": "Idioma",
  "settings.donate": "Donar",
  "marketplace.title": "Marketplace",
  "marketplace.find":
    "Busca bots y empresas — compra en la página del vendedor.",
  "company.sell": "Vender empresa",
  "company.buy": "Comprar empresa",
  "employees.sell": "Listar empleados",
  pin: "Fijar",
  unpin: "Desfijar",
  post: "Publicar",
  "stock.live": "Cotización en vivo",
};

const IT: Table = {
  "lang.title": "Scegli la lingua",
  "lang.subtitle":
    "Usa Connect nella tua lingua — modificabile in qualsiasi momento.",
  "lang.continue": "Continua",
  "browser.local": "Browser locale",
  "browser.cloud": "Browser cloud",
  "browser.mode": "Modalità browser",
  "settings.language": "Lingua",
  "settings.donate": "Dona",
  "marketplace.title": "Marketplace",
  "marketplace.find":
    "Trova bot e aziende — acquisto sul sito del venditore.",
  "company.sell": "Vendi azienda",
  "company.buy": "Compra azienda",
  "employees.sell": "Elenca dipendenti",
  pin: "Fissa",
  unpin: "Togli",
  post: "Pubblica",
  "stock.live": "Quotazione live",
};

const PT: Table = {
  "lang.title": "Escolher idioma",
  "lang.subtitle":
    "Use o Connect no seu idioma — altere a qualquer momento.",
  "lang.continue": "Continuar",
  "browser.local": "Navegador local",
  "browser.cloud": "Navegador cloud",
  "browser.mode": "Modo do navegador",
  "settings.language": "Idioma",
  "settings.donate": "Doar",
  "marketplace.title": "Marketplace",
  "marketplace.find":
    "Encontre bots e empresas — compre no site do vendedor.",
  "company.sell": "Vender empresa",
  "company.buy": "Comprar empresa",
  "employees.sell": "Listar funcionários",
  pin: "Fixar",
  unpin: "Desafixar",
  post: "Publicar",
  "stock.live": "Cotação ao vivo",
};

const NL: Table = {
  "lang.title": "Taal kiezen",
  "lang.subtitle":
    "Gebruik Connect in jouw taal — altijd te wijzigen in Instellingen.",
  "lang.continue": "Doorgaan",
  "browser.local": "Browser lokaal",
  "browser.cloud": "Browser cloud",
  "browser.mode": "Browsermodus",
  "settings.language": "Taal",
  "settings.donate": "Doneren",
  "marketplace.title": "Marketplace",
  "marketplace.find":
    "Vind bots en bedrijven — koop op de site van de verkoper.",
  "company.sell": "Bedrijf verkopen",
  "company.buy": "Bedrijf kopen",
  "employees.sell": "Medewerkers listen",
  pin: "Vastzetten",
  unpin: "Losmaken",
  post: "Plaatsen",
  "stock.live": "Live koers",
};

const PL: Table = {
  "lang.title": "Wybierz język",
  "lang.subtitle":
    "Używaj Connect w swoim języku — zmień w ustawieniach w dowolnym momencie.",
  "lang.continue": "Kontynuuj",
  "browser.local": "Przeglądarka lokalna",
  "browser.cloud": "Przeglądarka cloud",
  "browser.mode": "Tryb przeglądarki",
  "settings.language": "Język",
  "settings.donate": "Wesprzyj",
  "marketplace.title": "Marketplace",
  "marketplace.find":
    "Szukaj botów i firm — kup na stronie sprzedawcy.",
  "company.sell": "Sprzedaj firmę",
  "company.buy": "Kup firmę",
  "employees.sell": "Wystaw pracowników",
  pin: "Przypnij",
  unpin: "Odepnij",
  post: "Opublikuj",
  "stock.live": "Kurs na żywo",
};

const TR: Table = {
  "lang.title": "Dil seç",
  "lang.subtitle":
    "Connect’i kendi dilinde kullan — istediğin zaman Ayarlar’dan değiştir.",
  "lang.continue": "Devam",
  "browser.local": "Yerel tarayıcı",
  "browser.cloud": "Bulut tarayıcı",
  "browser.mode": "Tarayıcı modu",
  "settings.language": "Dil",
  "settings.donate": "Bağış yap",
  "marketplace.title": "Marketplace",
  "marketplace.find":
    "Bot ve şirket bul — satın alma satıcının sitesinde.",
  "company.sell": "Şirketi sat",
  "company.buy": "Şirket satın al",
  "employees.sell": "Çalışanları listele",
  pin: "Sabitle",
  unpin: "Kaldır",
  post: "Paylaş",
  "stock.live": "Canlı kur",
};

const SV: Table = {
  "lang.title": "Välj språk",
  "lang.subtitle":
    "Använd Connect på ditt språk — ändra när som helst i Inställningar.",
  "lang.continue": "Fortsätt",
  "browser.local": "Lokal webbläsare",
  "browser.cloud": "Molnwebbläsare",
  "browser.mode": "Webbläsarläge",
  "settings.language": "Språk",
  "settings.donate": "Donera",
  "marketplace.title": "Marketplace",
  "marketplace.find":
    "Hitta bots och företag — köp på säljarens sida.",
  "company.sell": "Sälj företag",
  "company.buy": "Köp företag",
  "employees.sell": "Lista medarbetare",
  pin: "Fäst",
  unpin: "Lossa",
  post: "Publicera",
  "stock.live": "Livekurs",
};

const JA: Table = {
  "lang.title": "言語を選択",
  "lang.subtitle": "Connect をあなたの言語で — 設定からいつでも変更できます。",
  "lang.continue": "続ける",
  "browser.local": "ローカルブラウザ",
  "browser.cloud": "クラウドブラウザ",
  "browser.mode": "ブラウザモード",
  "settings.language": "言語",
  "settings.donate": "寄付する",
  "marketplace.title": "マーケットプレイス",
  "marketplace.find": "ボットと企業を探す — 購入は出品者のサイトで。",
  "company.sell": "企業を売る",
  "company.buy": "企業を買う",
  "employees.sell": "従業員を出品",
  pin: "ピン留め",
  unpin: "ピン解除",
  post: "投稿",
  "stock.live": "ライブ相場",
};

const ZH: Table = {
  "lang.title": "选择语言",
  "lang.subtitle": "用你的语言使用 Connect — 可随时在设置中更改。",
  "lang.continue": "继续",
  "browser.local": "本地浏览器",
  "browser.cloud": "云浏览器",
  "browser.mode": "浏览器模式",
  "settings.language": "语言",
  "settings.donate": "捐赠",
  "marketplace.title": "市场",
  "marketplace.find": "查找机器人与公司 — 在卖家页面购买。",
  "company.sell": "出售公司",
  "company.buy": "购买公司",
  "employees.sell": "上架员工",
  pin: "置顶",
  unpin: "取消置顶",
  post: "发布",
  "stock.live": "实时行情",
};

const KO: Table = {
  "lang.title": "언어 선택",
  "lang.subtitle": "Connect를 내 언어로 — 설정에서 언제든 변경할 수 있습니다.",
  "lang.continue": "계속",
  "browser.local": "로컬 브라우저",
  "browser.cloud": "클라우드 브라우저",
  "browser.mode": "브라우저 모드",
  "settings.language": "언어",
  "settings.donate": "기부하기",
  "marketplace.title": "마켓플레이스",
  "marketplace.find": "봇과 회사를 찾기 — 판매자 사이트에서 구매.",
  "company.sell": "회사 판매",
  "company.buy": "회사 구매",
  "employees.sell": "직원 등록",
  pin: "고정",
  unpin: "고정 해제",
  post: "게시",
  "stock.live": "실시간 시세",
};

const RU: Table = {
  "lang.title": "Выберите язык",
  "lang.subtitle":
    "Используйте Connect на своём языке — можно изменить в настройках.",
  "lang.continue": "Продолжить",
  "browser.local": "Локальный браузер",
  "browser.cloud": "Облачный браузер",
  "browser.mode": "Режим браузера",
  "settings.language": "Язык",
  "settings.donate": "Пожертвовать",
  "marketplace.title": "Маркетплейс",
  "marketplace.find":
    "Ищите ботов и компании — покупка на сайте продавца.",
  "company.sell": "Продать компанию",
  "company.buy": "Купить компанию",
  "employees.sell": "Выставить сотрудников",
  pin: "Закрепить",
  unpin: "Открепить",
  post: "Опубликовать",
  "stock.live": "Живой курс",
};

const AR: Table = {
  "lang.title": "اختر اللغة",
  "lang.subtitle": "استخدم Connect بلغتك — يمكن التغيير في أي وقت من الإعدادات.",
  "lang.continue": "متابعة",
  "browser.local": "متصفح محلي",
  "browser.cloud": "متصفح سحابي",
  "browser.mode": "وضع المتصفح",
  "settings.language": "اللغة",
  "settings.donate": "تبرّع",
  "marketplace.title": "السوق",
  "marketplace.find": "ابحث عن البوتات والشركات — الشراء لدى البائع.",
  "company.sell": "بيع الشركة",
  "company.buy": "شراء الشركة",
  "employees.sell": "عرض الموظفين",
  pin: "تثبيت",
  unpin: "إلغاء التثبيت",
  post: "نشر",
  "stock.live": "سعر مباشر",
};

const TABLES: Record<Locale, Table> = {
  de: DE,
  en: EN,
  fr: FR,
  es: ES,
  it: IT,
  pt: PT,
  nl: NL,
  pl: PL,
  tr: TR,
  sv: SV,
  ja: JA,
  zh: ZH,
  ko: KO,
  ru: RU,
  ar: AR,
};

export function t(key: MessageKey, locale?: Locale | null): string {
  const loc = locale ?? getLocale() ?? "de";
  return TABLES[loc]?.[key] ?? TABLES.en[key] ?? TABLES.de[key] ?? key;
}

export function localeLabel(code: Locale): string {
  return LOCALE_OPTIONS.find((o) => o.code === code)?.label ?? code;
}
