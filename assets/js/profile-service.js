(function () {
  const USER_ID_KEY = "szoparbaj.userId";
  const NAME_KEY = "szoparbaj.displayName";
  const LOCAL_STATS_KEY = "szoparbaj.localStats";

  const DEFAULT_STATS = {
    totalXP: 0,
    level: 1,
    totalMatches: 0,
    totalRounds: 0,
    roundsWon: 0,
    roundsLost: 0,
    partyRoundsSolved: 0,
    bestSolveTime: null,
    longestSolvedWordLength: 0,
    averageAttempts: 0,
    averageSolveTime: 0,
    totalCorrectGuesses: 0,
    totalFailedRounds: 0,
    highestRoundScore: 0,
    lastPlayedAt: null
  };

  let current = null;

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function getOrCreateUserId() {
    let id = localStorage.getItem(USER_ID_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(USER_ID_KEY, id);
    }
    return id;
  }

  function localStats() {
    try { return { ...DEFAULT_STATS, ...JSON.parse(localStorage.getItem(LOCAL_STATS_KEY) || "{}") }; }
    catch { return { ...DEFAULT_STATS }; }
  }

  function saveLocalStats(stats) {
    localStorage.setItem(LOCAL_STATS_KEY, JSON.stringify(stats));
  }

  async function load(displayName) {
    const userId = getOrCreateUserId();
    const name = String(displayName || localStorage.getItem(NAME_KEY) || "Játékos").trim().slice(0, 24) || "Játékos";
    localStorage.setItem(NAME_KEY, name);
    let stats = localStats();
    if (window.SPFirebase && window.SPFirebase.configured) {
      const existing = await window.SPFirebase.get(`users/${userId}`).catch(() => null);
      stats = { ...DEFAULT_STATS, ...(existing && existing.stats ? existing.stats : existing || {}), ...stats };
      await window.SPFirebase.update(`users/${userId}`, {
        userId,
        displayName: name,
        updatedAt: window.SPFirebase.serverTimestamp(),
        createdAt: existing && existing.createdAt ? existing.createdAt : window.SPFirebase.serverTimestamp(),
        stats
      });
    }
    const levelInfo = window.SPScoring.levelFromXP(stats.totalXP || 0);
    stats.level = levelInfo.level;
    current = { userId, displayName: name, stats };
    saveLocalStats(stats);
    return current;
  }

  function getCurrent() { return current; }

  async function applyRoundResult({ solved, won, partySolved, attemptsUsed, elapsedSeconds, wordLength, roundScore, xp }) {
    if (!current) return null;
    const stats = { ...DEFAULT_STATS, ...current.stats };
    stats.totalXP = (stats.totalXP || 0) + Math.max(0, Number(xp) || 0);
    stats.totalRounds = (stats.totalRounds || 0) + 1;
    if (won) stats.roundsWon = (stats.roundsWon || 0) + 1;
    if (!won && !partySolved) stats.roundsLost = (stats.roundsLost || 0) + 1;
    if (partySolved) stats.partyRoundsSolved = (stats.partyRoundsSolved || 0) + 1;
    if (solved || partySolved) {
      stats.totalCorrectGuesses = (stats.totalCorrectGuesses || 0) + 1;
      stats.longestSolvedWordLength = Math.max(stats.longestSolvedWordLength || 0, Number(wordLength) || 0);
      stats.bestSolveTime = stats.bestSolveTime == null ? elapsedSeconds : Math.min(stats.bestSolveTime, elapsedSeconds);
    } else {
      stats.totalFailedRounds = (stats.totalFailedRounds || 0) + 1;
    }
    const n = Math.max(1, stats.totalRounds);
    stats.averageAttempts = Number((((stats.averageAttempts || 0) * (n - 1) + (attemptsUsed || 0)) / n).toFixed(2));
    stats.averageSolveTime = Number((((stats.averageSolveTime || 0) * (n - 1) + (elapsedSeconds || 0)) / n).toFixed(2));
    stats.highestRoundScore = Math.max(stats.highestRoundScore || 0, Number(roundScore) || 0);
    stats.lastPlayedAt = Date.now();
    stats.level = window.SPScoring.levelFromXP(stats.totalXP).level;
    current.stats = stats;
    saveLocalStats(stats);
    if (window.SPFirebase && window.SPFirebase.configured) {
      await window.SPFirebase.update(`users/${current.userId}/stats`, stats).catch(console.error);
      await window.SPFirebase.update(`users/${current.userId}`, { displayName: current.displayName, updatedAt: window.SPFirebase.serverTimestamp() }).catch(console.error);
    }
    return stats;
  }

  async function incrementMatches() {
    if (!current) return;
    current.stats.totalMatches = (current.stats.totalMatches || 0) + 1;
    saveLocalStats(current.stats);
    if (window.SPFirebase && window.SPFirebase.configured) {
      await window.SPFirebase.update(`users/${current.userId}/stats`, current.stats).catch(console.error);
    }
  }

  window.SPProfile = { load, getCurrent, applyRoundResult, incrementMatches };
})();
