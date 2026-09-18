/**
 * THE PHRASE BANK.
 *
 * Every line a player is ever scored against, hand-written, per language.
 *
 * THE MODEL DOES NOT WRITE THESE, AND THAT IS THE MOST IMPORTANT DECISION IN
 * THE COMPILER.
 *
 * A generated scenario can afford a clumsy title or a flat persona. It cannot
 * afford a wrong key phrase: `scoreAttempt` aligns the player's speech against
 * these strings, so a phrase with a typo, a wrong verb ending or a
 * romanisation that does not match the script is a mission that CANNOT BE
 * COMPLETED — by anybody, ever, no matter how well they speak. The failure is
 * silent, it looks like the microphone is broken, and it would be discovered
 * on stage.
 *
 * WHERE THE STRINGS COME FROM
 *
 * Half of them are not new. Every district in the shipped game carries a vetted
 * six-line survival phrasebook — hello, how much, I need help, I don't
 * understand, say it slowly, thank you — and those map cleanly onto five of the
 * language functions this system drills. They are pulled straight from
 * `districts.ts` rather than retyped, so there is exactly one copy of each and
 * a correction in the game fixes the sim too.
 *
 * The rest — haggling, quantity, closing a deal, asking where something is —
 * do not exist in a survival phrasebook because you can survive a city without
 * them. Those are written here, and they are marked.
 *
 * `verified` IS NOT DECORATION
 *
 * It says whether a native speaker has read that language's market lines. At
 * the time of writing that is nobody. The field exists so the answer is visible
 * in the code rather than remembered, and so the UI can be honest about which
 * cities are demo-ready. Set it to `true` per language only after somebody has
 * actually read them out loud.
 */

import { SEED_DISTRICTS } from "@/lib/game/districts";
import type { LangCode } from "@/lib/sarvam";
import type { LanguageFunction, PhraseClass, PhraseSpec } from "../schema";

export type BankEntry = PhraseSpec & {
  /** Only offered for errands of this kind. `any` fits both. */
  scope: "buy" | "ask" | "any";
};

/**
 * Which survival phrase, by its English gloss, is which language function.
 *
 * Matched on the English rather than by index because the districts do not all
 * order their six the same way, and an index map would silently hand a Kannada
 * learner "thank you" where the engine wanted "how much".
 */
