(function () {
  const DEFAULT_SETTINGS = {
    mode: "duel",
    minLength: 5,
    maxLength: 8,
    maxAttempts: 6,
    rounds: 5,
    targetScore: 0,
    timeLimitSeconds: 0,
    allowLongWords: false,
    allowHostWords: true,
    addedWordsAsAnswers: false
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

  async function createRoom(profile) {
    requireFirebase();
    let roomCode = code();
    for (let i = 0; i < 8; i += 1) {
      const exists = await window.SPFirebase.get(roomPath(roomCode));
      if (!exists) break;
      roomCode = code();
    }
    const now = window.SPFirebase.serverTimestamp();
    const room = {
      createdAt: now,
      updatedAt: now,
      hostUserId: profile.userId,
      status: "lobby",
      mode: DEFAULT_SETTINGS.mode,
      settings: DEFAULT_SETTINGS,
      players: {
        [profile.userId]: { displayName: profile.displayName, color: colorFor(profile.userId), joinedAt: now, connected: true, score: 0, roundWins: 0 }
      },
      matchHistory: {}
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
  async function updateSettings(roomCode, settings) { requireFirebase(); return window.SPFirebase.update(roomPath(roomCode), { settings, mode: settings.mode, updatedAt: window.SPFirebase.serverTimestamp() }); }
  async function leave(roomCode, userId) { if (!window.SPFirebase.configured) return; return window.SPFirebase.remove(`${roomPath(roomCode)}/players/${userId}`); }
  async function backToLobby(roomCode) { return window.SPFirebase.update(roomPath(roomCode), { status: "lobby", currentRound: null, guesses: null, publicProgress: null, partyBoard: null, updatedAt: window.SPFirebase.serverTimestamp() }); }

  async function startMatch(roomCode, settings, answer) {
    requireFirebase();
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
      mode: settings.mode,
      settings,
      guesses: null,
      publicProgress: null,
      partyBoard: null,
      matchHistory: null,
      currentRound: {
        roundNumber: 1,
        answer,
        answerLength: Array.from(answer).length,
        startedAt: Date.now(),
        maxAttempts: settings.maxAttempts,
        status: "active",
        winnerUserId: null,
        solvedAt: null,
        revealStartedAt: null
      },
      updatedAt: window.SPFirebase.serverTimestamp()
    });
  }

  async function startNextRound(roomCode, answer) {
    const room = await window.SPFirebase.get(roomPath(roomCode));
    if (!room || !room.currentRound) return;
    const nextRoundNumber = Number(room.currentRound.roundNumber || 0) + 1;
    await window.SPFirebase.update(roomPath(roomCode), {
      status: "playing",
      guesses: null,
      publicProgress: null,
      partyBoard: null,
      currentRound: {
        roundNumber: nextRoundNumber,
        answer,
        answerLength: Array.from(answer).length,
        startedAt: Date.now(),
        maxAttempts: room.settings.maxAttempts,
        status: "active",
        winnerUserId: null,
        solvedAt: null,
        revealStartedAt: null
      },
      updatedAt: window.SPFirebase.serverTimestamp()
    });
  }

  async function finishMatch(roomCode) {
    await window.SPFirebase.update(roomPath(roomCode), { status: "finished", updatedAt: window.SPFirebase.serverTimestamp() });
  }

  async function submitGuess(roomCode, userId, payload) {
    const idx = String(payload.attemptNumber - 1).padStart(2, "0");
    const updates = {};
    updates[`guesses/${userId}/${idx}`] = payload;
    updates[`publicProgress/${userId}`] = {
      attemptCount: payload.attemptNumber,
      lastGreenCount: payload.greenCount,
      lastYellowCount: payload.yellowCount,
      solved: payload.solved,
      elapsedMs: payload.elapsedMs,
      typing: false,
      updatedAt: Date.now()
    };
    if (payload.partyMode) {
      updates[`partyBoard/${Date.now()}_${userId}_${idx}`] = {
        userId,
        displayName: payload.displayName,
        guess: payload.guess,
        feedback: payload.feedback,
        attemptNumber: payload.attemptNumber,
        elapsedMs: payload.elapsedMs
      };
    }
    await window.SPFirebase.update(roomPath(roomCode), updates);
  }

  async function setTyping(roomCode, userId, typing) {
    if (!window.SPFirebase.configured) return;
    await window.SPFirebase.update(`${roomPath(roomCode)}/publicProgress/${userId}`, { typing: !!typing, updatedAt: Date.now() }).catch(() => {});
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

  window.SPRooms = { DEFAULT_SETTINGS, createRoom, joinRoom, subscribe, updateSettings, leave, backToLobby, startMatch, startNextRound, finishMatch, submitGuess, setTyping, endRound, addScore };
})();
