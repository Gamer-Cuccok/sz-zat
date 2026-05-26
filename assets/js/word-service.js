(function () {
  const engine = () => window.SPGameEngine;
  let words = [];
  let wordMeta = new Map();
  let dynamicUnsub = null;

  function normalizeEntry(raw, defaults = {}) {
    const word = engine().normalizeWord(typeof raw === "string" ? raw : raw.word);
    if (!engine().isValidHungarianWordShape(word)) return null;
    return {
      word,
      length: Array.from(word).length,
      enabled: raw.enabled !== false,
      source: raw.source || defaults.source || "local",
      addedBy: raw.addedBy || defaults.addedBy || null,
      addedAt: raw.addedAt || defaults.addedAt || null
    };
  }

  function mergeEntry(entry) {
    if (!entry || entry.enabled === false) return false;
    const prev = wordMeta.get(entry.word) || {};
    wordMeta.set(entry.word, {
      word: entry.word,
      length: entry.length,
      enabled: true,
      source: prev.source === "dynamic" || entry.source === "dynamic" ? "dynamic" : (entry.source || prev.source || "local"),
      addedBy: entry.addedBy || prev.addedBy || null,
      addedAt: entry.addedAt || prev.addedAt || null
    });
    return true;
  }

  function rebuildArray() {
    words = Array.from(wordMeta.values())
      .filter(w => w.enabled !== false)
      .sort((a, b) => a.word.localeCompare(b.word, "hu"));
  }

  async function loadJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Nem sikerült betölteni: ${url}`);
    const json = await res.json();
    const rawWords = Array.isArray(json) ? json : (json.words || []);
    rawWords.map(x => normalizeEntry(x, { source: "canonical" })).forEach(mergeEntry);
  }

  async function init() {
    wordMeta.clear();
    await loadJson("data/words.json");
    rebuildArray();
    updateWordCount();
    if (window.SPFirebase && window.SPFirebase.configured) subscribeDynamicWords();
  }

  function updateWordCount() {
    const heroWordCount = document.getElementById("heroWordCount");
    if (heroWordCount) heroWordCount.textContent = String(words.length);
  }

  function subscribeDynamicWords() {
    if (dynamicUnsub) dynamicUnsub();
    dynamicUnsub = window.SPFirebase.onValue("words/dynamic", data => {
      Object.values(data || {})
        .map(x => normalizeEntry({ ...x, source: "dynamic" }, { source: "dynamic" }))
        .forEach(mergeEntry);
      rebuildArray();
      updateWordCount();
    });
  }

  function isAccepted(word) {
    const normalized = engine().normalizeWord(word);
    const meta = wordMeta.get(normalized);
    return !!(meta && meta.enabled !== false);
  }

  function getPool(settings = {}) {
    const min = Math.max(3, Number(settings.minLength) || 3);
    const maxSetting = Number(settings.maxLength) || 30;
    const max = settings.allowLongWords ? Math.max(min, maxSetting) : Math.min(Math.max(min, maxSetting), 12);
    return words.map(w => w.word).filter(w => {
      const len = Array.from(w).length;
      return len >= min && len <= max;
    });
  }

  function randomAnswer(settings) {
    let pool = getPool(settings);
    if (!pool.length) pool = words.map(w => w.word).filter(w => Array.from(w).length >= 3);
    if (!pool.length) throw new Error("Nincs használható szó a beállításokhoz.");
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function prepareWordEntry(rawWord, defaults = {}) {
    const normalized = engine().normalizeWord(rawWord);
    if (!engine().isValidHungarianWordShape(normalized)) throw new Error("Csak magyar betűket használj.");
    if (Array.from(normalized).length < 3) throw new Error("Legalább 3 betűs szó kell.");
    return {
      word: normalized,
      length: Array.from(normalized).length,
      enabled: true,
      addedBy: defaults.addedBy || "unknown",
      addedByName: defaults.addedByName || "Játékos",
      addedAt: defaults.addedAt || Date.now(),
      source: defaults.source || "player-added"
    };
  }

  function addLocalWord(rawEntry) {
    const entry = normalizeEntry(typeof rawEntry === "string" ? { word: rawEntry } : rawEntry, { source: "room-approved" });
    if (!entry) return null;
    const existed = wordMeta.has(entry.word);
    mergeEntry({ ...entry, source: entry.source || "room-approved" });
    rebuildArray();
    updateWordCount();
    return { ...entry, existed };
  }

  async function addDynamicWord({ word, addedBy = "unknown", addedByName = "Játékos", source = "approved-room" }) {
    const entry = prepareWordEntry(word, { addedBy, addedByName, source });
    const existed = wordMeta.has(entry.word);
    addLocalWord({ ...entry, source: "dynamic" });
    if (window.SPFirebase && window.SPFirebase.configured) {
      const id = entry.word.replace(/[.#$\/\[\]]/g, "_");
      await window.SPFirebase.set(`words/dynamic/${id}`, entry);
    }
    return { ...entry, existed };
  }

  function getAll() { return [...words]; }
  function getWords() { return words.map(w => w.word); }
  function getAnswerWords() { return getWords(); }
  function getAcceptedWords() { return getWords(); }

  window.SPWordService = { init, isAccepted, randomAnswer, prepareWordEntry, addLocalWord, addDynamicWord, getAll, getWords, getAnswerWords, getAcceptedWords };
})();
