/**
 * WHAT CAN BE BOUGHT, AND WHO SELLS IT.
 *
 * Authored, not derived from `STALLS[kind].tags`. Every lens that needed a
 * goods list reached for those tags first, and re-reading the registry shows
 * why that fails: tags are search descriptors, not objects. `ground_sheet`
 * carries `['floor', 'sabzi', 'cheap']`, so a tag-membership check waves
 * through "buy a floor for thirty-five rupees" and "buy cheap". `pot_stall`
 * and `plastic_stall` both carry `household`. `bangle_stall` carries `gift`.
 *
 * So this table is the closed catalogue for goods, and it is the only list a
 * generated mission may name an item from. Tags stay what they are.
 *
 * `fish_stall` and `ground_sheet` deliberately carry no mission good. The
 * ground sheet exists as the cheap fallback route, and a fishmonger persona is
 * the one most likely to go somewhere nobody wants it to in front of judges.
 */

import type { LangCode } from "@/lib/sarvam";

export type Good = {
  id: string;
  /** The one stall kind that sells it, as a key of `STALLS`. */
  stallKind: string;
  /** What the vendor quotes in: a kilo, a piece, a set. */
  unit: string;
  /** English, for the mission card. */
  gloss: string;
  /**
   * The word the vendor would use, in every language the product ships.
   *
   * TOTAL, not partial, and for the same reason `say.ts` is: this was three
   * languages with a silent fallback to the good's English id, so a Punjabi
   * world told its own shopkeeper she sold "tomato" — in her brief, in her
   * stock list, in the sentence she was meant to answer questions about. The
   * model papered over it by knowing the word anyway, which is exactly how a
   * gap like this survives a demo.
   */
  native: Record<LangCode, string>;
};

