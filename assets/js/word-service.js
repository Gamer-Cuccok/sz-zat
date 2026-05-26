(function () {
  const engine = () => window.SPGameEngine;
  let answerWords = [];
  let acceptedWords = [];
  let wordMeta = new Map();
  let dynamicUnsub = null;

  function toEntry(raw, defaults = {}) {
    const word = engine().normalizeWord(typeof raw === "string" ? raw : raw.word);
    if (!engine().isValidHungarianWordShape(word)) return null;
    return {
      word,
      length: Array.from(word).length,
      isAnswer: raw.isAnswer ?? defaults.isAnswer ?? true,
      isAccepted: raw.isAccepted ?? defaults.isAccepted ?? true,
      enabled: raw.enabled ?? defaults.enabled ?? true,
      source: raw.source || defaults.source || "local"
    };
  }

  function mergeEntry(entry) {
    if (!entry || !entry.enabled) return;
    const prev = wordMeta.get(entry.word) || { word: entry.word, length: entry.length, isAnswer: false, isAccepted: false, enabled: true, source: entry.source };
    prev.isAnswer = !!(prev.isAnswer || entry.isAnswer);
    prev.isAccepted = !!(prev.isAccepted || entry.isAccepted || entry.isAnswer);
    prev.enabled = entry.enabled !== false;
    prev.source = prev.source === "dynamic" || entry.source === "dynamic" ? "dynamic" : prev.source;
    wordMeta.set(entry.word, prev);
  }

  function rebuildArrays() {
    const all = Array.from(wordMeta.values()).filter(w => w.enabled !== false);
    answerWords = all.filter(w => w.isAnswer).map(w => w.word);
    acceptedWords = all.filter(w => w.isAccepted || w.isAnswer).map(w => w.word);
  }

  async function loadJson(url, defaults) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Nem sikerült betölteni: ${url}`);
    const json = await res.json();
    const rawWords = Array.isArray(json) ? json : json.words || [];
    rawWords.map(x => toEntry(x, defaults)).forEach(mergeEntry);
  }

  async function init() {
    wordMeta.clear();
    await loadJson("data/starter-words.json", { isAnswer: true, isAccepted: true, source: "starter" });
    await loadJson("data/accepted-words.json", { isAnswer: false, isAccepted: true, source: "accepted" });
    rebuildArrays();
    const heroWordCount = document.getElementById("heroWordCount");
    if (heroWordCount) heroWordCount.textContent = String(acceptedWords.length);
    if (window.SPFirebase && window.SPFirebase.configured) subscribeDynamicWords();
  }

  function subscribeDynamicWords() {
    if (dynamicUnsub) dynamicUnsub();
    dynamicUnsub = window.SPFirebase.onValue("words/dynamic", data => {
      Object.values(data || {}).map(x => toEntry({ ...x, source: "dynamic" }, { source: "dynamic" })).forEach(mergeEntry);
      rebuildArrays();
      const heroWordCount = document.getElementById("heroWordCount");
      if (heroWordCount) heroWordCount.textContent = String(acceptedWords.length);
    });
  }

  function isAccepted(word) {
    const normalized = engine().normalizeWord(word);
    const meta = wordMeta.get(normalized);
    return !!(meta && meta.enabled !== false && (meta.isAccepted || meta.isAnswer));
  }

  function getByLength(minLength, maxLength, allowLong) {
    const min = Number(minLength) || 3;
    const max = allowLong ? (Number(maxLength) || 30) : Math.min(Number(maxLength) || 8, 12);
    return answerWords.filter(w => w.length >= min && w.length <= max);
  }

  function randomAnswer(settings) {
    let pool = getByLength(settings.minLength, settings.maxLength, settings.allowLongWords);
    if (!pool.length) pool = answerWords.filter(w => w.length >= 3);
    if (!pool.length) throw new Error("Nincs használható válasz szó a beállításokhoz.");
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async function addDynamicWord({ word, isAnswer = false, isAccepted = true, addedBy = "unknown", source = "host-quick-add" }) {
    const normalized = engine().normalizeWord(word);
    if (!engine().isValidHungarianWordShape(normalized)) throw new Error("Csak magyar betűket használj.");
    const entry = { word: normalized, length: normalized.length, isAnswer: !!isAnswer, isAccepted: !!isAccepted || !!isAnswer, enabled: true, addedBy, addedAt: Date.now(), source };
    mergeEntry({ ...entry, source: "dynamic" });
    rebuildArrays();
    if (window.SPFirebase && window.SPFirebase.configured) {
      const id = normalized.replace(/[.#$\/[\]]/g, "_");
      await window.SPFirebase.set(`words/dynamic/${id}`, entry);
    }
    return entry;
  }

  function getAll() { return Array.from(wordMeta.values()).sort((a, b) => a.word.localeCompare(b.word, "hu")); }
  function getAnswerWords() { return [...answerWords]; }
  function getAcceptedWords() { return [...acceptedWords]; }

  window.SPWordService = { init, isAccepted, randomAnswer, addDynamicWord, getAll, getAnswerWords, getAcceptedWords };
})();
