// "Ask Blackmon" Talk: the chat with a voice. This records what the parent says (one recording per
// thing said, cut when they pause), sends it to /api/chat/voice/turn, where it's transcribed and
// answered by the chat itself (lib/voice.js), shows both lines in the chat, and plays the answer
// (/api/chat/voice/speak). The mic isn't recorded while the answer plays, so the speakers can't
// feed the answer back in as if the parent had said it.

async function post(path, body, headers = { "Content-Type": "application/json" }) {
  const res = await fetch(path, { method: "POST", credentials: "same-origin", headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || ""), { status: res.status });
  return data;
}

// Turn detection: speech is a level clearly above the room's background; a turn ends after
// END_SILENCE of quiet. Short blips (a cough, a click) aren't sent.
const TICK = 50;            // ms between level checks
const START_TICKS = 3;      // this many loud ticks in a row = the parent started talking
const END_SILENCE = 600;    // ms of quiet that ends their turn
const MIN_SPEECH = 400;     // ms of speech for a turn to count
const MAX_TURN = 30_000;    // ms; a turn is sent at this length even without a pause
const IDLE_RESTART = 20_000; // ms; restart the idle recording so it doesn't fill with silence

// on: { status(s) where s is "connecting" | "listening" | "working" | "speaking",
//       line(message), reply({ conversation, messages }), error(text), ended(reason) }
// Returns { end(), setMuted(bool), setLanguage(code) }. Throws { mic: true } if the microphone isn't allowed.
export async function startVoiceCall({ language, on }) {
  on.status("connecting");
  const player = new Audio(); // made during the click, so later answers are allowed to play
  let mic;
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch { throw Object.assign(new Error("mic"), { mic: true }); }

  let session;
  try { session = await post("/api/chat/voice/session", JSON.stringify({ language })); }
  catch (err) { mic.getTracks().forEach((t) => t.stop()); throw err; }

  const ctx = new AudioContext();
  ctx.resume().catch(() => {});
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  ctx.createMediaStreamSource(mic).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";

  let state = "", muted = false, ended = false;
  let recorder = null, chunks = [], recStart = 0;
  let floor = 0.01, loud = 0, inSpeech = false, speechStart = 0, quiet = 0;

  function record() {
    chunks = [];
    recorder = new MediaRecorder(mic, type ? { mimeType: type } : undefined);
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.start();
    recStart = Date.now();
  }
  // Stops the recording; resolves with it (or null when it's just discarded).
  function stopRecording(keep) {
    const r = recorder;
    recorder = null;
    if (!r || r.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      r.onstop = () => resolve(keep ? new Blob(chunks, { type: r.mimeType || type || "audio/webm" }) : null);
      r.stop();
    });
  }

  function listen() {
    if (ended) return;
    state = "listening";
    on.status("listening");
    inSpeech = false; loud = 0; quiet = 0;
    if (!muted) record();
  }

  const level = () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += v * v;
    return Math.sqrt(sum / samples.length);
  };

  const meter = setInterval(() => {
    if (state !== "listening" || muted || !recorder) return;
    const rms = level();
    const threshold = Math.max(0.015, floor * 3);
    if (!inSpeech) {
      floor = floor * 0.95 + Math.min(rms, 0.05) * 0.05; // follow the room's background level
      loud = rms > threshold ? loud + 1 : 0;
      if (loud >= START_TICKS) { inSpeech = true; speechStart = Date.now() - START_TICKS * TICK; quiet = 0; }
      else if (Date.now() - recStart > IDLE_RESTART) { stopRecording(false); record(); }
      return;
    }
    quiet = rms > threshold ? 0 : quiet + TICK;
    const spoken = Date.now() - speechStart - quiet;
    if (quiet >= END_SILENCE || Date.now() - speechStart > MAX_TURN) {
      if (spoken < MIN_SPEECH) { inSpeech = false; loud = 0; return; } // a blip: keep listening
      send();
    }
  }, TICK);

  async function send() {
    state = "working";
    on.status("working");
    const audio = await stopRecording(true);
    if (ended) return;
    if (!audio?.size) return listen();
    try {
      const d = await post(`/api/chat/voice/turn?language=${encodeURIComponent(language)}`, audio, { "Content-Type": audio.type.split(";")[0] });
      if (ended) return;
      if (!d.heard) return listen(); // noise, not speech
      on.reply(d);
      const answer = [...d.messages].reverse().find((m) => m.role === "bot");
      if (answer) return speak(`id=${answer.id}`);
    } catch (err) {
      if (ended) return;
      if (err.status === 401) { end("signedout"); return; }
      on.error(err.message);
    }
    listen();
  }

  function speak(query) {
    state = "speaking";
    on.status("speaking");
    player.src = `/api/chat/voice/speak?${query}&language=${encodeURIComponent(language)}`;
    player.defaultPlaybackRate = player.playbackRate = 1.1; // a touch quicker than the voice's natural pace (pitch is kept)
    const done = () => { player.onended = player.onerror = null; if (state === "speaking") setTimeout(listen, 300); };
    player.onended = done;
    player.onerror = done;
    player.play().catch(done);
  }

  const timer = setTimeout(() => end("limit"), (session.maxMinutes || 10) * 60_000);

  function end(reason = "hangup") {
    if (ended) return;
    ended = true;
    state = "";
    clearTimeout(timer);
    clearInterval(meter);
    stopRecording(false);
    player.pause();
    player.removeAttribute("src");
    mic.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
    if (reason !== "signedout") post("/api/chat/voice/end", JSON.stringify({ language })).then((d) => d.message && on.line(d.message)).catch(() => {});
    on.ended(reason);
  }

  speak("greet=1");

  return {
    end,
    setMuted(on) {
      muted = on;
      if (muted) { stopRecording(false); inSpeech = false; }
      else if (state === "listening") record();
    },
    setLanguage(code) { language = code; },
  };
}