export const GOODS: Good[] = [
  { id: "tomato", stallKind: "veg_stall", unit: "kilo", gloss: "tomatoes", native: {
      "hi-IN": "टमाटर",
      "ta-IN": "தக்காளி",
      "te-IN": "టమాటా",
      "kn-IN": "ಟೊಮೇಟೊ",
      "ml-IN": "തക്കാളി",
      "mr-IN": "टोमॅटो",
      "gu-IN": "ટમેટાં",
      "bn-IN": "টমেটো",
      "pa-IN": "ਟਮਾਟਰ",
      "od-IN": "ଟମାଟୋ",
      "en-IN": "tomatoes",
    } },
  { id: "mango", stallKind: "fruit_stall", unit: "dozen", gloss: "mangoes", native: {
      "hi-IN": "आम",
      "ta-IN": "மாம்பழம்",
      "te-IN": "మామిడి",
      "kn-IN": "ಮಾವಿನಹಣ್ಣು",
      "ml-IN": "മാങ്ങ",
      "mr-IN": "आंबा",
      "gu-IN": "કેરી",
      "bn-IN": "আম",
      "pa-IN": "ਅੰਬ",
      "od-IN": "ଆମ୍ବ",
      "en-IN": "mangoes",
    } },
  { id: "masala", stallKind: "spice_stall", unit: "packet", gloss: "spice mix", native: {
      "hi-IN": "मसाला",
      "ta-IN": "மசாலா",
      "te-IN": "మసాలా",
      "kn-IN": "ಮಸಾಲೆ",
      "ml-IN": "മസാല",
      "mr-IN": "मसाला",
      "gu-IN": "મસાલો",
      "bn-IN": "মশলা",
      "pa-IN": "ਮਸਾਲਾ",
      "od-IN": "ମସଲା",
      "en-IN": "spice mix",
    } },
  { id: "saree", stallKind: "cloth_stall", unit: "piece", gloss: "a saree", native: {
      "hi-IN": "साड़ी",
      "ta-IN": "புடவை",
      "te-IN": "చీర",
      "kn-IN": "ಸೀರೆ",
      "ml-IN": "സാരി",
      "mr-IN": "साडी",
      "gu-IN": "સાડી",
      "bn-IN": "শাড়ি",
      "pa-IN": "ਸਾੜੀ",
      "od-IN": "ଶାଢ଼ୀ",
      "en-IN": "a saree",
    } },
  { id: "bangles", stallKind: "bangle_stall", unit: "set", gloss: "bangles", native: {
      "hi-IN": "चूड़ियाँ",
      "ta-IN": "வளையல்",
      "te-IN": "గాజులు",
      "kn-IN": "ಬಳೆ",
      "ml-IN": "വളകൾ",
      "mr-IN": "बांगड्या",
      "gu-IN": "બંગડી",
      "bn-IN": "চুড়ি",
      "pa-IN": "ਵੰਗਾਂ",
      "od-IN": "ଚୁଡ଼ି",
      "en-IN": "bangles",
    } },
  { id: "chai", stallKind: "chai_tapri", unit: "glass", gloss: "tea", native: {
      "hi-IN": "चाय",
      "ta-IN": "டீ",
      "te-IN": "చాయ్",
      "kn-IN": "ಚಹಾ",
      "ml-IN": "ചായ",
      "mr-IN": "चहा",
      "gu-IN": "ચા",
      "bn-IN": "চা",
      "pa-IN": "ਚਾਹ",
      "od-IN": "ଚା",
      "en-IN": "tea",
    } },
  { id: "bucket", stallKind: "plastic_stall", unit: "piece", gloss: "a bucket", native: {
      "hi-IN": "बाल्टी",
      "ta-IN": "வாளி",
      "te-IN": "బకెట్",
      "kn-IN": "ಬಕೆಟ್",
      "ml-IN": "ബക്കറ്റ്",
      "mr-IN": "बादली",
      "gu-IN": "ડોલ",
      "bn-IN": "বালতি",
      "pa-IN": "ਬਾਲਟੀ",
      "od-IN": "ବାଲଟି",
      "en-IN": "a bucket",
    } },
  { id: "garland", stallKind: "flower_stall", unit: "moora", gloss: "a flower garland", native: {
      "hi-IN": "फूलों की माला",
      "ta-IN": "மாலை",
      "te-IN": "పూలదండ",
      "kn-IN": "ಹೂವಿನ ಹಾರ",
      "ml-IN": "പൂമാല",
      "mr-IN": "फुलांचा हार",
      "gu-IN": "ફૂલોનો હાર",
      "bn-IN": "ফুলের মালা",
      "pa-IN": "ਫੁੱਲਾਂ ਦਾ ਹਾਰ",
      "od-IN": "ଫୁଲମାଳ",
      "en-IN": "a flower garland",
    } },
  { id: "tumbler", stallKind: "pot_stall", unit: "set", gloss: "steel tumblers", native: {
      "hi-IN": "गिलास",
      "ta-IN": "டம்ளர்",
      "te-IN": "గ్లాసులు",
      "kn-IN": "ಲೋಟ",
      "ml-IN": "ഗ്ലാസ്",
      "mr-IN": "ग्लास",
      "gu-IN": "ગ્લાસ",
      "bn-IN": "গ্লাস",
      "pa-IN": "ਗਿਲਾਸ",
      "od-IN": "ଗ୍ଲାସ",
      "en-IN": "steel tumblers",
    } },
  { id: "coconut", stallKind: "coconut_stall", unit: "piece", gloss: "a tender coconut", native: {
      "hi-IN": "नारियल",
      "ta-IN": "இளநீர்",
      "te-IN": "కొబ్బరి",
      "kn-IN": "ಎಳನೀರು",
      "ml-IN": "ഇളനീർ",
      "mr-IN": "शहाळे",
      "gu-IN": "નાળિયેર",
      "bn-IN": "ডাব",
      "pa-IN": "ਨਾਰੀਅਲ",
      "od-IN": "ଡାବ",
      "en-IN": "a tender coconut",
    } },

  // Not sold from a stall. `stallKind` is what the BAZAAR binder needs; the
  // station binds its cast to counter windows in order and ignores it.
  { id: "ticket", stallKind: "counter", unit: "ticket", gloss: "a train ticket", native: {
      "hi-IN": "टिकट",
      "ta-IN": "டிக்கெட்",
      "te-IN": "టికెట్",
      "kn-IN": "ಟಿಕೆಟ್",
      "ml-IN": "ടിക്കറ്റ്",
      "mr-IN": "तिकीट",
      "gu-IN": "ટિકિટ",
      "bn-IN": "টিকিট",
      "pa-IN": "ਟਿਕਟ",
      "od-IN": "ଟିକଟ",
      "en-IN": "a train ticket",
    } },
];

export function goodById(id: string): Good | null {
  return GOODS.find((g) => g.id === id) ?? null;
}
