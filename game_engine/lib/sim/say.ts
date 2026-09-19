/**
 * EVERYTHING THE ENGINE SAYS OUT LOUD, IN EVERY LANGUAGE IT CAN BE PLAYED IN.
 *
 * Most of what a character says is written by the model. A handful of lines are
 * not, and never should be: the price, because the model naming a number is the
 * one failure this architecture exists to prevent; the refusals, because they
 * are said precisely when the model described something that did not happen;
 * and the opening, because a first sentence generated in the wrong script is a
 * world that looks broken before anybody has spoken.
 *
 * WHY THIS FILE EXISTS
 *
 * Those lines lived in three tables in two files, and every one of them covered
 * Telugu, Hindi and Tamil and fell back to Hindi for the rest. Nobody noticed,
 * because the only worlds anybody played were Telugu. Then somebody opened
 * Amritsar:
 *
 *     आइए, क्या चाहिए?        <- her opening, in Hindi
 *     ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ।           <- the player, correctly, in Punjabi
 *     नमस्ते! क्या चाहिए?      <- her reply, in Hindi again
 *
 * The second Hindi line is the first one twice: her model reply was in Gurmukhi
 * or not, `looksLikeTargetScript` refused it, and the fallback is her opening —
 * which was Hindi. One missing table entry, and seven of the ten languages this
 * product ships were quietly being played in a different language by the
 * shopkeeper.
 *
 * A LANGUAGE IS EITHER FINISHED OR IT DOES NOT COMPILE
 *
 * `Record<LangCode, Pack>` is the whole point of the rewrite. Not a lookup with
 * a fallback — a total map, so adding an eleventh language to `LangCode` breaks
 * the build until somebody writes its thirteen sentences. The fallback was the
 * bug: it turned "nobody has done this yet" into "it works, quietly wrong".
 *
 * These are hand-written and NOT yet native-verified, exactly like the market
 * phrases in `compile/phrasebank.ts`. That is a real gap and it is tracked in
 * the same place — see `VERIFIED` there, still empty. A wrong sentence in the
 * right script is a much smaller wrong than a right sentence in the wrong
 * language, which is what this replaces.
 */

import type { LangCode } from "@/lib/sarvam";

/** Why the engine refused an act. Each needs a sentence in every language. */
export const REFUSAL_REASONS = [
  "below_floor",
  "no_assent",
  "not_the_language",
  "no_money",
  "no_stock",
  "not_mine",
  "dont_know",
  "away",
  "generic",
] as const;

export type RefusalReason = (typeof REFUSAL_REASONS)[number];

/**
 * The things a character can be asked, and therefore must be able to answer.
 *
 * An `ask` errand is one of the two mission templates, and until now the only
 * scenario whose characters could actually answer one was the hand-written
 * bazaar. Every COMPILED world declared the fact, gave somebody the key, and
 * told them nothing — so `tell` was refused for `dont_know` on every attempt
 * and half the mission templates were unwinnable in every generated world, in
 * every language, including Telugu.
 *
 * Mirrors `InfoKey` in `compile/compile.ts`, which is the list of things the
 * scenario model is allowed to invent an errand about.
 */
export const INFO_KEYS = [
  "stall_location",
  "closing_time",
  "platform_number",
  "train_time",
  "best_price_today",
] as const;

export type InfoKey = (typeof INFO_KEYS)[number];

export type SayPack = {
  /** A stallholder's first sentence. */
  openStall: { native: string; roman: string; en: string };
  /** A counter clerk's first sentence. A ticket window is a different job. */
  openCounter: { native: string; roman: string; en: string };
  /** Answering a greeting when the engine had to replace her words. */
  greetBack: { native: string; en: string };
  /** The price, said by the engine because the model may not name numbers. */
  price: (amount: number) => string;
  refusals: Record<RefusalReason, string>;
  /**
   * What she says when asked. `about` is the one thing that varies — a name, a
   * platform, an hour, a price — and the engine supplies it from the world, so
   * the sentence is hers and the fact in it is not.
   */
  answers: Record<InfoKey, (about: string) => string>;
};

