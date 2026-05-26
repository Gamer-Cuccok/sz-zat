(function () {
  const STORE_KEY = "szoparbaj.audio";
  const DEFAULTS = { muted: false, sfx: true, music: false, volume: 0.6 };
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
    if (!music) {
      music = new Audio(SOUND_FILES.music);
      music.loop = true;
      music.preload = "auto";
    }
    music.volume = prefs.volume * 0.35;
    if (!prefs.muted && prefs.music) music.play().catch(() => {});
    else music.pause();
  }

  function setPrefs(next) {
    prefs = { ...prefs, ...next };
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
    if (audioToggle) audioToggle.addEventListener("click", () => setPrefs({ muted: !prefs.muted }));
    if (sfxToggle) sfxToggle.addEventListener("change", () => setPrefs({ sfx: sfxToggle.checked }));
    if (musicToggle) musicToggle.addEventListener("change", () => setPrefs({ music: musicToggle.checked }));
    if (volumeSlider) volumeSlider.addEventListener("input", () => setPrefs({ volume: Number(volumeSlider.value) }));
    renderControls();
    updateMusic();
  }

  window.SPAudio = { play, bindControls, setPrefs, getPrefs };
})();
