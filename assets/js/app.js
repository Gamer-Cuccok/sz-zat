(function () {
  const $ = id => document.getElementById(id);
  const state = {
    profile: null,
    roomCode: null,
    room: null,
    unsubRoom: null,
    currentInput: "",
    keyStates: {},
    roundAwardedKey: null,
    nextRoundTimerKey: null,
    clockTimer: null,
    typingTimer: null
  };

  const els = {};

  function collectEls() {
    [
      "landingView", "lobbyView", "gameView", "resultView", "displayNameInput", "roomCodeInput",
      "createRoomButton", "joinRoomButton", "copyRoomCodeButton", "playerList", "modeBadge", "startMatchButton",
      "leaveRoomButton", "lobbyMessage", "settingsForm", "settingMode", "settingMinLength", "settingMaxLength",
      "settingAttempts", "settingRounds", "settingTargetScore", "settingTimeLimit", "settingLongWords",
      "settingHostWords", "settingAddedAsAnswer", "roundLabel", "wordLengthLabel", "timerLabel", "attemptsLabel",
      "scoreLabel", "levelLabel", "xpLabel", "xpBar", "opponentPanel", "hostQuickAdd", "quickWordInput",
      "quickAccepted", "quickAnswer", "quickAddButton", "duelBoardWrap", "gameBoard", "boardTitle", "inputPreview",
      "keyboard", "partyBoards", "partyOwnBoard", "partyOtherBoard", "partyCentralBoard", "roundModal",
      "roundModalEyebrow", "roundModalTitle", "answerReveal", "roundModalText", "backToLobbyButton", "profileButton",
      "profileMenu", "matchResultTitle", "matchSummary", "rematchButton", "resultLobbyButton"
    ].forEach(id => { els[id] = $(id); });
  }

  function toast(message, type = "") {
    const host = $("toastHost");
    if (!host) return alert(message);
    const node = document.createElement("div");
    node.className = `toast ${type}`;
    node.textContent = message;
    host.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function showView(name) {
    [els.landingView, els.lobbyView, els.gameView, els.resultView].forEach(v => v && v.classList.remove("active"));
    if (els[name]) els[name].classList.add("active");
  }

  function isHost() {
    return state.room && state.profile && state.room.hostUserId === state.profile.userId;
  }

  function playersArray(room = state.room) {
    return Object.entries((room && room.players) || {}).map(([userId, p]) => ({ userId, ...p }));
  }

  function opponent() {
    return playersArray().find(p => p.userId !== state.profile.userId) || null;
  }

  function getSettingsFromForm() {
    return {
      mode: els.settingMode.value,
      minLength: Number(els.settingMinLength.value) || 3,
      maxLength: Number(els.settingMaxLength.value) || 8,
      maxAttempts: Number(els.settingAttempts.value) || 6,
      rounds: Number(els.settingRounds.value) || 5,
      targetScore: Number(els.settingTargetScore.value) || 0,
      timeLimitSeconds: Number(els.settingTimeLimit.value) || 0,
      allowLongWords: !!els.settingLongWords.checked,
      allowHostWords: !!els.settingHostWords.checked,
      addedWordsAsAnswers: !!els.settingAddedAsAnswer.checked
    };
  }

  function applySettingsToForm(settings) {
    const s = { ...window.SPRooms.DEFAULT_SETTINGS, ...(settings || {}) };
    els.settingMode.value = s.mode;
    els.settingMinLength.value = s.minLength;
    els.settingMaxLength.value = s.maxLength;
    els.settingAttempts.value = s.maxAttempts;
    els.settingRounds.value = s.rounds;
    els.settingTargetScore.value = s.targetScore;
    els.settingTimeLimit.value = s.timeLimitSeconds;
    els.settingLongWords.checked = !!s.allowLongWords;
    els.settingHostWords.checked = !!s.allowHostWords;
    els.settingAddedAsAnswer.checked = !!s.addedWordsAsAnswers;
  }

  function setSettingsDisabled(disabled) {
    els.settingsForm.querySelectorAll("input, select").forEach(el => { el.disabled = disabled; });
  }

  function renderProfile() {
    if (!state.profile) return;
    const stats = state.profile.stats || {};
    const info = window.SPScoring.levelFromXP(stats.totalXP || 0);
    els.levelLabel.textContent = `${info.level}. szint`;
    els.xpLabel.textContent = `${stats.totalXP || 0} XP`;
    els.xpBar.style.width = `${Math.min(100, Math.round((info.currentLevelXP / info.nextLevelXP) * 100))}%`;
    els.profileMenu.innerHTML = `
      <h3>${escapeHTML(state.profile.displayName)}</h3>
      <div class="stat"><span>Szint</span><strong>${info.level}</strong></div>
      <div class="stat"><span>Össz XP</span><strong>${stats.totalXP || 0}</strong></div>
      <div class="stat"><span>Nyert körök</span><strong>${stats.roundsWon || 0}</strong></div>
      <div class="stat"><span>Lejátszott körök</span><strong>${stats.totalRounds || 0}</strong></div>
      <div class="stat"><span>Leghosszabb szó</span><strong>${stats.longestSolvedWordLength || 0}</strong></div>
    `;
  }

  function escapeHTML(value) {
    return String(value || "").replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[ch]));
  }

  function renderLobby(room) {
    els.copyRoomCodeButton.textContent = state.roomCode || "----";
    els.modeBadge.textContent = room.settings && room.settings.mode === "party" ? "Party" : "1v1";
    const players = playersArray(room);
    els.playerList.innerHTML = players.map(p => `
      <div class="player-card">
        <div class="player-left">
          <span class="avatar" style="background:${p.color || "#ff4667"}">${escapeHTML((p.displayName || "?").slice(0, 1).toUpperCase())}</span>
          <div><strong>${escapeHTML(p.displayName)}</strong><br><small class="${p.connected ? "pill ok" : "pill warn"}">${p.connected ? "online" : "offline"}</small></div>
        </div>
        <div>${room.hostUserId === p.userId ? '<span class="host-badge">HOST</span>' : ""}</div>
      </div>
    `).join("");
    applySettingsToForm(room.settings);
    setSettingsDisabled(!isHost());
    els.startMatchButton.disabled = !isHost() || players.length < 2;
    els.lobbyMessage.textContent = players.length < 2 ? "Várakozás a másik játékosra…" : (isHost() ? "Indíthatod a meccset." : "A host indítja a meccset.");
  }

  function renderScore(room) {
    const players = playersArray(room);
    if (players.length < 2) {
      els.scoreLabel.textContent = "0 : 0";
      return;
    }
    els.scoreLabel.textContent = `${players[0].score || 0} : ${players[1].score || 0}`;
  }

  function renderOpponentPanel(room) {
    const opp = opponent();
    const panel = els.opponentPanel;
    if (!opp) {
      panel.innerHTML = '<p class="hint">Várakozás a másik játékosra…</p>';
      return;
    }
    const progress = room.publicProgress && room.publicProgress[opp.userId];
    if (!progress) {
      panel.innerHTML = `<div class="opponent-row"><span>${escapeHTML(opp.displayName)}</span><strong>${opp.connected ? "készen" : "offline"}</strong></div>`;
      return;
    }
    const time = formatTime(Math.round((progress.elapsedMs || 0) / 1000));
    panel.innerHTML = `
      <div class="opponent-row"><span>${escapeHTML(opp.displayName)}</span><strong>${progress.typing ? "gépel" : "figyel"}</strong></div>
      <div class="opponent-row"><span>Próbák</span><strong>${progress.attemptCount || 0}</strong></div>
      <div class="opponent-row"><span>Idő</span><strong>${time}</strong></div>
      ${progress.attemptCount ? `<div class="opponent-row"><span>Ellenfél ${progress.attemptCount}. tipp</span><strong>${progress.lastGreenCount || 0} zöld, ${progress.lastYellowCount || 0} sárga</strong></div>` : ""}
      ${progress.solved ? '<div class="opponent-row"><span>Állapot</span><strong>megfejtette</strong></div>' : ""}
    `;
  }

  function formatTime(seconds) {
    const s = Math.max(0, Number(seconds) || 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  function ownGuesses(room = state.room) {
    const branch = room && room.guesses && room.guesses[state.profile.userId];
    return Object.values(branch || {}).sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0));
  }

  function guessesForUser(userId, room = state.room) {
    const branch = room && room.guesses && room.guesses[userId];
    return Object.values(branch || {}).sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0));
  }

  function renderBoard(container, guesses, input, answerLength, maxAttempts, reveal = false) {
    if (!container) return;
    const rows = [];
    const inputLetters = Array.from(input || "");
    for (let r = 0; r < maxAttempts; r += 1) {
      const submitted = guesses[r];
      const cells = [];
      for (let c = 0; c < answerLength; c += 1) {
        let letter = "";
        let cls = "tile";
        if (submitted) {
          const fb = submitted.feedback && submitted.feedback[c];
          letter = fb ? fb.letter : (submitted.guess || "")[c] || "";
          cls += ` ${fb ? fb.state : "gray"}`;
          if (reveal || submitted.justSubmitted) cls += " reveal";
        } else if (r === guesses.length && inputLetters[c]) {
          letter = inputLetters[c];
          cls += " filled";
        }
        cells.push(`<span class="${cls}" style="animation-delay:${submitted ? c * 65 : 0}ms">${escapeHTML(letter)}</span>`);
      }
      const longClass = answerLength > 18 ? " long-row" : "";
      rows.push(`<div class="word-row${longClass}" data-length="${answerLength}">${cells.join("")}</div>`);
    }
    container.innerHTML = rows.join("");
  }

  function renderPartyBoards(room) {
    const players = playersArray(room);
    const own = state.profile.userId;
    const other = players.find(p => p.userId !== own);
    const round = room.currentRound || {};
    renderBoard(els.partyOwnBoard, guessesForUser(own, room), state.currentInput, round.answerLength, round.maxAttempts || room.settings.maxAttempts, true);
    renderBoard(els.partyOtherBoard, other ? guessesForUser(other.userId, room) : [], "", round.answerLength, round.maxAttempts || room.settings.maxAttempts, true);
    const central = Object.values(room.partyBoard || {}).sort((a, b) => (a.elapsedMs || 0) - (b.elapsedMs || 0));
    renderBoard(els.partyCentralBoard, central, "", round.answerLength, Math.max(round.maxAttempts || room.settings.maxAttempts, central.length || 1), true);
  }

  function renderKeyboard() {
    els.keyboard.innerHTML = window.SPGameEngine.KEYBOARD_ROWS.map(row => `
      <div class="key-row">
        ${row.map(key => {
          const label = key === "Backspace" ? "⌫" : key;
          const cls = key === "Enter" || key === "Backspace" ? "key wide" : "key";
          const stateCls = state.keyStates[key] ? ` ${state.keyStates[key]}` : "";
          return `<button class="${cls}${stateCls}" data-key="${key}" type="button">${label}</button>`;
        }).join("")}
      </div>
    `).join("");
    els.keyboard.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => handleKey(btn.dataset.key)));
  }

  function resetLocalRoundState() {
    state.currentInput = "";
    state.keyStates = {};
    els.inputPreview.textContent = "";
    renderKeyboard();
  }

  function renderGame(room) {
    const round = room.currentRound;
    if (!round) return;
    const mode = room.settings.mode;
    els.roundLabel.textContent = `${round.roundNumber}. kör`;
    els.wordLengthLabel.textContent = `${round.answerLength} betű`;
    els.attemptsLabel.textContent = `${round.maxAttempts || room.settings.maxAttempts} próba`;
    renderScore(room);
    renderOpponentPanel(room);
    els.hostQuickAdd.classList.toggle("hidden", !(isHost() && room.settings.allowHostWords));
    els.duelBoardWrap.classList.toggle("hidden", mode === "party");
    els.partyBoards.classList.toggle("hidden", mode !== "party");
    if (mode === "party") renderPartyBoards(room);
    else renderBoard(els.gameBoard, ownGuesses(room), state.currentInput, round.answerLength, round.maxAttempts || room.settings.maxAttempts, true);
    renderKeyboard();
    tickTimer();
  }

  function tickTimer() {
    if (!state.room || !state.room.currentRound) return;
    const round = state.room.currentRound;
    const end = round.solvedAt || Date.now();
    const elapsed = Math.floor((end - (round.startedAt || Date.now())) / 1000);
    els.timerLabel.textContent = formatTime(elapsed);
    const limit = Number(state.room.settings.timeLimitSeconds || 0);
    if (limit > 0 && round.status === "active" && elapsed >= limit) {
      const guesses = ownGuesses();
      if (guesses.length >= Number(round.maxAttempts || 0) || isHost()) {
        maybeEndFailedRound();
      }
    }
  }

  function startClock() {
    clearInterval(state.clockTimer);
    state.clockTimer = setInterval(tickTimer, 1000);
  }

  function handleRoomUpdate(room) {
    if (!room) {
      toast("A szoba megszűnt.", "error");
      showView("landingView");
      return;
    }
    const prevRoundId = state.room && state.room.currentRound ? state.room.currentRound.roundNumber : null;
    state.room = room;
    const currentRoundId = room.currentRound ? room.currentRound.roundNumber : null;

    if (prevRoundId !== currentRoundId) resetLocalRoundState();

    renderProfile();
    if (room.status === "lobby") {
      hideRoundModal();
      showView("lobbyView");
      renderLobby(room);
    } else if (room.status === "playing") {
      hideRoundModal();
      showView("gameView");
      renderGame(room);
      startClock();
    } else if (room.status === "roundEnd") {
      showView("gameView");
      renderGame(room);
      showRoundEnd(room);
      maybeScheduleNextRound(room);
      maybeAwardLossOrParty(room);
    } else if (room.status === "finished") {
      hideRoundModal();
      showView("resultView");
      renderMatchResult(room);
    }
  }

  function subscribeRoom(roomCode) {
    if (state.unsubRoom) state.unsubRoom();
    state.unsubRoom = window.SPRooms.subscribe(roomCode, handleRoomUpdate);
  }

  async function ensureProfile() {
    const name = els.displayNameInput.value.trim() || localStorage.getItem("szoparbaj.displayName") || "Játékos";
    state.profile = await window.SPProfile.load(name);
    renderProfile();
    return state.profile;
  }

  async function createRoom() {
    try {
      const profile = await ensureProfile();
      const code = await window.SPRooms.createRoom(profile);
      state.roomCode = code;
      subscribeRoom(code);
      toast("Szoba létrehozva.", "ok");
    } catch (err) { toast(err.message, "error"); }
  }

  async function joinRoom() {
    try {
      const profile = await ensureProfile();
      const code = await window.SPRooms.joinRoom(els.roomCodeInput.value, profile);
      state.roomCode = code;
      subscribeRoom(code);
      toast("Csatlakoztál a szobához.", "ok");
    } catch (err) { toast(err.message, "error"); }
  }

  async function updateSettingsDebounced() {
    if (!isHost() || !state.roomCode) return;
    const s = getSettingsFromForm();
    if (s.minLength > s.maxLength) s.maxLength = s.minLength;
    await window.SPRooms.updateSettings(state.roomCode, s).catch(err => toast(err.message, "error"));
  }

  async function startMatch() {
    if (!isHost()) return toast("Csak a host indíthatja el a játékot.", "error");
    const players = playersArray();
    if (players.length < 2) return toast("Várakozás a másik játékosra…", "error");
    try {
      const settings = getSettingsFromForm();
      const answer = window.SPWordService.randomAnswer(settings);
      await window.SPRooms.startMatch(state.roomCode, settings, answer);
      await window.SPProfile.incrementMatches();
      toast("Meccs indul!", "ok");
    } catch (err) { toast(err.message, "error"); }
  }

  function canInput() {
    return state.room && state.room.status === "playing" && state.room.currentRound && state.room.currentRound.status === "active";
  }

  async function handleKey(key) {
    if (!canInput()) return;
    const round = state.room.currentRound;
    const answerLength = round.answerLength;
    const guesses = ownGuesses();
    if (guesses.length >= round.maxAttempts) return;

    if (key === "Enter") return submitCurrentGuess();
    if (key === "Backspace") {
      state.currentInput = Array.from(state.currentInput).slice(0, -1).join("");
      window.SPAudio.play("key");
    } else {
      const normalized = window.SPGameEngine.normalizeWord(key);
      if (!window.SPGameEngine.isValidHungarianWordShape(normalized) || Array.from(normalized).length !== 1) return;
      if (Array.from(state.currentInput).length >= answerLength) return;
      state.currentInput += normalized;
      window.SPAudio.play("key");
    }
    els.inputPreview.textContent = state.currentInput.toLocaleUpperCase("hu-HU");
    renderGame(state.room);
    setTypingSoon();
  }

  function setTypingSoon() {
    if (!state.roomCode || !state.profile) return;
    window.SPRooms.setTyping(state.roomCode, state.profile.userId, true);
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => window.SPRooms.setTyping(state.roomCode, state.profile.userId, false), 900);
  }

  async function submitCurrentGuess() {
    if (!canInput()) return;
    const round = state.room.currentRound;
    const guesses = ownGuesses();
    const shape = window.SPGameEngine.validateGuessShape(state.currentInput, round.answerLength);
    if (!shape.ok) return invalidInput(shape.message);
    if (!window.SPWordService.isAccepted(shape.word)) return invalidInput("Ez a szó nem szerepel a szótárban.");
    if (guesses.some(g => g.guess === shape.word)) return invalidInput("Ezt a szót már tippelted.");

    const feedback = window.SPGameEngine.evaluateGuess(shape.word, round.answer);
    const counts = window.SPGameEngine.countFeedback(feedback);
    const solved = window.SPGameEngine.isSolved(feedback);
    const elapsedMs = Date.now() - (round.startedAt || Date.now());
    const attemptNumber = guesses.length + 1;
    const mode = state.room.settings.mode;
    const payload = {
      guess: shape.word,
      feedback,
      greenCount: counts.green,
      yellowCount: counts.yellow,
      solved,
      attemptNumber,
      elapsedMs,
      submittedAt: Date.now(),
      partyMode: mode === "party",
      displayName: state.profile.displayName
    };

    await window.SPRooms.submitGuess(state.roomCode, state.profile.userId, payload);
    feedback.forEach(item => { state.keyStates[item.letter] = window.SPGameEngine.mergeKeyState(state.keyStates[item.letter], item.state); });
    state.currentInput = "";
    els.inputPreview.textContent = "";
    window.SPAudio.play(solved ? "correct" : "reveal");

    if (solved) {
      const seconds = Math.round(elapsedMs / 1000);
      const score = window.SPScoring.calculateRoundScore({
        wordLength: round.answerLength,
        maxAttempts: round.maxAttempts,
        attemptsUsed: attemptNumber,
        elapsedSeconds: seconds,
        timeLimitSeconds: state.room.settings.timeLimitSeconds,
        won: mode === "duel"
      });
      await window.SPRooms.addScore(state.roomCode, state.profile.userId, score.totalRoundPoints, mode === "duel");
      await window.SPProfile.applyRoundResult({ solved: true, won: mode === "duel", partySolved: mode === "party", attemptsUsed: attemptNumber, elapsedSeconds: seconds, wordLength: round.answerLength, roundScore: score.totalRoundPoints, xp: score.xp });
      renderProfile();
      await window.SPRooms.endRound(state.roomCode, state.profile.userId, Date.now());
      return;
    }

    if (attemptNumber >= round.maxAttempts) {
      await maybeEndFailedRound();
    }
  }

  function invalidInput(message) {
    toast(message, "error");
    window.SPAudio.play("invalid");
    const row = document.querySelector(".word-row:nth-child(" + (ownGuesses().length + 1) + ")");
    if (row) {
      row.classList.remove("shake");
      void row.offsetWidth;
      row.classList.add("shake");
    }
  }

  async function maybeEndFailedRound() {
    if (!state.room || !state.room.currentRound || state.room.currentRound.status !== "active") return;
    const round = state.room.currentRound;
    const players = playersArray();
    const allDone = players.every(p => {
      const progress = state.room.publicProgress && state.room.publicProgress[p.userId];
      return progress && (progress.solved || progress.attemptCount >= round.maxAttempts);
    });
    const limit = Number(state.room.settings.timeLimitSeconds || 0);
    const timedOut = limit > 0 && Date.now() - round.startedAt >= limit * 1000;
    if (allDone || timedOut) {
      if (isHost()) await window.SPRooms.endRound(state.roomCode, null, Date.now());
      else toast("Várakozás a másik játékosra…");
    }
  }

  function showRoundEnd(room) {
    const round = room.currentRound;
    const winner = round.winnerUserId ? (room.players && room.players[round.winnerUserId]) : null;
    const amWinner = round.winnerUserId === state.profile.userId;
    els.roundModal.classList.remove("hidden");
    els.roundModalTitle.textContent = winner ? (amWinner ? "Te nyerted a kört!" : `${winner.displayName} megfejtette!`) : "Kör vége";
    els.roundModalText.textContent = winner ? "A következő kör mindjárt indul." : "Senki sem fejtette meg időben. Jön a következő kör.";
    revealAnswer(round.answer, winner && winner.color ? winner.color : "#39d98a");
    window.SPAudio.play(amWinner ? "win" : (winner ? "lose" : "next"));
  }

  function revealAnswer(answer, color) {
    const letters = Array.from(answer || "");
    els.answerReveal.innerHTML = letters.map((ch, i) => `<span class="answer-letter" style="background:${color}; animation-delay:${i * 80}ms">${escapeHTML(ch)}</span>`).join("");
  }

  function hideRoundModal() { els.roundModal.classList.add("hidden"); }

  async function maybeAwardLossOrParty(room) {
    const round = room.currentRound;
    if (!round || !state.profile) return;
    const key = `${state.roomCode}:${round.roundNumber}`;
    if (state.roundAwardedKey === key) return;
    const myGuesses = ownGuesses(room);
    const mySolved = myGuesses.some(g => g.solved);
    if (mySolved) {
      state.roundAwardedKey = key;
      return;
    }
    const winnerExists = !!round.winnerUserId;
    const shouldAwardLoss = room.settings.mode === "duel" && (winnerExists || room.status === "roundEnd");
    if (!shouldAwardLoss) return;
    state.roundAwardedKey = key;
    await window.SPProfile.applyRoundResult({ solved: false, won: false, partySolved: false, attemptsUsed: myGuesses.length, elapsedSeconds: Math.round(((round.solvedAt || Date.now()) - round.startedAt) / 1000), wordLength: round.answerLength, roundScore: 0, xp: Math.round(round.answerLength * 2) });
    renderProfile();
  }

  function shouldFinishAfterRound(room) {
    const settings = room.settings || {};
    const roundNumber = room.currentRound ? Number(room.currentRound.roundNumber || 1) : 1;
    const byRounds = roundNumber >= Number(settings.rounds || 1);
    const target = Number(settings.targetScore || 0);
    const byScore = target > 0 && playersArray(room).some(p => (p.score || 0) >= target);
    return byRounds || byScore;
  }

  function maybeScheduleNextRound(room) {
    if (!isHost() || !room.currentRound) return;
    const key = `${state.roomCode}:${room.currentRound.roundNumber}:${room.currentRound.revealStartedAt || "end"}`;
    if (state.nextRoundTimerKey === key) return;
    state.nextRoundTimerKey = key;
    setTimeout(async () => {
      const latest = await window.SPFirebase.get(`rooms/${state.roomCode}`).catch(() => null);
      if (!latest || latest.status !== "roundEnd") return;
      if (shouldFinishAfterRound(latest)) await window.SPRooms.finishMatch(state.roomCode);
      else {
        const answer = window.SPWordService.randomAnswer(latest.settings || window.SPRooms.DEFAULT_SETTINGS);
        await window.SPRooms.startNextRound(state.roomCode, answer);
        window.SPAudio.play("next");
      }
    }, 3600);
  }

  function renderMatchResult(room) {
    const players = playersArray(room).sort((a, b) => (b.score || 0) - (a.score || 0));
    const winner = players[0];
    els.matchResultTitle.textContent = winner ? `Győztes: ${winner.displayName}` : "Meccs vége";
    els.matchSummary.innerHTML = players.map((p, idx) => `
      <div class="summary-row"><span>${idx + 1}. ${escapeHTML(p.displayName)}</span><strong>${p.score || 0} pont • ${p.roundWins || 0} kör</strong></div>
    `).join("");
  }

  async function quickAddWord() {
    if (!isHost()) return;
    try {
      const word = els.quickWordInput.value;
      const entry = await window.SPWordService.addDynamicWord({
        word,
        isAccepted: els.quickAccepted.checked,
        isAnswer: els.quickAnswer.checked && state.room.settings.addedWordsAsAnswers,
        addedBy: state.profile.userId,
        source: "host-quick-add"
      });
      els.quickWordInput.value = "";
      toast(`Hozzáadva: ${entry.word}. Mostantól elfogadott tipp.`, "ok");
    } catch (err) { toast(err.message, "error"); }
  }

  async function leaveRoom() {
    if (state.roomCode && state.profile) await window.SPRooms.leave(state.roomCode, state.profile.userId).catch(() => {});
    if (state.unsubRoom) state.unsubRoom();
    state.roomCode = null;
    state.room = null;
    showView("landingView");
  }

  async function backToLobby() {
    if (!isHost()) return toast("Csak a host küldhet vissza lobbyba.", "error");
    await window.SPRooms.backToLobby(state.roomCode);
  }

  async function rematch() {
    if (!isHost()) {
      showView("lobbyView");
      return toast("A visszavágót a host indítja.");
    }
    const answer = window.SPWordService.randomAnswer(state.room.settings || window.SPRooms.DEFAULT_SETTINGS);
    await window.SPRooms.startMatch(state.roomCode, state.room.settings || window.SPRooms.DEFAULT_SETTINGS, answer);
  }

  function bindEvents() {
    els.createRoomButton.addEventListener("click", createRoom);
    els.joinRoomButton.addEventListener("click", joinRoom);
    els.copyRoomCodeButton.addEventListener("click", async () => {
      await navigator.clipboard.writeText(state.roomCode || "").catch(() => {});
      toast("Szobakód másolva.", "ok");
    });
    els.startMatchButton.addEventListener("click", startMatch);
    els.leaveRoomButton.addEventListener("click", leaveRoom);
    els.backToLobbyButton.addEventListener("click", backToLobby);
    els.resultLobbyButton.addEventListener("click", backToLobby);
    els.rematchButton.addEventListener("click", rematch);
    els.quickAddButton.addEventListener("click", quickAddWord);
    els.profileButton.addEventListener("click", () => els.profileMenu.classList.toggle("hidden"));
    els.settingsForm.querySelectorAll("input, select").forEach(el => el.addEventListener("change", updateSettingsDebounced));
    document.addEventListener("keydown", ev => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) && document.activeElement.id !== "displayNameInput") return;
      if (ev.key === "Enter") handleKey("Enter");
      else if (ev.key === "Backspace") handleKey("Backspace");
      else if (ev.key && ev.key.length === 1) handleKey(ev.key);
    });
  }

  async function init() {
    collectEls();
    window.SPAudio.bindControls();
    bindEvents();
    els.displayNameInput.value = localStorage.getItem("szoparbaj.displayName") || "";
    renderKeyboard();
    try {
      await window.SPWordService.init();
    } catch (err) {
      toast(err.message, "error");
    }
    try {
      state.profile = await window.SPProfile.load(els.displayNameInput.value || undefined);
      renderProfile();
    } catch (err) {}
  }

  document.addEventListener("DOMContentLoaded", init);
})();
