import { NextResponse } from "next/server";
import { sarvamTTS, V3_SPEAKERS, type LangCode } from "@/lib/sarvam";
import { DEFAULT_SCENARIO_ID, scenarioById } from "@/lib/sim/scenarios";
import { recallScenario } from "@/lib/sim/compile/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * A voice for a simulation character.
 *
 * Separate from `/api/speak`, which resolves its speaker by looking the NPC up
 * in a district — the sim's cast lives in a `Scenario` and carries its own
 * `speaker`, so that route cannot serve it without being taught about
 * scenarios, and teaching it would couple the shipped game to this one.
 *
 * The client sends a character id, never a speaker id and never a language.
 * Both are read from the scenario here, server-side: a caller that could name
 * its own speaker could put any voice on any character, and a caller that could
 * name its own language could ask Bulbul to read Telugu as Hindi.
 *
 * Voice is a separate round trip from the turn, deliberately, and for the reason
 * `/api/speak` already records: folding TTS into the dialogue call makes every
 * line take five seconds to appear. Subtitles go up immediately; the audio
 * catches up.
 */
export async function POST(req: Request) {
  let body: {
    characterId?: string;
    text?: string;
    scenarioId?: string;
    /**
     * Whose voice. "coach" reads a line from the phrase bank aloud so the
     * learner can hear what they are about to attempt — which is the whole
     * point of a speaking exercise and was missing.
     *
     * A ROLE, NOT A SPEAKER ID. The rule below still holds: a caller cannot
     * name a voice, because a caller that could would put any voice on any
     * character. It can only say which of two jobs this line is doing, and the
     * server picks the voice.
     */
    role?: "character" | "coach";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) return NextResponse.json({ audio: null });

  // Looked up server-side. The client names a scenario and a character; the
  // speaker id and the language are read from the scenario here, because a
  // caller that could name its own voice could put any voice on anybody.
  const scenario =
    await recallScenario(body.scenarioId) ?? scenarioById(body.scenarioId) ?? scenarioById(DEFAULT_SCENARIO_ID)!;
  const character = scenario.characters.find((c) => c.id === body.characterId);
  if (!character) {
    return NextResponse.json({ error: `Unknown character "${body.characterId}".` }, { status: 404 });
  }
  if (!(V3_SPEAKERS as readonly string[]).includes(character.speaker)) {
    return NextResponse.json({ error: `Character has no valid voice.` }, { status: 500 });
  }

  // The coach is deliberately nobody in the cast. A learner hearing the model
  // sentence in the shopkeeper's own voice cannot tell the example from the
  // conversation, which is exactly the confusion a speaking exercise cannot
  // afford. Chosen as the first voice this scenario is not already using.
  const speaker =
    body.role === "coach"
      ? (V3_SPEAKERS.find((v) => !scenario.characters.some((c) => c.speaker === v)) ??
        character.speaker)
      : character.speaker;

  try {
    const audio = await sarvamTTS(text, scenario.language as LangCode, speaker);
    return NextResponse.json({ audio });
  } catch (err) {
    // A missing voice is a worse demo than a silent one, but it is not a
    // reason to fail the turn: the subtitle already said what she said.
    console.warn("[sim] tts failed", err);
    return NextResponse.json({ audio: null });
  }
}