/**
 * Total, deliberately. See the note above: TypeScript is the check that stops
 * a language shipping half-written.
 */
export const SAY: Record<LangCode, SayPack> = {
  "hi-IN": {
    openStall: { native: "आइए, क्या चाहिए?", roman: "Aaiye, kya chaahiye?", en: "Come — what do you need?" },
    openCounter: { native: "कहाँ जाना है?", roman: "Kahaan jaana hai?", en: "Where to?" },
    greetBack: { native: "नमस्ते! क्या चाहिए?", en: "Hello! What do you need?" },
    price: (n) => `एक किलो ₹${n} का है। कितना चाहिए?`,
    refusals: {
      below_floor: "इतने में नहीं हो पाएगा।",
      no_assent: "क्या कहा? फिर से बोलिए।",
      not_the_language: "हिंदी में बोलिए ना।",
      no_money: "इतने पैसे तो नहीं हैं आपके पास।",
      no_stock: "वो खतम हो गया।",
      not_mine: "वो मेरे पास नहीं है।",
      dont_know: "मुझे नहीं मालूम।",
      away: "अभी आया।",
      generic: "नहीं हो पाएगा।",
    },
    answers: {
      stall_location: (about) => `${about} की दुकान इसी गली में आगे, दाईं तरफ़ है।`,
      closing_time: (about) => `${about} बजे दुकान बंद हो जाती है।`,
      platform_number: (about) => `प्लेटफ़ॉर्म ${about}, उधर से।`,
      train_time: (about) => `गाड़ी ${about} बजे जाती है।`,
      best_price_today: (about) => `आज का भाव ₹${about} चल रहा है।`,
    },
  },

  "te-IN": {
    openStall: { native: "రండి, ఏం కావాలి?", roman: "Randi, em kaavaali?", en: "Come — what do you need?" },
    openCounter: { native: "ఎక్కడికి?", roman: "Ekkadiki?", en: "Where to?" },
    greetBack: { native: "నమస్కారం! ఏమి కావాలి?", en: "Hello! What do you need?" },
    price: (n) => `ఒక కిలో ₹${n} అండి. మీకు ఎన్ని కావాలి?`,
    refusals: {
      below_floor: "అంత తక్కువకు కుదరదు అండి.",
      no_assent: "ఏమన్నారు? మళ్ళీ చెప్పండి.",
      not_the_language: "తెలుగులో చెప్పండి అండి.",
      no_money: "డబ్బు సరిపోదు కదా?",
      no_stock: "అది అయిపోయింది.",
      not_mine: "అది నా దగ్గర లేదు.",
      dont_know: "నాకు తెలియదు అండి.",
      away: "ఇప్పుడే వస్తాను.",
      generic: "కుదరదు అండి.",
    },
    answers: {
      stall_location: (about) => `${about} దుకాణం ఈ సందులో ముందుకు, కుడి వైపు ఉంది.`,
      closing_time: (about) => `${about} గంటలకు మూసేస్తాం.`,
      platform_number: (about) => `ప్లాట్‌ఫారం ${about}, అటు వైపు.`,
      train_time: (about) => `రైలు ${about} గంటలకు వెళ్తుంది.`,
      best_price_today: (about) => `ఈరోజు రేటు ₹${about} నడుస్తోంది.`,
    },
  },

  "ta-IN": {
    openStall: { native: "வாங்க, என்ன வேணும்?", roman: "Vaanga, enna venum?", en: "Come — what do you need?" },
    openCounter: { native: "எங்கே போகணும்?", roman: "Enge poganum?", en: "Where to?" },
    greetBack: { native: "வணக்கம்! என்ன வேணும்?", en: "Hello! What do you need?" },
    price: (n) => `ஒரு கிலோ ₹${n}. உங்களுக்கு எவ்வளவு வேணும்?`,
    refusals: {
      below_floor: "அவ்வளவு குறைவா முடியாது.",
      no_assent: "என்ன சொன்னீங்க? மறுபடி சொல்லுங்க.",
      not_the_language: "தமிழ்ல சொல்லுங்க.",
      no_money: "காசு போதாதே?",
      no_stock: "அது தீர்ந்துபோச்சு.",
      not_mine: "அது என்கிட்ட இல்லை.",
      dont_know: "எனக்குத் தெரியாது.",
      away: "இப்போ வரேன்.",
      generic: "முடியாது.",
    },
    answers: {
      stall_location: (about) => `${about} கடை இந்த தெருவில் முன்னால், வலது பக்கம் இருக்கு.`,
      closing_time: (about) => `${about} மணிக்கு கடையை மூடிடுவோம்.`,
      platform_number: (about) => `பிளாட்ஃபார்ம் ${about}, அந்தப் பக்கம்.`,
      train_time: (about) => `ரயில் ${about} மணிக்கு போகும்.`,
      best_price_today: (about) => `இன்றைக்கு ரேட் ₹${about} போகுது.`,
    },
  },

  "kn-IN": {
    openStall: { native: "ಬನ್ನಿ, ಏನು ಬೇಕು?", roman: "Banni, enu beku?", en: "Come — what do you need?" },
    openCounter: { native: "ಎಲ್ಲಿಗೆ ಹೋಗಬೇಕು?", roman: "Ellige hogabeku?", en: "Where to?" },
    greetBack: { native: "ನಮಸ್ಕಾರ! ಏನು ಬೇಕು?", en: "Hello! What do you need?" },
    price: (n) => `ಒಂದು ಕಿಲೋಗೆ ₹${n}. ನಿಮಗೆ ಎಷ್ಟು ಬೇಕು?`,
    refusals: {
      below_floor: "ಅಷ್ಟು ಕಡಿಮೆಗೆ ಆಗಲ್ಲ.",
      no_assent: "ಏನಂದ್ರಿ? ಇನ್ನೊಮ್ಮೆ ಹೇಳಿ.",
      not_the_language: "ಕನ್ನಡದಲ್ಲಿ ಹೇಳಿ.",
      no_money: "ಅಷ್ಟು ದುಡ್ಡು ನಿಮ್ಮ ಹತ್ರ ಇಲ್ಲ.",
      no_stock: "ಅದು ಖಾಲಿಯಾಗಿದೆ.",
      not_mine: "ಅದು ನನ್ನ ಹತ್ರ ಇಲ್ಲ.",
      dont_know: "ನನಗೆ ಗೊತ್ತಿಲ್ಲ.",
      away: "ಈಗ ಬಂದೆ.",
      generic: "ಆಗಲ್ಲ.",
    },
    answers: {
      stall_location: (about) => `${about} ಅಂಗಡಿ ಈ ಬೀದಿಯಲ್ಲಿ ಮುಂದೆ, ಬಲಗಡೆ ಇದೆ.`,
      closing_time: (about) => `${about} ಗಂಟೆಗೆ ಅಂಗಡಿ ಮುಚ್ಚುತ್ತೇವೆ.`,
      platform_number: (about) => `ಪ್ಲಾಟ್‌ಫಾರ್ಮ್ ${about}, ಆ ಕಡೆ.`,
      train_time: (about) => `ರೈಲು ${about} ಗಂಟೆಗೆ ಹೊರಡುತ್ತದೆ.`,
      best_price_today: (about) => `ಇವತ್ತಿನ ರೇಟು ₹${about} ಇದೆ.`,
    },
  },

  "bn-IN": {
    openStall: { native: "আসুন, কী লাগবে?", roman: "Aasun, ki laagbe?", en: "Come — what do you need?" },
    openCounter: { native: "কোথায় যাবেন?", roman: "Kothay jaaben?", en: "Where to?" },
    greetBack: { native: "নমস্কার! কী লাগবে?", en: "Hello! What do you need?" },
    price: (n) => `এক কিলো ₹${n}। কত লাগবে?`,
    refusals: {
      below_floor: "অত কমে হবে না।",
      no_assent: "কী বললেন? আবার বলুন।",
      not_the_language: "বাংলায় বলুন।",
      no_money: "অত টাকা তো আপনার কাছে নেই।",
      no_stock: "ওটা শেষ হয়ে গেছে।",
      not_mine: "ওটা আমার কাছে নেই।",
      dont_know: "আমি জানি না।",
      away: "এখনই আসছি।",
      generic: "হবে না।",
    },
    answers: {
      stall_location: (about) => `${about}-এর দোকান এই গলিতে আরও এগিয়ে, ডান দিকে।`,
      closing_time: (about) => `${about}টার সময় দোকান বন্ধ হয়ে যায়।`,
      platform_number: (about) => `প্ল্যাটফর্ম ${about}, ওই দিকে।`,
      train_time: (about) => `ট্রেন ${about}টায় ছাড়ে।`,
      best_price_today: (about) => `আজকের দর ₹${about} চলছে।`,
    },
  },

  "ml-IN": {
    openStall: { native: "വരൂ, എന്താ വേണ്ടത്?", roman: "Varoo, enthaa vendath?", en: "Come — what do you need?" },
    openCounter: { native: "എങ്ങോട്ടാണ്?", roman: "Engottaanu?", en: "Where to?" },
    greetBack: { native: "നമസ്കാരം! എന്താ വേണ്ടത്?", en: "Hello! What do you need?" },
    price: (n) => `ഒരു കിലോ ₹${n}. എത്ര വേണം?`,
    refusals: {
      below_floor: "അത്രയും കുറച്ച് പറ്റില്ല.",
      no_assent: "എന്താ പറഞ്ഞേ? ഒന്നൂടെ പറയൂ.",
      not_the_language: "മലയാളത്തിൽ പറയൂ.",
      no_money: "അത്രയും കാശ് കയ്യിൽ ഇല്ലല്ലോ.",
      no_stock: "അത് തീർന്നു.",
      not_mine: "അത് എന്റെ കയ്യിൽ ഇല്ല.",
      dont_know: "എനിക്ക് അറിയില്ല.",
      away: "ഇപ്പോൾ വരാം.",
      generic: "പറ്റില്ല.",
    },
    answers: {
      stall_location: (about) => `${about}യുടെ കട ഈ ഇടവഴിയിൽ മുന്നോട്ട്, വലതു വശത്താണ്.`,
      closing_time: (about) => `${about} മണിക്ക് കട അടയ്ക്കും.`,
      platform_number: (about) => `പ്ലാറ്റ്‌ഫോം ${about}, ആ വഴി.`,
      train_time: (about) => `വണ്ടി ${about} മണിക്ക് പോകും.`,
      best_price_today: (about) => `ഇന്നത്തെ വില ₹${about} ആണ്.`,
    },
  },

  "mr-IN": {
    openStall: { native: "या, काय हवं?", roman: "Yaa, kaay havam?", en: "Come — what do you need?" },
    openCounter: { native: "कुठे जायचंय?", roman: "Kuthe jaaychay?", en: "Where to?" },
    greetBack: { native: "नमस्कार! काय हवं?", en: "Hello! What do you need?" },
    price: (n) => `एक किलो ₹${n}. किती हवं?`,
    refusals: {
      below_floor: "एवढ्या कमीत नाही जमणार.",
      no_assent: "काय म्हणालात? पुन्हा सांगा.",
      not_the_language: "मराठीत बोला ना.",
      no_money: "एवढे पैसे तुमच्याकडे नाहीत.",
      no_stock: "ते संपलं.",
      not_mine: "ते माझ्याकडे नाही.",
      dont_know: "मला माहीत नाही.",
      away: "आलोच.",
      generic: "नाही जमणार.",
    },
    answers: {
      stall_location: (about) => `${about} चं दुकान याच गल्लीत पुढे, उजव्या बाजूला आहे.`,
      closing_time: (about) => `${about} वाजता दुकान बंद होतं.`,
      platform_number: (about) => `प्लॅटफॉर्म ${about}, तिकडून.`,
      train_time: (about) => `गाडी ${about} वाजता सुटते.`,
      best_price_today: (about) => `आजचा भाव ₹${about} चालू आहे.`,
    },
  },

  "gu-IN": {
    openStall: { native: "આવો, શું જોઈએ?", roman: "Aavo, shu joiye?", en: "Come — what do you need?" },
    openCounter: { native: "ક્યાં જવું છે?", roman: "Kyaan javu chhe?", en: "Where to?" },
    greetBack: { native: "નમસ્તે! શું જોઈએ?", en: "Hello! What do you need?" },
    price: (n) => `એક કિલો ₹${n}. કેટલું જોઈએ?`,
    refusals: {
      below_floor: "આટલામાં નહીં થાય.",
      no_assent: "શું કહ્યું? ફરી કહો.",
      not_the_language: "ગુજરાતીમાં કહો ને.",
      no_money: "આટલા પૈસા તમારી પાસે નથી.",
      no_stock: "એ ખતમ થઈ ગયું.",
      not_mine: "એ મારી પાસે નથી.",
      dont_know: "મને ખબર નથી.",
      away: "હમણાં આવ્યો.",
      generic: "નહીં થાય.",
    },
    answers: {
      stall_location: (about) => `${about}ની દુકાન આ ગલીમાં આગળ, જમણી બાજુ છે.`,
      closing_time: (about) => `${about} વાગ્યે દુકાન બંધ થઈ જાય છે.`,
      platform_number: (about) => `પ્લેટફોર્મ ${about}, એ બાજુ.`,
      train_time: (about) => `ટ્રેન ${about} વાગ્યે ઉપડે છે.`,
      best_price_today: (about) => `આજનો ભાવ ₹${about} ચાલે છે.`,
    },
  },

  "pa-IN": {
    openStall: { native: "ਆਓ, ਕੀ ਚਾਹੀਦਾ ਹੈ?", roman: "Aao, ki chaahida hai?", en: "Come — what do you need?" },
    openCounter: { native: "ਕਿੱਥੇ ਜਾਣਾ ਹੈ?", roman: "Kitthe jaana hai?", en: "Where to?" },
    greetBack: { native: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਕੀ ਚਾਹੀਦਾ ਹੈ?", en: "Hello! What do you need?" },
    price: (n) => `ਇੱਕ ਕਿਲੋ ₹${n} ਦਾ ਹੈ। ਕਿੰਨਾ ਚਾਹੀਦਾ ਹੈ?`,
    refusals: {
      below_floor: "ਐਨੇ ਘੱਟ ਵਿੱਚ ਨਹੀਂ ਹੋਣਾ।",
      no_assent: "ਕੀ ਕਿਹਾ? ਫਿਰ ਦੱਸੋ।",
      not_the_language: "ਪੰਜਾਬੀ ਵਿੱਚ ਦੱਸੋ ਨਾ।",
      no_money: "ਐਨੇ ਪੈਸੇ ਤਾਂ ਤੁਹਾਡੇ ਕੋਲ ਨਹੀਂ।",
      no_stock: "ਉਹ ਮੁੱਕ ਗਿਆ।",
      not_mine: "ਉਹ ਮੇਰੇ ਕੋਲ ਨਹੀਂ।",
      dont_know: "ਮੈਨੂੰ ਨਹੀਂ ਪਤਾ।",
      away: "ਹੁਣੇ ਆਇਆ।",
      generic: "ਨਹੀਂ ਹੋਣਾ।",
    },
    answers: {
      stall_location: (about) => `${about} ਦੀ ਦੁਕਾਨ ਇਸੇ ਗਲੀ ਵਿੱਚ ਅੱਗੇ, ਸੱਜੇ ਪਾਸੇ ਹੈ।`,
      closing_time: (about) => `${about} ਵਜੇ ਦੁਕਾਨ ਬੰਦ ਹੋ ਜਾਂਦੀ ਹੈ।`,
      platform_number: (about) => `ਪਲੇਟਫਾਰਮ ${about}, ਉਸ ਪਾਸੇ।`,
      train_time: (about) => `ਗੱਡੀ ${about} ਵਜੇ ਜਾਂਦੀ ਹੈ।`,
      best_price_today: (about) => `ਅੱਜ ਦਾ ਭਾਅ ₹${about} ਚੱਲ ਰਿਹਾ ਹੈ।`,
    },
  },

  "od-IN": {
    openStall: { native: "ଆସନ୍ତୁ, କଣ ଦରକାର?", roman: "Aasantu, kana darkaar?", en: "Come — what do you need?" },
    openCounter: { native: "କେଉଁଠି ଯିବେ?", roman: "Keunthi jibe?", en: "Where to?" },
    greetBack: { native: "ନମସ୍କାର! କଣ ଦରକାର?", en: "Hello! What do you need?" },
    price: (n) => `ଗୋଟିଏ କିଲୋ ₹${n}। କେତେ ଦରକାର?`,
    refusals: {
      below_floor: "ଏତେ କମ୍‌ରେ ହେବ ନାହିଁ।",
      no_assent: "କଣ କହିଲେ? ପୁଣି କୁହନ୍ତୁ।",
      not_the_language: "ଓଡ଼ିଆରେ କୁହନ୍ତୁ।",
      no_money: "ଏତେ ଟଙ୍କା ଆପଣଙ୍କ ପାଖରେ ନାହିଁ।",
      no_stock: "ସେଟା ସରିଗଲା।",
      not_mine: "ସେଟା ମୋ ପାଖରେ ନାହିଁ।",
      dont_know: "ମୋତେ ଜଣା ନାହିଁ।",
      away: "ଏବେ ଆସୁଛି।",
      generic: "ହେବ ନାହିଁ।",
    },
    answers: {
      stall_location: (about) => `${about}ଙ୍କ ଦୋକାନ ଏହି ଗଳିରେ ଆଗକୁ, ଡାହାଣ ପଟେ ଅଛି।`,
      closing_time: (about) => `${about}ଟାରେ ଦୋକାନ ବନ୍ଦ ହୋଇଯାଏ।`,
      platform_number: (about) => `ପ୍ଲାଟଫର୍ମ ${about}, ସେ ପଟେ।`,
      train_time: (about) => `ଟ୍ରେନ୍ ${about}ଟାରେ ଯାଏ।`,
      best_price_today: (about) => `ଆଜିର ଦର ₹${about} ଚାଲୁଛି।`,
    },
  },

  // No scenario compiles into English — `COMPILABLE_LANGUAGES` is built from the
  // Indic districts. It is here because the map is total, and a total map is
  // the only version of this that cannot rot.
  "en-IN": {
    openStall: { native: "Come in — what do you need?", roman: "", en: "Come in — what do you need?" },
    openCounter: { native: "Where to?", roman: "", en: "Where to?" },
    greetBack: { native: "Hello! What do you need?", en: "Hello! What do you need?" },
    price: (n) => `One kilo is ₹${n}. How many would you like?`,
    refusals: {
      below_floor: "I cannot go that low.",
      no_assent: "What did you say? Say it again.",
      not_the_language: "Say it in my language.",
      no_money: "You do not have enough for that.",
      no_stock: "That has run out.",
      not_mine: "I do not sell that.",
      dont_know: "I do not know.",
      away: "I will be back in a moment.",
      generic: "That cannot be done.",
    },
    answers: {
      stall_location: (about) => `${about}'s stall is further down this lane, on the right.`,
      closing_time: (about) => `We shut at ${about}.`,
      platform_number: (about) => `Platform ${about}, that way.`,
      train_time: (about) => `The train goes at ${about}.`,
      best_price_today: (about) => `Today's going rate is ₹${about}.`,
    },
  },
};

/**
 * The pack for a language.
 *
 * Still a lookup with a default, because `language` arrives as a string from a
 * compiled scenario and TypeScript cannot follow it that far. The difference
 * from what this replaced is that the default is now unreachable for every
 * language the product actually ships.
 */
export function sayIn(language: string): SayPack {
  return SAY[language as LangCode] ?? SAY["hi-IN"];
}
