(function () {
  const STORE_KEY = "szoparbaj.audio";
  const DEFAULTS = { muted: false, sfx: true, music: true, volume: 0.6 };
  const SOUND_FILES = {
    key: "assets/sounds/key.wav",
    reveal: "assets/sounds/reveal.wav",
    invalid: "assets/sounds/invalid.wav",
    correct: "assets/sounds/correct.wav",
    win: "assets/sounds/win.wav",
    lose: "assets/sounds/lose.wav",
    level: "assets/sounds/level-up.wav",
    next: "assets/sounds/next-round.wav",
    music: "assets/sounds/music-loop.wav"
  };
  let prefs = loadPrefs();
  const cache = new Map();
  let ctx = null;
  let music = null;
  let gameActive = false;
  let beatTimer = null;
  let beatStep = 0;
  let noiseBuffer = null;

  function loadPrefs() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") }; }
    catch { return { ...DEFAULTS }; }
  }

  function savePrefs() {
    localStorage.setItem(STORE_KEY, JSON.stringify(prefs));
  }

  function fallbackBeep(freq = 440, duration = 0.045, type = "sine") {
    if (prefs.muted || !prefs.sfx) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = Math.max(0, Math.min(1, prefs.volume)) * 0.06;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.stop(ctx.currentTime + duration + 0.01);
    } catch (err) {}
  }

  function ensureContext() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return ctx;
    } catch (err) { return null; }
  }

  function playTone(freq, duration, type = "sine", gainValue = 0.04, when = 0) {
    const audioCtx = ensureContext();
    if (!audioCtx) return;
    const start = audioCtx.currentTime + when;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(Math.max(0.0001, gainValue * prefs.volume), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  function playKick() {
    const audioCtx = ensureContext();
    if (!audioCtx) return;
    const start = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(118, start);
    osc.frequency.exponentialRampToValueAtTime(42, start + 0.13);
    gain.gain.setValueAtTime(0.13 * prefs.volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.17);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + 0.2);
  }

  function getNoiseBuffer() {
    const audioCtx = ensureContext();
    if (!audioCtx) return null;
    if (noiseBuffer) return noiseBuffer;
    const size = audioCtx.sampleRate * 0.16;
    noiseBuffer = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < size; i += 1) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
  }

  function playHat(volume = 0.025) {
    const audioCtx = ensureContext();
    const buffer = getNoiseBuffer();
    if (!audioCtx || !buffer) return;
    const source = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    filter.type = "highpass";
    filter.frequency.value = 5200;
    gain.gain.setValueAtTime(volume * prefs.volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.055);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audioCtx.destination);
    source.start();
    source.stop(audioCtx.currentTime + 0.065);
  }

  function playSnare() {
    playHat(0.055);
    playTone(178, 0.075, "triangle", 0.035);
  }

  function stepSynthBeat() {
    if (prefs.muted || !prefs.music || !gameActive) return;
    const step = beatStep % 16;
    const bass = [55, 0, 82, 0, 65, 0, 98, 0, 55, 0, 110, 0, 73, 0, 98, 0];
    const lead = [440, 0, 523.25, 659.25, 0, 587.33, 0, 784, 659.25, 0, 523.25, 0, 880, 0, 784, 0];
    if ([0, 4, 8, 12].includes(step)) playKick();
    if ([4, 12].includes(step)) playSnare();
    if (step % 2 === 1) playHat(0.018);
    if (bass[step]) playTone(bass[step], 0.12, "sawtooth", 0.035);
    if (lead[step] && beatStep % 32 >= 16) playTone(lead[step], 0.07, "square", 0.018);
    beatStep += 1;
  }

  function startSynthMusic() {
    if (beatTimer || prefs.muted || !prefs.music || !gameActive) return;
    if (music && !music.paused) return;
    try {
      music = music || getAudio("music");
      music.loop = true;
      music.volume = Math.max(0, Math.min(1, prefs.volume)) * 0.42;
      const promise = music.play();
      if (promise && promise.catch) {
        promise.catch(() => {
          if (beatTimer || prefs.muted || !prefs.music || !gameActive) return;
          if (!ensureContext()) return;
          beatStep = beatStep || 0;
          stepSynthBeat();
          beatTimer = setInterval(stepSynthBeat, 220);
        });
      }
    } catch (err) {
      if (!ensureContext()) return;
      beatStep = beatStep || 0;
      stepSynthBeat();
      beatTimer = setInterval(stepSynthBeat, 220);
    }
  }

  function stopSynthMusic() {
    if (beatTimer) clearInterval(beatTimer);
    beatTimer = null;
    if (music) {
      music.pause();
      try { music.currentTime = 0; } catch (err) {}
    }
  }

  function getAudio(name) {
    if (!cache.has(name)) {
      const a = new Audio(SOUND_FILES[name]);
      a.preload = "auto";
      cache.set(name, a);
    }
    return cache.get(name);
  }

  function play(name) {
    if (prefs.muted || !prefs.sfx || name === "music") return;
    const map = { key: [440, .035, "triangle"], reveal: [660, .055, "sine"], invalid: [150, .08, "sawtooth"], correct: [820, .11, "sine"], win: [940, .14, "triangle"], lose: [190, .14, "square"], level: [1100, .18, "sine"], next: [560, .09, "triangle"] };
    try {
      const a = getAudio(name);
      a.volume = prefs.volume;
      a.currentTime = 0;
      a.play().catch(() => fallbackBeep(...(map[name] || map.key)));
    } catch (err) {
      fallbackBeep(...(map[name] || map.key));
    }
  }

  function updateMusic() {
    if (!gameActive) {
      stopSynthMusic();
      if (music) music.pause();
      return;
    }
    if (!prefs.muted && prefs.music) {
      startSynthMusic();
    } else {
      stopSynthMusic();
      if (music) music.pause();
    }
  }

  function setGameActive(active) {
    gameActive = !!active;
    updateMusic();
  }

  function wake() {
    ensureContext();
    updateMusic();
  }

  function setPrefs(next) {
    prefs = { ...prefs, ...next };
    if (music) music.volume = Math.max(0, Math.min(1, prefs.volume)) * 0.42;
    savePrefs();
    updateMusic();
    renderControls();
  }

  function getPrefs() { return { ...prefs }; }

  function renderControls() {
    const audioToggle = document.getElementById("audioToggle");
    const sfxToggle = document.getElementById("sfxToggle");
    const musicToggle = document.getElementById("musicToggle");
    const volumeSlider = document.getElementById("volumeSlider");
    if (audioToggle) audioToggle.textContent = prefs.muted ? "🔇" : "🔊";
    if (sfxToggle) sfxToggle.checked = !!prefs.sfx;
    if (musicToggle) musicToggle.checked = !!prefs.music;
    if (volumeSlider) volumeSlider.value = prefs.volume;
  }

  function bindControls() {
    const audioToggle = document.getElementById("audioToggle");
    const sfxToggle = document.getElementById("sfxToggle");
    const musicToggle = document.getElementById("musicToggle");
    const volumeSlider = document.getElementById("volumeSlider");
    if (audioToggle) audioToggle.addEventListener("click", () => { wake(); setPrefs({ muted: !prefs.muted }); });
    if (sfxToggle) sfxToggle.addEventListener("change", () => setPrefs({ sfx: sfxToggle.checked }));
    if (musicToggle) musicToggle.addEventListener("change", () => { wake(); setPrefs({ music: musicToggle.checked }); });
    if (volumeSlider) volumeSlider.addEventListener("input", () => setPrefs({ volume: Number(volumeSlider.value) }));
    renderControls();
    updateMusic();
  }

  window.SPAudio = { play, bindControls, setPrefs, getPrefs, setGameActive, wake };
})();
