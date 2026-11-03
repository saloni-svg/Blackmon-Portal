// "Ask Blackmon" Talk: the chat assistant with a voice. The browser records each thing the parent
// says (public/voice.js); this transcribes it, answers it with the chat itself (assistant.ask, so a
// spoken question gets the same answer as a typed one and lands in the same conversation), and reads
// the answer out with OpenAI text-to-speech.
//
// The language is the one picked in the chat, nothing else: speech is transcribed in that language
// and the answer is written and spoken in it. (Letting the transcriber guess the language labelled
// accented English as Hindi or Spanish.)

import { noteAiError, noteAiOk } from "./aistatus.js";
import { Readable } from "node:stream";
import OpenAI, { toFile } from "openai";
import { LANG_EN, chatLang, chatText, voiceNoise } from "../public/chat-i18n.js";

const STT_MODEL = "gpt-4o-transcribe";
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const TTS_VOICE = process.env.OPENAI_TTS_VOICE || "marin";
const CALLS = { max: 6, windowMs: 60 * 60_000 }; // voice calls per parent per hour
export const MAX_CALL_MINUTES = 10;
export const MAX_TURN_BYTES = 4 * 1024 * 1024; // one recorded turn (about 30 seconds of speech)

const httpError = (status, message) => Object.assign(new Error(message), { httpStatus: status });

export function createVoice({ assistant, apiKey }) {
  const client = apiKey ? new OpenAI({ apiKey }) : null;
  const calls = new Map(); // contactId -> recent call start times

  return {
    enabled: !!client,

    // A call starting: rate limit, and a "Voice call started" line in the chat.
    start(contact, facts, language) {
      if (!client) throw httpError(503, "The voice assistant isn't set up yet.");
      const t = Date.now();
      const recent = (calls.get(contact.id) || []).filter((x) => t - x < CALLS.windowMs);
      if (recent.length >= CALLS.max) throw httpError(429, "You've started several voice calls in the last hour. Please try again later, or type your question.");
      recent.push(t);
      calls.set(contact.id, recent);
      assistant.logVoice(contact, facts, chatLang(language), "event", "Voice call started");
      console.log(`  Voice: call started for ${contact.email}.`);
      return { maxMinutes: MAX_CALL_MINUTES };
    },

    // One thing the parent said -> { heard: false } for noise, else the chat's
    // { conversation, messages: [their message, the answer, ...] }. facts is a promise, so their
    // portal data is looked up in GHL while the speech is transcribed.
    async turn(contact, facts, audio, type, language) {
      facts.catch(() => {}); // a failure surfaces below, after the transcription
      language = chatLang(language);
      const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
      let text;
      try {
        // Usually under a second; a stuck request is cut off and tried once more rather than leaving the parent waiting.
        const out = await client.audio.transcriptions.create({ file: await toFile(audio, `turn.${ext}`, { type }), model: STT_MODEL, language }, { timeout: 6000, maxRetries: 1 });
        text = String(out.text || "").trim();
        noteAiOk();
      } catch (err) {
        console.error(`  Voice: transcription failed for ${contact.email}: ${err.message}`);
        throw httpError(502, noteAiError(err) ? chatText(language).unavailable : chatText(language).error);
      }
      if (voiceNoise(text)) return { heard: false };
      return { heard: true, ...(await assistant.ask(contact, await facts, text, language, { voice: true })) };
    },

    // Streams a spoken answer (mp3) to res.
    async speak(text, language, res) {
      const audio = await client.audio.speech.create({
        model: TTS_MODEL, voice: TTS_VOICE, input: String(text).slice(0, 4000), response_format: "mp3",
        instructions: `Speak ${LANG_EN[chatLang(language)]} naturally, warmly and clearly, at a brisk, natural conversational pace (not slow, no long pauses), like a friendly, efficient camp office helper. Read phone numbers digit by digit.`,
      }, { timeout: 8000, maxRetries: 1 }).catch((err) => { noteAiError(err); throw err; }); // the time limit covers the wait for the first audio, not the playback
      res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" });
      Readable.fromWeb(audio.body).pipe(res);
    },
  };
}
