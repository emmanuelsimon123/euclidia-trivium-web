/* audio.js — Latin pronunciation via two offline backends:
 *   (a) eSpeak-NG WebAssembly (vendored) — real Latin voice, Classical + Ecclesiastical.
 *   (b) browser speechSynthesis with an Italian voice — natural ecclesiastical.
 * eSpeak is preferred when available; otherwise we fall back to speechSynthesis.
 * No network at runtime. */
(function () {
  const W = (window.W = window.W || {});
  let sysVoices = [];
  function refreshVoices() { try { sysVoices = speechSynthesis.getVoices() || []; } catch (e) { sysVoices = []; } }
  if (typeof speechSynthesis !== "undefined") {
    refreshVoices();
    speechSynthesis.onvoiceschanged = refreshVoices;
  }

  function pickSystemVoice(mode) {
    if (!sysVoices.length) refreshVoices();
    const byLang = p => sysVoices.find(v => v.lang && v.lang.toLowerCase().startsWith(p));
    // Ecclesiastical Latin ≈ Italian; Classical ≈ Spanish vowels are a touch closer, but Italian is most widely installed.
    if (mode === "ecclesiastical") return byLang("it") || byLang("es") || byLang("la") || sysVoices[0];
    return byLang("la") || byLang("it") || byLang("es") || sysVoices[0];
  }

  // Light respelling to nudge a non-Latin system voice toward *classical* values.
  function classicalRespell(text) {
    return text
      .replace(/qu/g, "kw").replace(/Qu/g, "Kw")
      .replace(/v/g, "w").replace(/V/g, "W")
      .replace(/c/g, "k").replace(/C/g, "K")
      .replace(/ae/g, "ai").replace(/Ae/g, "Ai")
      .replace(/oe/g, "oi")
      .replace(/gn/g, "ngn");
  }
  // strip macrons for system TTS (it doesn't read them); keep for eSpeak.
  const stripMacrons = s => s.normalize("NFD").replace(/[̄́̀]/g, "").normalize("NFC")
    .replace(/ā/g, "a").replace(/ē/g, "e").replace(/ī/g, "i").replace(/ō/g, "o").replace(/ū/g, "u")
    .replace(/Ā/g, "A").replace(/Ē/g, "E").replace(/Ī/g, "I").replace(/Ō/g, "O").replace(/Ū/g, "U");

  function speakSystem(text, mode) {
    if (typeof speechSynthesis === "undefined") return false;
    const voice = pickSystemVoice(mode);
    let t = stripMacrons(text);
    if (mode === "classical" && (!voice || !/^la/i.test(voice.lang || ""))) t = classicalRespell(t);
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.rate = 0.9; u.pitch = 1;
    speechSynthesis.speak(u);
    return true;
  }

  // eSpeak-NG hook — the vendored loader (vendor/espeak/espeak.js) sets W._espeak = { speak(text,{variant}) }.
  function speakEspeak(text, mode) {
    if (!W._espeak || !W._espeak.ready) return false;
    try { W._espeak.speak(text, { mode }); return true; } catch (e) { console.warn("espeak failed", e); return false; }
  }

  function speak(text, opts) {
    if (!text) return;
    const s = W.store ? W.store.settings() : { audioEngine: "espeak", pronunciation: "classical" };
    const engine = (opts && opts.engine) || s.audioEngine;
    const mode = (opts && opts.mode) || s.pronunciation; // 'classical' | 'ecclesiastical'
    if (engine === "espeak" && speakEspeak(text, mode)) return;
    if (!speakSystem(text, mode)) {
      // last resort: try eSpeak even if engine was 'system'
      speakEspeak(text, mode);
    }
  }

  function available() {
    return (W._espeak && W._espeak.ready) || (typeof speechSynthesis !== "undefined" && (sysVoices.length || true));
  }
  function systemVoiceInfo() {
    refreshVoices();
    const it = sysVoices.find(v => /^it/i.test(v.lang || ""));
    return { count: sysVoices.length, italian: it ? it.name : null };
  }

  W.audio = { speak, available, systemVoiceInfo, refreshVoices, stripMacrons };
})();
