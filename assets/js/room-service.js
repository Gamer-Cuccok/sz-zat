(function () {
  const DEFAULT_SETTINGS = {
    mode: "duel",
    minLength: 5,
    maxLength: 8,
    maxAttempts: 6,
    rounds: 5,
    targetScore: 0,
    timeLimitSeconds: 0,
    failoverTimerSeconds: 300,
    allowLongWords: false,
    allowHostWords: true
  };

  function roomPath(code) { return `rooms/${String(code || "").toUpperCase()}`; }

  function code() {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 5; i += 1) out += letters[Math.floor(Math.random() * letters.length)];
    return out;
  }

  function colorFor(seed) {
    const colors = ["#ff4667", "#38d5ff", "#f9c74f", "#39d98a", "#9d7cff"];
    let sum = 0;
    for (const ch of seed) sum += ch.charCodeAt(0);
    return colors[sum % colors.length];
  }

  function requireFirebase() {
    if (!window.SPFirebase || !window.SPFirebase.configured) {
      throw new Error("Firebase nélkül a multiplayer nem indul. Állítsd be az assets/js/config.js fájlt.");
    }
  }

  function sanitizeSettings(settings = {}) {
    const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    merged.minLength = Math.max(3, Number(merged.minLength) || DEFAULT_SETTINGS.minLength);
    merged.maxLength = Math.max(merged.minLength, Number(merged.maxLength) || DEFAULT_SETTINGS.maxLength);
    merged.maxAttempts = Math.max(1, Number(merged.maxAttempts) || DEFAULT_SETTINGS.maxAttempts);
    merged.rounds = Math.max(1, Number(merged.rounds) || DEFAULT_SETTINGS.rounds);
    merged.targetScore = Math.max(0, Number(merged.targetScore) || 0);
    merged.timeLimitSeconds = Math.max(0, Number(merged.timeLimitSeconds) || 0);
    merged.failoverTimerSeconds = Math.max(10, Number(merged.failoverTimerSeconds) || DEFAULT_SETTINGS.failoverTimerSeconds);
    merged.allowLongWords = !!merged.allowLongWords;
    merged.allowHostWords = !!merged.allowHostWords;
    merged.mode = ["solo", "duel", "party"].includes(merged.mode) ? merged.mode : "duel";
    return merged;
  }

  async function createRoom(profile) {
    requireFirebase();
    let roomCode = code();
    for (let i = 0; i < 8; i += 1) {
      const exists = await window.SPFirebase.get(roomPath(roomCode));
      if (!exists) break;
      roomCode = code();
    }
    const now = window.SPFirebase.serverTimestamp();
    const settings = sanitizeSettings(DEFAULT_SETTINGS);
    const room = {
      createdAt: now,
      updatedAt: now,
      hostUserId: profile.userId,
      status: "lobby",
      mode: settings.mode,
      settings,
      players: {
        [profile.userId]: { displayName: profile.displayName, color: colorFor(profile.userId), joinedAt: now, connected: true, score: 0, roundWins: 0 }
      },
      matchHistory: {},
      lastWordAdded: null
    };
    await window.SPFirebase.set(roomPath(roomCode), room);
    setupPresence(roomCode, profile);
    return roomCode;
  }

  async function joinRoom(roomCode, profile) {
    requireFirebase();
    const normalized = String(roomCode || "").trim().toUpperCase();
    if (!normalized) throw new Error("Adj meg szobakódot.");
    const path = roomPath(normalized);
    const room = await window.SPFirebase.get(path);
    if (!room) throw new Error("Nem létező szoba.");
    const players = room.players || {};
    if (room.settings && room.settings.mode === "solo" && !players[profile.userId]) throw new Error("Solo szobához nem lehet csatlakozni.");
    if (!players[profile.userId] && Object.keys(players).length >= 2) throw new Error("A szoba már tele van.");
    await window.SPFirebase.update(`${path}/players/${profile.userId}`, {
      displayName: profile.displayName,
      color: players[profile.userId] && players[profile.userId].color ? players[profile.userId].color : colorFor(profile.userId),
      joinedAt: players[profile.userId] && players[profile.userId].joinedAt ? players[profile.userId].joinedAt : window.SPFirebase.serverTimestamp(),
      connected: true,
      score: players[profile.userId] && players[profile.userId].score ? players[profile.userId].score : 0,
      roundWins: players[profile.userId] && players[profile.userId].roundWins ? players[profile.userId].roundWins : 0
    });
    await window.SPFirebase.update(path, { updatedAt: window.SPFirebase.serverTimestamp() });
    setupPresence(normalized, profile);
    return normalized;
  }

  function setupPresence(roomCode, profile) {
    try {
      const playerRef = window.SPFirebase.db.ref(`${roomPath(roomCode)}/players/${profile.userId}/connected`);
      const connectedRef = window.SPFirebase.db.ref(".info/connected");
      connectedRef.on("value", snap => {
        if (snap.val() === true) {
          playerRef.onDisconnect().set(false);
          playerRef.set(true);
        }
      });
    } catch (err) { console.warn("Presence setup failed", err); }
  }

  function subscribe(roomCode, cb) { requireFirebase(); return window.SPFirebase.onValue(roomPath(roomCode), cb); }
  async function updateSettings(roomCode, settings) {
    requireFirebase();
    const clean = sanitizeSettings(settings);
    return window.SPFirebase.update(roomPath(roomCode), { settings: clean, mode: clean.mode, updatedAt: window.SPFirebase.serverTimestamp() });
  }
  async function leave(roomCode, userId) { if (!window.SPFirebase.configured) return; return window.SPFirebase.remove(`${roomPath(roomCode)}/players/${userId}`); }
  async function backToLobby(roomCode) { return window.SPFirebase.update(roomPath(roomCode), { status: "lobby", currentRound: null, guesses: null, publicProgress: null, publicAttempts: null, partyBoard: null, partyLiveInputs: null, updatedAt: window.SPFirebase.serverTimestamp() }); }

  function newRoundPayload(roundNumber, settings, answer) {
    const now = Date.now();
    return {
      roundNumber,
      answer,
      answerLength: Array.from(answer).length,
      startedAt: now,
      maxAttempts: settings.maxAttempts,
      status: "active",
      winnerUserId: null,
      solvedAt: null,
      revealStartedAt: null,
      failureTimerStartedAt: null,
      failureDeadlineAt: null,
      failureStartedBy: null,
      failoverTimerSeconds: settings.failoverTimerSeconds
    };
  }

  async function startMatch(roomCode, settings, answer) {
    requireFirebase();
    const clean = sanitizeSettings(settings);
    const room = await window.SPFirebase.get(roomPath(roomCode));
    const players = room.players || {};
    const resetPlayers = {};
    Object.keys(players).forEach(uid => {
      resetPlayers[`players/${uid}/score`] = 0;
      resetPlayers[`players/${uid}/roundWins`] = 0;
    });
    await window.SPFirebase.update(roomPath(roomCode), {
      ...resetPlayers,
      status: "playing",
      mode: clean.mode,
      settings: clean,
      guesses: null,
      publicProgress: null,
      publicAttempts: null,
      partyBoard: null,
      partyLiveInputs: null,
      matchHistory: null,
      currentRound: newRoundPayload(1, clean, answer),
      updatedAt: window.SPFirebase.serverTimestamp()
    });
  }

  async function startNextRound(roomCode, answer) {
    const room = await window.SPFirebase.get(roomPath(roomCode));
    if (!room || !room.currentRound) return;
    const settings = sanitizeSettings(room.settings || DEFAULT_SETTINGS);
    const nextRoundNumber = Number(room.currentRound.roundNumber || 0) + 1;
    await window.SPFirebase.update(roomPath(roomCode), {
      status: "playing",
      guesses: null,
      publicProgress: null,
      publicAttempts: null,
      partyBoard: null,
      partyLiveInputs: null,
      currentRound: newRoundPayload(nextRoundNumber, settings, answer),
      updatedAt: window.SPFirebase.serverTimestamp()
    });
  }

  async function finishMatch(roomCode) {
    await window.SPFirebase.update(roomPath(roomCode), { status: "finished", updatedAt: window.SPFirebase.serverTimestamp() });
  }

  function publicAttemptFromPayload(payload) {
    return {
      attemptNumber: payload.attemptNumber,
      // Stored so the exhausted player can see the opponent's guesses.
      // The UI still hides these letters while the viewer can keep guessing.
      guess: payload.guess,
      states: (payload.feedback || []).map(x => x.state),
      greenCount: payload.greenCount,
      yellowCount: payload.yellowCount,
      solved: payload.solved,
      elapsedMs: payload.elapsedMs,
      submittedAt: payload.submittedAt || Date.now()
    };
  }

  async function submitGuess(roomCode, userId, payload) {
    const idx = String(payload.attemptNumber - 1).padStart(2, "0");
    const updates = {};
    updates[`guesses/${userId}/${idx}`] = payload;
    updates[`publicAttempts/${userId}/${idx}`] = publicAttemptFromPayload(payload);
    updates[`publicProgress/${userId}`] = {
      attemptCount: payload.attemptNumber,
      lastGreenCount: payload.greenCount,
      lastYellowCount: payload.yellowCount,
      solved: payload.solved,
      failed: !payload.solved && payload.isFinalAttempt,
      elapsedMs: payload.elapsedMs,
      typing: false,
      currentInput: "",
      updatedAt: Date.now()
    };
    if (payload.partyMode) {
      updates[`partyLiveInputs/${userId}`] = { currentInput: "", typing: false, updatedAt: Date.now() };
      updates[`partyBoard/${Date.now()}_${userId}_${idx}`] = {
        userId,
        displayName: payload.displayName,
        guess: payload.guess,
        feedback: payload.feedback,
        attemptNumber: payload.centralAttemptNumber || payload.attemptNumber,
        playerAttemptNumber: payload.attemptNumber,
        elapsedMs: payload.elapsedMs,
        submittedAt: payload.submittedAt || Date.now()
      };
    }
    await window.SPFirebase.update(roomPath(roomCode), updates);
  }

  async function setTyping(roomCode, userId, typing, currentInput) {
    if (!window.SPFirebase.configured) return;
    const payload = { typing: !!typing, updatedAt: Date.now() };
    if (typeof currentInput === "string") payload.currentInput = currentInput;
    await window.SPFirebase.update(`${roomPath(roomCode)}/publicProgress/${userId}`, payload).catch(() => {});
  }

  async function setPartyLiveInput(roomCode, userId, currentInput) {
    if (!window.SPFirebase.configured) return;
    const value = typeof currentInput === "string" ? currentInput : "";
    const payload = {
      currentInput: value,
      typing: value.length > 0,
      updatedAt: Date.now()
    };
    const updates = {};
    updates[`partyLiveInputs/${userId}`] = payload;
    updates[`publicProgress/${userId}/typing`] = payload.typing;
    updates[`publicProgress/${userId}/currentInput`] = value;
    updates[`publicProgress/${userId}/updatedAt`] = payload.updatedAt;
    await window.SPFirebase.update(roomPath(roomCode), updates).catch(() => {});
  }

  async function startFailureTimer(roomCode, userId) {
    const path = `${roomPath(roomCode)}/currentRound`;
    await window.SPFirebase.transaction(path, current => {
      if (!current || current.status !== "active" || current.failureDeadlineAt) return current;
      return {
        ...current,
        failureTimerStartedAt: Date.now(),
        failureDeadlineAt: Date.now() + Math.max(10, Number((current && current.failoverTimerSeconds) || 300)) * 1000,
        failureStartedBy: userId
      };
    });
  }

  async function ensureFailureTimer(roomCode, userId, seconds) {
    const path = `${roomPath(roomCode)}/currentRound`;
    await window.SPFirebase.transaction(path, current => {
      if (!current || current.status !== "active" || current.failureDeadlineAt) return current;
      const now = Date.now();
      return {
        ...current,
        failureTimerStartedAt: now,
        failureDeadlineAt: now + Math.max(10, Number(seconds) || 300) * 1000,
        failureStartedBy: userId
      };
    });
  }

  async function endRound(roomCode, winnerUserId, solvedAt) {
    const path = `${roomPath(roomCode)}/currentRound`;
    await window.SPFirebase.transaction(path, current => {
      if (!current || current.status !== "active") return current;
      return { ...current, status: "ended", winnerUserId: winnerUserId || null, solvedAt: solvedAt || Date.now(), revealStartedAt: Date.now() };
    });
    await window.SPFirebase.update(roomPath(roomCode), { status: "roundEnd", updatedAt: window.SPFirebase.serverTimestamp() });
  }

  async function addScore(roomCode, userId, points, win) {
    const room = await window.SPFirebase.get(roomPath(roomCode));
    const player = room && room.players && room.players[userId];
    if (!player) return;
    await window.SPFirebase.update(`${roomPath(roomCode)}/players/${userId}`, {
      score: (player.score || 0) + (Number(points) || 0),
      roundWins: (player.roundWins || 0) + (win ? 1 : 0)
    });
  }

  async function announceWordAdded(roomCode, entry, profile) {
    if (!roomCode || !entry) return;
    await window.SPFirebase.update(roomPath(roomCode), {
      lastWordAdded: {
        id: `${entry.word}_${Date.now()}`,
        word: entry.word,
        length: entry.length,
        addedBy: profile && profile.userId,
        addedByName: profile && profile.displayName,
        addedAt: Date.now()
      },
      updatedAt: window.SPFirebase.serverTimestamp()
    });
  }

  async function proposeWord(roomCode, entry, profile) {
    requireFirebase();
    if (!roomCode || !entry || !entry.word) throw new Error("Nincs szó megadva.");
    const key = await window.SPFirebase.push(`${roomPath(roomCode)}/wordRequests`, {
      word: entry.word,
      length: entry.length,
      status: "pending",
      requestedBy: profile && profile.userId,
      requestedByName: profile && profile.displayName,
      createdAt: Date.now(),
      source: "player-proposal"
    });
    await window.SPFirebase.update(roomPath(roomCode), { updatedAt: window.SPFirebase.serverTimestamp() });
    return key;
  }

  async function approveWordRequest(roomCode, requestId, profile) {
    requireFirebase();
    const reqPath = `${roomPath(roomCode)}/wordRequests/${requestId}`;
    const req = await window.SPFirebase.get(reqPath);
    if (!req || req.status !== "pending") throw new Error("Ez a szókérelem már nem aktív.");
    if (profile && req.requestedBy === profile.userId) throw new Error("A saját szavadat az ellenfélnek kell elfogadnia.");
    const entry = {
      word: req.word,
      length: req.length,
      enabled: true,
      addedBy: req.requestedBy,
      addedByName: req.requestedByName,
      addedAt: Date.now(),
      approvedBy: profile && profile.userId,
      approvedByName: profile && profile.displayName,
      source: "approved-player-word"
    };
    const safeId = String(entry.word).replace(/[.#$\/\[\]]/g, "_");
    await window.SPFirebase.set(`words/dynamic/${safeId}`, entry);
    await window.SPFirebase.update(reqPath, {
      status: "approved",
      respondedBy: profile && profile.userId,
      respondedByName: profile && profile.displayName,
      respondedAt: Date.now()
    });
    await window.SPFirebase.update(roomPath(roomCode), {
      lastWordAdded: {
        id: `${entry.word}_${Date.now()}`,
        word: entry.word,
        length: entry.length,
        addedBy: entry.addedBy,
        addedByName: entry.addedByName,
        approvedBy: entry.approvedBy,
        approvedByName: entry.approvedByName,
        addedAt: entry.addedAt
      },
      updatedAt: window.SPFirebase.serverTimestamp()
    });
    return entry;
  }

  async function rejectWordRequest(roomCode, requestId, profile) {
    requireFirebase();
    const reqPath = `${roomPath(roomCode)}/wordRequests/${requestId}`;
    const req = await window.SPFirebase.get(reqPath);
    if (!req || req.status !== "pending") throw new Error("Ez a szókérelem már nem aktív.");
    if (profile && req.requestedBy === profile.userId) throw new Error("A saját szavadat az ellenfélnek kell elutasítania vagy elfogadnia.");
    await window.SPFirebase.update(reqPath, {
      status: "rejected",
      respondedBy: profile && profile.userId,
      respondedByName: profile && profile.displayName,
      respondedAt: Date.now()
    });
    await window.SPFirebase.update(roomPath(roomCode), { updatedAt: window.SPFirebase.serverTimestamp() });
  }

  window.SPRooms = {
    DEFAULT_SETTINGS,
    createRoom,
    joinRoom,
    subscribe,
    updateSettings,
    leave,
    backToLobby,
    startMatch,
    startNextRound,
    finishMatch,
    submitGuess,
    setTyping,
    setPartyLiveInput,
    ensureFailureTimer,
    startFailureTimer,
    endRound,
    addScore,
    announceWordAdded,
    proposeWord,
    approveWordRequest,
    rejectWordRequest
  };
})();