const SURVIVAL_MAP: { en: RegExp; klass: PhraseClass; drills: LanguageFunction; scope: BankEntry["scope"]; id: string }[] = [
  { en: /^hello$/i, klass: "greet", drills: "greet", scope: "any", id: "greet" },
  { en: /how much/i, klass: "ask", drills: "ask_price", scope: "buy", id: "price" },
  { en: /say it slowly|speak slowly/i, klass: "ask", drills: "clarify", scope: "any", id: "slow" },
  { en: /do not understand|don't understand/i, klass: "ask", drills: "clarify", scope: "any", id: "lost" },
  { en: /thank you/i, klass: "thank", drills: "thank", scope: "any", id: "thanks" },
];

/**
 * The market lines the survival phrasebook does not have.
 *
 * Short, high-frequency, and the plainest register in each language — a learner
 * who has just arrived should not be taught an idiom. NONE OF THESE HAS BEEN
 * READ BY A NATIVE SPEAKER. They are the first thing to check before a demo,
 * and they are all in one place so that check is one pass.
 */
type MarketLines = {
  reduce: [string, string];
  quantity: [string, string];
  close: [string, string];
  where: [string, string];
  /**
   * Fallbacks for the two functions a survival phrasebook may not carry.
   *
   * Old Delhi's six are hello / how much / too expensive / one cutting chai /
   * I need help / I am sorry — no "say it slowly" and no "thank you". Deriving
   * the bank purely from the districts therefore left Hindi, of all languages,
   * as the one city a scenario could not be compiled for.
   */
  repeat: [string, string];
  thanks: [string, string];
};

const MARKET: Record<string, MarketLines> = {
  "hi-IN": {
    reduce: ["थोड़ा कम करो", "thoda kam karo"],
    quantity: ["एक किलो देना", "ek kilo dena"],
    close: ["ठीक है, दे दो", "theek hai, de do"],
    repeat: ["फिर से बोलिए", "phir se boliye"],
    thanks: ["धन्यवाद", "dhanyavaad"],
    where: ["वो कहाँ है?", "wo kahaan hai?"],
  },
  "te-IN": {
    reduce: ["కొంచెం తగ్గించండి", "konchem tagginchandi"],
    quantity: ["ఒక కిలో ఇవ్వండి", "oka kilo ivvandi"],
    close: ["సరే, ఇస్తాను", "sare, istaanu"],
    repeat: ["మళ్ళీ చెప్పండి", "malli cheppandi"],
    thanks: ["ధన్యవాదాలు", "dhanyavaadaalu"],
    where: ["అది ఎక్కడ?", "adi ekkada?"],
  },
  "ta-IN": {
    reduce: ["கொஞ்சம் குறைங்க", "konjam kurainga"],
    quantity: ["ஒரு கிலோ குடுங்க", "oru kilo kudunga"],
    close: ["சரி, குடுங்க", "sari, kudunga"],
    repeat: ["மறுபடி சொல்லுங்க", "marubadi sollunga"],
    thanks: ["நன்றி", "nandri"],
    where: ["அது எங்கே?", "adhu enge?"],
  },
  "kn-IN": {
    reduce: ["ಸ್ವಲ್ಪ ಕಡಿಮೆ ಮಾಡಿ", "swalpa kadime maadi"],
    quantity: ["ಒಂದು ಕಿಲೋ ಕೊಡಿ", "ondu kilo kodi"],
    close: ["ಸರಿ, ಕೊಡಿ", "sari, kodi"],
    repeat: ["ಇನ್ನೊಮ್ಮೆ ಹೇಳಿ", "innomme heli"],
    thanks: ["ಧನ್ಯವಾದ", "dhanyavaada"],
    where: ["ಅದು ಎಲ್ಲಿದೆ?", "adu ellide?"],
  },
  "bn-IN": {
    reduce: ["একটু কম করুন", "ektu kom korun"],
    quantity: ["এক কিলো দিন", "ek kilo din"],
    close: ["ঠিক আছে, দিন", "thik achhe, din"],
    repeat: ["আবার বলুন", "abar bolun"],
    thanks: ["ধন্যবাদ", "dhonnobad"],
    where: ["ওটা কোথায়?", "ota kothay?"],
  },
  "ml-IN": {
    reduce: ["കുറച്ച് കുറയ്ക്കൂ", "kurachu kuraykku"],
    quantity: ["ഒരു കിലോ തരൂ", "oru kilo tharoo"],
    close: ["ശരി, തരൂ", "shari, tharoo"],
    repeat: ["ഒന്നുകൂടി പറയൂ", "onnukoodi parayoo"],
    thanks: ["നന്ദി", "nandi"],
    where: ["അത് എവിടെയാണ്?", "athu evideyaanu?"],
  },
  "mr-IN": {
    reduce: ["थोडं कमी करा", "thoda kami kara"],
    quantity: ["एक किलो द्या", "ek kilo dya"],
    close: ["ठीक आहे, द्या", "thik aahe, dya"],
    repeat: ["पुन्हा सांगा", "punha saanga"],
    thanks: ["धन्यवाद", "dhanyavaad"],
    where: ["ते कुठे आहे?", "te kuthe aahe?"],
  },
  "gu-IN": {
    reduce: ["થોડું ઓછું કરો", "thodu ochhu karo"],
    quantity: ["એક કિલો આપો", "ek kilo aapo"],
    close: ["સારું, આપો", "saaru, aapo"],
    repeat: ["ફરીથી કહો", "farithi kaho"],
    thanks: ["આભાર", "aabhaar"],
    where: ["તે ક્યાં છે?", "te kyaan chhe?"],
  },
  "pa-IN": {
    reduce: ["ਥੋੜ੍ਹਾ ਘੱਟ ਕਰੋ", "thoda ghatt karo"],
    quantity: ["ਇੱਕ ਕਿਲੋ ਦਿਓ", "ikk kilo dio"],
    close: ["ਠੀਕ ਹੈ, ਦਿਓ", "theek hai, dio"],
    repeat: ["ਫਿਰ ਦੱਸੋ", "phir dasso"],
    thanks: ["ਧੰਨਵਾਦ", "dhannvaad"],
    where: ["ਉਹ ਕਿੱਥੇ ਹੈ?", "oh kitthe hai?"],
  },
  "od-IN": {
    reduce: ["ଟିକେ କମ୍ କରନ୍ତୁ", "tike kam karantu"],
    quantity: ["ଗୋଟିଏ କିଲୋ ଦିଅନ୍ତୁ", "gotie kilo diantu"],
    close: ["ଠିକ୍ ଅଛି, ଦିଅନ୍ତୁ", "thik achhi, diantu"],
    repeat: ["ପୁଣି କୁହନ୍ତୁ", "puni kuhantu"],
    thanks: ["ଧନ୍ୟବାଦ", "dhanyabaad"],
    where: ["ସେଟା କେଉଁଠି?", "seta keunthi?"],
  },
};

/** Languages whose market lines a native speaker has signed off. */
const VERIFIED = new Set<string>([]);

function buildBank(language: string): BankEntry[] {
  const district = SEED_DISTRICTS.find((d) => d.language === language);
  const out: BankEntry[] = [];

  // The vetted half, lifted from the game bible rather than retyped.
  for (const rule of SURVIVAL_MAP) {
    const hit = district?.phrases.find((p) => rule.en.test(p.en));
    if (!hit) continue;
    out.push({
      id: `${language}_${rule.id}`,
      native: hit.native,
      roman: hit.roman,
      gloss: hit.en,
      klass: rule.klass,
      drills: rule.drills,
      scope: rule.scope,
    });
  }

  // The market half, written here.
  const m = MARKET[language];
  if (m) {
    out.push(
      { id: `${language}_reduce`, native: m.reduce[0], roman: m.reduce[1], gloss: "come down a little", klass: "haggle", drills: "negotiate", scope: "buy" },
      { id: `${language}_qty`, native: m.quantity[0], roman: m.quantity[1], gloss: "give me one kilo", klass: "close", drills: "specify_quantity", scope: "buy" },
      { id: `${language}_close`, native: m.close[0], roman: m.close[1], gloss: "alright, I'll take it", klass: "close", drills: "negotiate", scope: "buy" },
      { id: `${language}_where`, native: m.where[0], roman: m.where[1], gloss: "where is it?", klass: "ask", drills: "ask_location", scope: "ask" }
    );
    // Only if the district's own six did not already supply them, so a
    // language never carries two ways of saying thank you and the scorer
    // never counts one utterance against both.
    if (!out.some((p) => p.drills === "clarify")) {
      out.push({ id: `${language}_repeat`, native: m.repeat[0], roman: m.repeat[1], gloss: "say it again", klass: "ask", drills: "clarify", scope: "any" });
    }
    if (!out.some((p) => p.drills === "thank")) {
      out.push({ id: `${language}_thanks`, native: m.thanks[0], roman: m.thanks[1], gloss: "thank you", klass: "thank", drills: "thank", scope: "any" });
    }
  }
  return out;
}

const CACHE = new Map<string, BankEntry[]>();

export function bankFor(language: string): BankEntry[] {
  let bank = CACHE.get(language);
  if (!bank) {
    bank = buildBank(language);
    if (!bank.length) bank = buildBank("hi-IN");
    CACHE.set(language, bank);
  }
  return bank;
}

/**
 * Every language a scenario can be compiled into.
 *
 * A language qualifies when it has a district (for the survival phrases, the
 * theme and the script), market lines here, and a font the boards can be
 * painted in. All ten districts now clear that bar; they did not before, and
 * the three that did are why the gate exists at all.
 */
export const COMPILABLE_LANGUAGES: LangCode[] = SEED_DISTRICTS.filter(
  (d) => MARKET[d.language] && buildBank(d.language).length >= 8
).map((d) => d.language);

/** Whether a native speaker has read this language's market lines. */
export function isVerified(language: string): boolean {
  return VERIFIED.has(language);
}

/**
 * The phrases one errand is scored against.
 *
 * Always a greeting, always a way to close, and then whatever the errand kind
 * needs. `extra` is how an obstacle adds its own — a mishearing vendor needs
 * "say it again" to be offerable, or the run has a wall in it.
 */
export function phrasesForErrand(
  language: string,
  kind: "buy" | "ask",
  extra: LanguageFunction[] = []
): PhraseSpec[] {
  const bank = bankFor(language);
  const pick = (fn: LanguageFunction, klass?: PhraseClass) =>
    bank.find(
      (p) =>
        p.drills === fn &&
        (klass ? p.klass === klass : true) &&
        (p.scope === "any" || p.scope === kind)
    );

  const wanted: (BankEntry | undefined)[] =
    kind === "buy"
      ? [pick("greet"), pick("ask_price"), pick("negotiate", "haggle"), pick("specify_quantity"), pick("negotiate", "close")]
      : [pick("greet"), pick("ask_location"), pick("clarify"), pick("thank")];

  for (const fn of extra) wanted.push(pick(fn));

  const seen = new Set<string>();
  return wanted
    .filter((p): p is BankEntry => !!p)
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .map(({ scope: _scope, ...spec }) => spec);
}

/** Every phrase of a language, for `Scenario.phrases`. */
export function allPhrases(language: string): PhraseSpec[] {
  return bankFor(language).map(({ scope: _scope, ...spec }) => spec);
}
