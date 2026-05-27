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
    typingTimer: null,
    partyInputTimer: null,
    lastWordNoticeId: null,
    lastPendingWordRequestNoticeId: null,
    opponentRevealUnlockedKey: null,
    localTypingActive: false,
    lastPartyLiveInputPublished: null
  };

  const els = {};
  const OPPONENT_REVEAL_AFTER_MS = 10 * 60 * 1000;
  const ROUND_END_DISPLAY_MS = 7200;

  function collectEls() {
    [
      "landingView", "lobbyView", "gameView", "resultView", "displayNameInput", "roomCodeInput",
      "createRoomButton", "soloGameButton", "joinRoomButton", "copyRoomCodeButton", "playerList", "modeBadge", "startMatchButton",
      "leaveRoomButton", "lobbyMessage", "settingsForm", "settingMode", "settingMinLength", "settingMaxLength",
      "settingAttempts", "settingRounds", "settingTargetScore", "settingTimeLimit", "settingFailoverTimer", "settingLongWords",
      "settingHostWords", "roundLabel", "wordLengthLabel", "timerLabel", "failoverLabel", "attemptsLabel",
      "scoreLabel", "levelLabel", "xpLabel", "xpBar", "opponentPanelTitle", "opponentPanel", "hostQuickAdd", "quickWordInput",
      "quickAddButton", "wordRequestList", "duelBoardWrap", "gameBoard", "boardTitle", "inputPreview",
      "keyboard", "partyBoards", "partyOwnBoard", "partyOtherBoard", "partyCentralBoard", "roundModal",
      "roundModalEyebrow", "roundModalTitle", "answerReveal", "roundModalText", "wordApprovalDock", "backToLobbyButton", "profileButton",
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
    const isGame = name === "gameView";
    document.body.classList.toggle("is-game-screen", isGame);
    if (!isGame) document.body.classList.remove("is-party-mode");
    if (window.SPAudio && window.SPAudio.setGameActive) window.SPAudio.setGameActive(isGame);
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
      failoverTimerSeconds: Number(els.settingFailoverTimer.value) || 300,
      allowLongWords: !!els.settingLongWords.checked,
      allowHostWords: !!els.settingHostWords.checked
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
    els.settingTimeLimit.value = s.timeLimitSeconds || 0;
    els.settingFailoverTimer.value = s.failoverTimerSeconds || 300;
    els.settingLongWords.checked = !!s.allowLongWords;
    els.settingHostWords.checked = !!s.allowHostWords;
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
    els.modeBadge.textContent = room.settings && room.settings.mode === "party" ? "Party" : (room.settings && room.settings.mode === "solo" ? "Solo" : "1v1");
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
    const mode = room.settings && room.settings.mode ? room.settings.mode : "duel";
    const needsSecondPlayer = mode !== "solo" && players.length < 2;
    els.startMatchButton.disabled = !isHost() || needsSecondPlayer;
    if (mode === "solo") els.lobbyMessage.textContent = isHost() ? "Solo módban egyedül is indíthatod a játékot." : "Solo szoba.";
    else els.lobbyMessage.textContent = players.length < 2 ? "Várakozás a másik játékosra…" : (isHost() ? "Indíthatod a meccset." : "A host indítja a meccset.");
  }

  function renderScore(room) {
    const players = playersArray(room);
    const mode = room && room.settings ? room.settings.mode : "duel";
    if (mode === "solo") {
      const me = state.profile && players.find(p => p.userId === state.profile.userId);
      els.scoreLabel.textContent = `${me ? me.score || 0 : 0} pont`;
      return;
    }
    if (players.length < 2) {
      els.scoreLabel.textContent = "0 : 0";
      return;
    }
    els.scoreLabel.textContent = `${players[0].score || 0} : ${players[1].score || 0}`;
  }

  function renderOpponentPanel(room) {
    const opp = opponent();
    const panel = els.opponentPanel;
    if (room && room.settings && room.settings.mode === "solo") {
      const round = room.currentRound || {};
      const myProgress = room.publicProgress && state.profile ? room.publicProgress[state.profile.userId] : null;
      panel.innerHTML = `
        <div class="opponent-head solo-head">
          <div><strong>Solo mód</strong><small>gyakorló kör, ellenfél nélkül</small></div>
          <span class="mini-status">${myProgress ? myProgress.attemptCount || 0 : 0}/${round.maxAttempts || room.settings.maxAttempts || 0}</span>
        </div>
        <div class="opponent-row"><span>Cél</span><strong>Fejtsd meg a szót minél gyorsabban</strong></div>
        <div class="opponent-row"><span>Pont</span><strong>${(playersArray(room).find(p => p.userId === state.profile.userId) || {}).score || 0}</strong></div>
      `;
      return;
    }
    if (!opp) {
      panel.innerHTML = '<p class="hint">Várakozás a másik játékosra…</p>';
      return;
    }
    const progress = room.publicProgress && room.publicProgress[opp.userId];
    const attempts = Object.values((room.publicAttempts && room.publicAttempts[opp.userId]) || {})
      .sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0));
    const myGuesses = ownGuesses(room);
    const round = room.currentRound || {};
    const mySolved = myGuesses.some(g => g && g.solved);
    const maxAttempts = round.maxAttempts || room.settings.maxAttempts || 0;
    const myOutOfGuesses = !mySolved && round.status === "active" && myGuesses.length >= maxAttempts;
    const tenMinuteUnlock = round.status === "active" && Date.now() - (round.startedAt || Date.now()) >= OPPONENT_REVEAL_AFTER_MS;
    const revealOpponentLetters = myOutOfGuesses || tenMinuteUnlock || round.status !== "active" || room.status === "roundEnd";
    const unlockText = myOutOfGuesses
      ? "Elfogytak a próbáid, most már láthatod az ellenfél tippjeit."
      : (tenMinuteUnlock ? "Eltelt 10 perc, most már mindketten látjátok egymás tippjeit." : "");
    const time = progress ? formatTime(Math.round((progress.elapsedMs || 0) / 1000)) : "00:00";
    panel.innerHTML = `
      <div class="opponent-head">
        <div><strong>${escapeHTML(opp.displayName)}</strong><small>${progress && progress.typing ? "gépel" : (opp.connected ? "figyel" : "offline")}</small></div>
        <span class="mini-status">${progress && progress.solved ? "megfejtette" : `${progress ? progress.attemptCount || 0 : 0}/${maxAttempts}`}</span>
      </div>
      ${unlockText ? `<div class="opponent-unlocked">${unlockText}</div>` : ""}
      <div class="opponent-mini-board ${revealOpponentLetters ? "show-letters" : ""}" aria-label="Ellenfél táblája">${renderOpponentMiniBoard(attempts, round.answerLength || 0, maxAttempts, revealOpponentLetters)}</div>
      <div class="opponent-row"><span>Idő</span><strong>${time}</strong></div>
      ${progress && progress.lastGreenCount !== undefined ? `<div class="opponent-row"><span>Utolsó tipp</span><strong>${progress.lastGreenCount || 0} zöld, ${progress.lastYellowCount || 0} sárga</strong></div>` : ""}
    `;
  }

  function renderOpponentMiniBoard(attempts, answerLength, maxAttempts, revealLetters = false) {
    const rows = [];
    const len = Math.max(0, Number(answerLength) || 0);
    const max = Math.max(0, Number(maxAttempts) || 0);
    for (let r = 0; r < max; r += 1) {
      const attempt = attempts[r];
      const letters = revealLetters && attempt && attempt.guess ? Array.from(attempt.guess) : [];
      const cells = [];
      for (let c = 0; c < len; c += 1) {
        const stateName = attempt && attempt.states ? attempt.states[c] : "blank";
        const letter = revealLetters ? (letters[c] || "") : "";
        cells.push(`<span class="mini-tile ${stateName || "blank"}${letter ? " has-letter" : ""}">${escapeHTML(letter)}</span>`);
      }
      rows.push(`<div class="mini-row" data-length="${len}">${cells.join("")}</div>`);
    }
    return rows.join("");
  }

  function renderWordRequests(room) {
    if (!els.wordRequestList || !state.profile) return;
    if (room && room.settings && room.settings.mode === "solo") {
      if (els.hostQuickAdd) els.hostQuickAdd.classList.remove("needs-attention");
      els.wordRequestList.innerHTML = '<p class="hint tight">Solo módban a beírt szó azonnal bekerül a játék szótárába.</p>';
      return;
    }
    const requests = Object.entries((room && room.wordRequests) || {})
      .map(([id, req]) => ({ id, ...req }))
      .filter(req => req && req.word)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const pendingForMe = requests.some(req => (req.status || "pending") === "pending" && req.requestedBy !== state.profile.userId);
    if (els.hostQuickAdd) els.hostQuickAdd.classList.toggle("needs-attention", pendingForMe);

    const rows = [];
    const last = room && room.lastWordAdded;
    if (last && last.word) {
      rows.push(`<div class="word-request approved latest"><div><strong>${escapeHTML(last.word)}</strong><small>Legutóbb hozzáadva a közös szótárhoz</small></div><span class="request-pill ok">aktív</span></div>`);
    }

    requests.slice(0, 6).forEach(req => {
      const mine = req.requestedBy === state.profile.userId;
      const status = req.status || "pending";
      let badge = '<span class="request-pill wait">várakozik</span>';
      let text = mine ? "a te javaslatod" : "ellenfél javaslata";
      if (status === "pending" && !mine) text = "jobb fent tudod elfogadni vagy elutasítani";
      else if (status === "pending" && mine) text = "vár az ellenfél jóváhagyására";
      else if (status === "approved") { badge = '<span class="request-pill ok">elfogadva</span>'; text = "bekerült a játék szótárába"; }
      else if (status === "rejected") { badge = '<span class="request-pill no">elutasítva</span>'; text = mine ? "az ellenfél elutasította" : "elutasítva"; }
      rows.push(`<div class="word-request ${status}"><div><strong>${escapeHTML(req.word)}</strong><small>${text}</small></div>${badge}</div>`);
    });

    if (!rows.length) {
      els.wordRequestList.innerHTML = '<p class="hint tight">Itt jelenik meg, milyen szavak lettek javasolva vagy hozzáadva.</p>';
      return;
    }
    els.wordRequestList.innerHTML = rows.join("");
  }

  function renderWordApprovalDock(room) {
    if (!els.wordApprovalDock || !state.profile) return;
    if (!room || !room.wordRequests || (room.settings && room.settings.mode === "solo")) {
      els.wordApprovalDock.innerHTML = "";
      els.wordApprovalDock.classList.add("hidden");
      return;
    }
    const pending = Object.entries(room.wordRequests)
      .map(([id, req]) => ({ id, ...req }))
      .filter(req => req && req.word && (req.status || "pending") === "pending" && req.requestedBy !== state.profile.userId)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (!pending.length) {
      els.wordApprovalDock.innerHTML = "";
      els.wordApprovalDock.classList.add("hidden");
      return;
    }
    els.wordApprovalDock.classList.remove("hidden");
    els.wordApprovalDock.innerHTML = pending.slice(0, 3).map(req => `
      <div class="approval-pop">
        <div class="approval-copy">
          <span>Új szó-javaslat</span>
          <strong>${escapeHTML(req.word)}</strong>
          <small>${escapeHTML(req.requestedByName || "Ellenfél")} küldte. Nem állítja meg a játékot.</small>
        </div>
        <div class="approval-actions">
          <button type="button" class="tiny-btn approve-btn" data-word-action="approve" data-request-id="${escapeHTML(req.id)}">Elfogadom</button>
          <button type="button" class="ghost-btn tiny-btn reject-btn" data-word-action="reject" data-request-id="${escapeHTML(req.id)}">Elutasítom</button>
        </div>
      </div>
    `).join("");
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

  function centralPartyGuesses(room = state.room) {
    return Object.values((room && room.partyBoard) || {}).sort((a, b) => {
      const aTime = Number(a.elapsedMs || a.submittedAt || 0);
      const bTime = Number(b.elapsedMs || b.submittedAt || 0);
      if (aTime !== bTime) return aTime - bTime;
      return String(a.userId || "").localeCompare(String(b.userId || ""));
    });
  }

  function boardSignature(guesses, answerLength, maxAttempts) {
    const stableGuesses = (guesses || []).map(g => ({
      attemptNumber: g.attemptNumber || 0,
      guess: g.guess || "",
      states: (g.feedback || []).map(fb => fb.state).join("")
    }));
    return JSON.stringify({ answerLength, maxAttempts, guesses: stableGuesses });
  }

  function buildInputHints(guesses, answerLength) {
    const greenAt = Array.from({ length: answerLength }, () => new Set());
    const yellowAt = Array.from({ length: answerLength }, () => new Set());
    const present = new Set();
    const graySeen = new Set();

    (guesses || []).forEach(guess => {
      (guess.feedback || []).forEach((fb, index) => {
        const letter = fb && fb.letter;
        if (!letter) return;
        if (fb.state === "green") {
          greenAt[index] && greenAt[index].add(letter);
          present.add(letter);
        } else if (fb.state === "yellow") {
          yellowAt[index] && yellowAt[index].add(letter);
          present.add(letter);
        } else if (fb.state === "gray") {
          graySeen.add(letter);
        }
      });
    });

    const absent = new Set([...graySeen].filter(letter => !present.has(letter)));
    return { greenAt, yellowAt, present, absent };
  }

  function inputHintClass(letter, index, hints) {
    if (!letter || !hints) return "";
    const locked = hints.greenAt[index] && hints.greenAt[index].size > 0;
    if (hints.greenAt[index] && hints.greenAt[index].has(letter)) return " hint-green";
    if (locked) return " hint-red";
    if (hints.absent.has(letter)) return " hint-red";
    if (hints.yellowAt[index] && hints.yellowAt[index].has(letter)) return " hint-yellow";
    if (hints.present.has(letter)) return " hint-yellow";
    return "";
  }

  function keyStatesFromGuesses(guesses) {
    const states = {};
    (guesses || []).forEach(guess => {
      (guess.feedback || []).forEach(item => {
        if (!item || !item.letter || !item.state) return;
        states[item.letter] = window.SPGameEngine.mergeKeyState(states[item.letter], item.state);
      });
    });
    return states;
  }

  function hintGuessesForRoom(room = state.room) {
    if (!room || !room.settings) return [];
    if (room.settings.mode === "party") {
      // Party mode is cooperative: every submitted party guess teaches both
      // players the same information. Use the shared central board for live
      // input outlines and keyboard coloring, not only my personal board.
      return centralPartyGuesses(room);
    }
    return ownGuesses(room);
  }

  function renderBoard(container, guesses, input, answerLength, maxAttempts, reveal = false, hintGuesses = null) {
    if (!container) return;
    const safeGuesses = guesses || [];
    const signature = boardSignature(safeGuesses, answerLength, maxAttempts);

    // Important: do not rebuild the whole board while the player is typing.
    // Replacing innerHTML on every keypress restarts layout/animations and makes
    // already submitted words look like they are wobbling. Rebuild only when the
    // real board state changes, then update just the active input row.
    if (container.dataset.boardSignature !== signature) {
      const rows = [];
      for (let r = 0; r < maxAttempts; r += 1) {
        const submitted = safeGuesses[r];
        const cells = [];
        for (let c = 0; c < answerLength; c += 1) {
          let letter = "";
          let cls = "tile";
          if (submitted) {
            const fb = submitted.feedback && submitted.feedback[c];
            letter = fb ? fb.letter : Array.from(submitted.guess || "")[c] || "";
            cls += ` ${fb ? fb.state : "gray"}`;
            if (submitted.justSubmitted) cls += " reveal";
          }
          cells.push(`<span class="${cls}" data-cell="${c}" style="animation-delay:${submitted ? c * 65 : 0}ms">${escapeHTML(letter)}</span>`);
        }
        const longClass = answerLength > 18 ? " long-row" : "";
        rows.push(`<div class="word-row${longClass}" data-row="${r}" data-length="${answerLength}">${cells.join("")}</div>`);
      }
      container.innerHTML = rows.join("");
      container.dataset.boardSignature = signature;
    }

    updateActiveInputRow(container, safeGuesses.length, input, answerLength, maxAttempts, hintGuesses || safeGuesses);
  }

  function updateActiveInputRow(container, activeRowIndex, input, answerLength, maxAttempts, hintGuesses = []) {
    const inputLetters = Array.from(input || "");
    const hints = buildInputHints(hintGuesses, answerLength);
    for (let r = 0; r < maxAttempts; r += 1) {
      const row = container.querySelector(`.word-row[data-row="${r}"]`);
      if (!row) continue;
      const isSubmittedRow = r < activeRowIndex;
      if (isSubmittedRow) continue;
      row.querySelectorAll(".tile").forEach((tile, c) => {
        const letter = r === activeRowIndex ? (inputLetters[c] || "") : "";
        const nextClass = letter ? `tile live-filled${inputHintClass(letter, c, hints)}` : "tile";
        if (tile.textContent !== letter) tile.textContent = letter;
        if (tile.className !== nextClass) tile.className = nextClass;
        tile.style.animationDelay = "0ms";
      });
    }
  }

  function renderPartyBoards(room) {
    const players = playersArray(room);
    const own = state.profile.userId;
    const other = players.find(p => p.userId !== own);
    const round = room.currentRound || {};
    const maxAttempts = round.maxAttempts || room.settings.maxAttempts;
    const ownGuessesList = guessesForUser(own, room);
    const otherGuessesList = other ? guessesForUser(other.userId, room) : [];
    const otherProgress = other && room.publicProgress ? room.publicProgress[other.userId] : null;
    const otherLive = other && room.partyLiveInputs ? room.partyLiveInputs[other.userId] : null;
    const otherLiveInput = otherLive && typeof otherLive.currentInput === "string"
      ? otherLive.currentInput
      : (otherProgress ? (otherProgress.currentInput || "") : "");
    const central = centralPartyGuesses(room);

    // Party mode: the central board is the real shared attempt pool.
    // The two small boards below only show who typed/submitted what, including live input.
    renderBoard(els.partyCentralBoard, central, "", round.answerLength, maxAttempts, true, central);
    renderBoard(els.partyOwnBoard, ownGuessesList, state.currentInput, round.answerLength, Math.max(maxAttempts, ownGuessesList.length + 1), true, central);
    renderBoard(els.partyOtherBoard, otherGuessesList, otherLiveInput, round.answerLength, Math.max(maxAttempts, otherGuessesList.length + 1), true, central);
    if (els.partyOtherBoard) {
      const otherCard = els.partyOtherBoard.closest(".party-player-board");
      if (otherCard) otherCard.classList.toggle("party-live-active", !!otherLiveInput);
    }
  }

  function renderKeyboard() {
    const signature = JSON.stringify(state.keyStates || {});
    if (els.keyboard.dataset.keyboardSignature === signature && els.keyboard.children.length) return;
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
    els.keyboard.dataset.keyboardSignature = signature;
  }

  function updateCurrentInputVisuals() {
    if (!state.room || !state.room.currentRound) return;
    const round = state.room.currentRound;
    const maxAttempts = round.maxAttempts || state.room.settings.maxAttempts;
    els.inputPreview.textContent = state.currentInput.toLocaleUpperCase("hu-HU");
    if (state.room.settings.mode === "party") {
      renderBoard(
        els.partyOwnBoard,
        guessesForUser(state.profile.userId, state.room),
        state.currentInput,
        round.answerLength,
        maxAttempts,
        true,
        hintGuessesForRoom(state.room)
      );
    } else {
      renderBoard(els.gameBoard, ownGuesses(state.room), state.currentInput, round.answerLength, maxAttempts, true);
    }
  }

  function resetLocalRoundState() {
    state.currentInput = "";
    state.keyStates = {};
    state.opponentRevealUnlockedKey = null;
    state.lastPartyLiveInputPublished = null;
    els.inputPreview.textContent = "";
    renderKeyboard();
  }

  function renderGame(room) {
    const round = room.currentRound;
    if (!round) return;
    const mode = room.settings.mode;
    document.body.classList.toggle("is-party-mode", mode === "party");
    if (els.boardTitle) els.boardTitle.textContent = mode === "solo" ? "Solo táblád" : "Saját táblád";
    if (els.opponentPanelTitle) els.opponentPanelTitle.textContent = mode === "solo" ? "Solo állapot" : "Másik játékos";
    els.roundLabel.textContent = `${round.roundNumber}. kör`;
    els.wordLengthLabel.textContent = `${round.answerLength} betű`;
    els.attemptsLabel.textContent = `${round.maxAttempts || room.settings.maxAttempts} próba`;
    if (els.failoverLabel) {
      els.failoverLabel.classList.toggle("hidden", !round.failureDeadlineAt || round.status !== "active");
      if (round.failureDeadlineAt && round.status === "active") {
        const left = Math.max(0, Math.ceil((round.failureDeadlineAt - Date.now()) / 1000));
        els.failoverLabel.textContent = `Végjáték: ${formatTime(left)}`;
      }
    }
    renderScore(room);
    renderOpponentPanel(room);
    renderWordRequests(room);
    renderWordApprovalDock(room);
    els.hostQuickAdd.classList.toggle("hidden", !room.settings.allowHostWords);
    els.duelBoardWrap.classList.toggle("hidden", mode === "party");
    els.partyBoards.classList.toggle("hidden", mode !== "party");
    state.keyStates = keyStatesFromGuesses(mode === "party" ? centralPartyGuesses(room) : ownGuesses(room));
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

    if (els.failoverLabel) {
      const showFailover = !!round.failureDeadlineAt && round.status === "active";
      els.failoverLabel.classList.toggle("hidden", !showFailover);
      if (showFailover) {
        const left = Math.max(0, Math.ceil((round.failureDeadlineAt - Date.now()) / 1000));
        els.failoverLabel.textContent = `Végjáték: ${formatTime(left)}`;
      }
    }

    if (round.status === "active") {
      const unlockKey = state.roomCode && round.roundNumber ? `${state.roomCode}:${round.roundNumber}:opponent-letters` : "";
      const shouldUnlockOpponentLetters = state.room && state.room.settings && state.room.settings.mode === "duel" && Date.now() - (round.startedAt || Date.now()) >= OPPONENT_REVEAL_AFTER_MS;
      if (shouldUnlockOpponentLetters && state.opponentRevealUnlockedKey !== unlockKey) {
        state.opponentRevealUnlockedKey = unlockKey;
        renderOpponentPanel(state.room);
      }
      maybeEndFailedRound(false);
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
    renderWordApprovalDock(room);
    maybeShowWordAddedNotice(room);
    maybeShowPendingWordRequestNotice(room);
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

  function maybeShowWordAddedNotice(room) {
    const evt = room && room.lastWordAdded;
    if (!evt || !evt.id) return;
    if (evt.word && window.SPWordService && window.SPWordService.addLocalWord) {
      window.SPWordService.addLocalWord({
        word: evt.word,
        addedBy: evt.addedBy,
        addedByName: evt.addedByName,
        addedAt: evt.addedAt,
        source: "room-approved"
      });
    }
    if (state.lastWordNoticeId === evt.id) return;
    state.lastWordNoticeId = evt.id;
    const mine = state.profile && evt.addedBy === state.profile.userId;
    const who = mine ? "A szavad jóvá lett hagyva" : `${evt.addedByName || "A másik játékos"} új szava jóváhagyva`;
    toast(`${who}: ${evt.word}. Mostantól tippelhető, és következő köröktől megfejtés is lehet.`, "ok");
  }

  function maybeShowPendingWordRequestNotice(room) {
    if (!room || !state.profile || (room.settings && room.settings.mode === "solo")) return;
    const pending = Object.entries(room.wordRequests || {})
      .map(([id, req]) => ({ id, ...req }))
      .filter(req => req && req.word && (req.status || "pending") === "pending" && req.requestedBy !== state.profile.userId)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    if (!pending || state.lastPendingWordRequestNoticeId === pending.id) return;
    state.lastPendingWordRequestNoticeId = pending.id;
    toast(`Új szó vár jóváhagyásra: ${pending.word}. Jobb fent tudod elfogadni vagy elutasítani.`, "ok");
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

  async function startSoloGame() {
    if (window.SPAudio && window.SPAudio.wake) window.SPAudio.wake();
    try {
      const profile = await ensureProfile();
      const settings = { ...window.SPRooms.DEFAULT_SETTINGS, mode: "solo", rounds: 5, targetScore: 0 };
      const code = await window.SPRooms.createRoom(profile);
      state.roomCode = code;
      subscribeRoom(code);
      const answer = window.SPWordService.randomAnswer(settings);
      await window.SPRooms.startMatch(code, settings, answer);
      await window.SPProfile.incrementMatches();
      toast("Solo játék indul!", "ok");
    } catch (err) { toast(err.message, "error"); }
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
    if (window.SPAudio && window.SPAudio.wake) window.SPAudio.wake();
    if (!isHost()) return toast("Csak a host indíthatja el a játékot.", "error");
    const players = playersArray();
    try {
      const settings = getSettingsFromForm();
      if (settings.mode !== "solo" && players.length < 2) return toast("Várakozás a másik játékosra…", "error");
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
    if (window.SPAudio && window.SPAudio.wake) window.SPAudio.wake();
    if (!canInput()) return;
    const round = state.room.currentRound;
    const answerLength = round.answerLength;
    const mode = state.room.settings.mode;
    const guesses = ownGuesses();
    const centralUsed = mode === "party" ? centralPartyGuesses(state.room).length : guesses.length;
    if (centralUsed >= round.maxAttempts) return;

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
    updateCurrentInputVisuals();
    if (state.room.settings.mode === "party") publishPartyInputNow();
    else setTypingSoon();
  }

  function setTypingSoon() {
    if (!state.roomCode || !state.profile) return;
    if (!state.localTypingActive) {
      state.localTypingActive = true;
      window.SPRooms.setTyping(state.roomCode, state.profile.userId, true);
    }
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => {
      state.localTypingActive = false;
      window.SPRooms.setTyping(state.roomCode, state.profile.userId, false);
    }, 1100);
  }

  function publishPartyInputNow() {
    if (!state.roomCode || !state.profile || !state.room || !state.room.settings || state.room.settings.mode !== "party") return;
    const value = state.currentInput || "";
    if (state.lastPartyLiveInputPublished === value) return;
    state.lastPartyLiveInputPublished = value;

    // Party mode needs true live typing: every letter and every backspace must
    // appear on the teammate's lower board. This writes only the tiny live-input
    // branch, not the whole room/game state.
    if (window.SPRooms.setPartyLiveInput) {
      window.SPRooms.setPartyLiveInput(state.roomCode, state.profile.userId, value);
    } else {
      window.SPRooms.setTyping(state.roomCode, state.profile.userId, true, value);
    }

    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => {
      if (state.room && state.room.settings && state.room.settings.mode === "party") {
        if (window.SPRooms.setPartyLiveInput) window.SPRooms.setPartyLiveInput(state.roomCode, state.profile.userId, state.currentInput || "");
        else window.SPRooms.setTyping(state.roomCode, state.profile.userId, false, state.currentInput || "");
      }
    }, 1200);
  }

  function clearLiveInputOnServer() {
    clearTimeout(state.partyInputTimer);
    clearTimeout(state.typingTimer);
    state.localTypingActive = false;
    state.lastPartyLiveInputPublished = "";
    if (state.roomCode && state.profile) {
      if (state.room && state.room.settings && state.room.settings.mode === "party" && window.SPRooms.setPartyLiveInput) {
        window.SPRooms.setPartyLiveInput(state.roomCode, state.profile.userId, "");
      }
      window.SPRooms.setTyping(state.roomCode, state.profile.userId, false, "");
    }
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
    const mode = state.room.settings.mode;
    const centralAttemptCount = mode === "party" ? centralPartyGuesses(state.room).length : guesses.length;
    if (centralAttemptCount >= round.maxAttempts) return invalidInput("A közös táblán elfogytak a próbák.");
    const attemptNumber = mode === "party" ? centralAttemptCount + 1 : guesses.length + 1;
    const playerAttemptNumber = guesses.length + 1;
    const payload = {
      guess: shape.word,
      feedback,
      greenCount: counts.green,
      yellowCount: counts.yellow,
      solved,
      attemptNumber: playerAttemptNumber,
      centralAttemptNumber: attemptNumber,
      isFinalAttempt: mode === "party" ? attemptNumber >= round.maxAttempts : playerAttemptNumber >= round.maxAttempts,
      elapsedMs,
      submittedAt: Date.now(),
      partyMode: mode === "party",
      displayName: state.profile.displayName
    };

    // Clear local input before the Firebase write can re-render the board.
    // Otherwise the submitted word may briefly appear again in the next row.
    state.currentInput = "";
    clearLiveInputOnServer();
    updateCurrentInputVisuals();

    await window.SPRooms.submitGuess(state.roomCode, state.profile.userId, payload);
    feedback.forEach(item => { state.keyStates[item.letter] = window.SPGameEngine.mergeKeyState(state.keyStates[item.letter], item.state); });
    renderKeyboard();
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
      await window.SPRooms.addScore(state.roomCode, state.profile.userId, score.totalRoundPoints, mode !== "party");
      await window.SPProfile.applyRoundResult({ solved: true, won: mode !== "party", partySolved: mode === "party", attemptsUsed: attemptNumber, elapsedSeconds: seconds, wordLength: round.answerLength, roundScore: score.totalRoundPoints, xp: score.xp });
      renderProfile();
      await window.SPRooms.endRound(state.roomCode, state.profile.userId, Date.now());
      return;
    }

    if (mode === "party" && attemptNumber >= round.maxAttempts) {
      await window.SPRooms.endRound(state.roomCode, null, Date.now());
      return;
    }

    if (mode !== "party" && playerAttemptNumber >= round.maxAttempts) {
      if (mode === "duel") {
        await window.SPRooms.ensureFailureTimer(state.roomCode, state.profile.userId, state.room.settings.failoverTimerSeconds || 300);
      }
      await maybeEndFailedRound(true);
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

  async function maybeEndFailedRound(fromSubmit = false) {
    if (!state.room || !state.room.currentRound || state.room.currentRound.status !== "active") return;
    const round = state.room.currentRound;
    const players = playersArray();
    if (!players.length) return;

    if (state.room.settings && state.room.settings.mode === "party") {
      const centralDone = centralPartyGuesses(state.room).length >= round.maxAttempts;
      const regularLimit = Number(state.room.settings.timeLimitSeconds || 0);
      const regularTimedOut = regularLimit > 0 && Date.now() - round.startedAt >= regularLimit * 1000;
      if (centralDone || regularTimedOut) await window.SPRooms.endRound(state.roomCode, null, Date.now());
      return;
    }

    const progressFor = userId => (state.room.publicProgress && state.room.publicProgress[userId]) || null;
    const allDone = players.every(p => {
      const progress = progressFor(p.userId);
      return progress && (progress.solved || progress.attemptCount >= round.maxAttempts);
    });
    const someoneSolved = players.some(p => {
      const progress = progressFor(p.userId);
      return progress && progress.solved;
    });

    const regularLimit = Number(state.room.settings.timeLimitSeconds || 0);
    const regularTimedOut = regularLimit > 0 && Date.now() - round.startedAt >= regularLimit * 1000;
    const failoverExpired = !!round.failureDeadlineAt && Date.now() >= round.failureDeadlineAt;

    if ((allDone && !someoneSolved) || regularTimedOut || failoverExpired) {
      await window.SPRooms.endRound(state.roomCode, null, Date.now());
      return;
    }

    const myGuesses = ownGuesses();
    if (myGuesses.length >= round.maxAttempts && !round.failureDeadlineAt && state.room.settings.mode === "duel") {
      await window.SPRooms.ensureFailureTimer(state.roomCode, state.profile.userId, state.room.settings.failoverTimerSeconds || 300);
      toast(`Elfogytak a próbáid. Az ellenfélnek ${formatTime(state.room.settings.failoverTimerSeconds || 300)} ideje maradt.`, "");
    }
  }

  function showRoundEnd(room) {
    const round = room.currentRound;
    const winner = round.winnerUserId ? (room.players && room.players[round.winnerUserId]) : null;
    const amWinner = round.winnerUserId === state.profile.userId;
    const isSolo = room.settings && room.settings.mode === "solo";
    els.roundModal.classList.remove("hidden");
    els.roundModalTitle.textContent = isSolo
      ? (winner ? "Megfejtetted!" : "Nem lett meg")
      : (winner ? (amWinner ? "Te nyerted a kört!" : `${winner.displayName} megfejtette!`) : "Kör vége");
    els.roundModalText.textContent = winner
      ? "A megfejtés pár másodpercig látható marad, utána jön a következő kör."
      : (isSolo ? "A megfejtés pár másodpercig látható marad, utána jön a következő kör." : "Senki sem találta el. A megfejtés pár másodpercig látható marad, utána jön a következő kör.");
    revealAnswer(round.answer, winner && winner.color ? winner.color : "#39d98a");
    window.SPAudio.play(amWinner ? "win" : (winner ? "lose" : "next"));
  }

  function revealAnswer(answer, color) {
    const cleanAnswer = String(answer || "");
    const letters = Array.from(cleanAnswer);
    const letterTiles = letters.map((ch, i) => `<span class="answer-letter" style="background:${color}; animation-delay:${i * 80}ms">${escapeHTML(ch)}</span>`).join("");
    els.answerReveal.innerHTML = `
      <span class="answer-word-label">A megfejtés</span>
      <strong class="answer-word-plain">${escapeHTML(cleanAnswer)}</strong>
      <span class="answer-letter-row">${letterTiles}</span>
    `;
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
    const shouldAwardLoss = room.settings.mode !== "party" && (winnerExists || room.status === "roundEnd");
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
    }, ROUND_END_DISPLAY_MS);
  }

  function renderMatchResult(room) {
    const players = playersArray(room).sort((a, b) => (b.score || 0) - (a.score || 0));
    const winner = players[0];
    const isSolo = room.settings && room.settings.mode === "solo";
    els.matchResultTitle.textContent = isSolo ? "Solo játék vége" : (winner ? `Győztes: ${winner.displayName}` : "Meccs vége");
    els.matchSummary.innerHTML = players.map((p, idx) => `
      <div class="summary-row"><span>${idx + 1}. ${escapeHTML(p.displayName)}</span><strong>${p.score || 0} pont • ${p.roundWins || 0} megoldott kör</strong></div>
    `).join("");
  }

  async function quickAddWord() {
    if (!state.room || !state.room.settings.allowHostWords) return toast("Ebben a szobában nincs játék közbeni szó hozzáadás.", "error");
    try {
      const entry = window.SPWordService.prepareWordEntry(els.quickWordInput.value, {
        addedBy: state.profile.userId,
        addedByName: state.profile.displayName,
        source: "player-proposal"
      });
      if (window.SPWordService.isAccepted(entry.word)) {
        els.quickWordInput.value = "";
        return toast("Ez a szó már benne van a szótárban.", "ok");
      }
      if (state.room.settings.mode === "solo") {
        await window.SPWordService.addDynamicWord({ word: entry.word, addedBy: state.profile.userId, addedByName: state.profile.displayName, source: "solo-added" });
        await window.SPRooms.announceWordAdded(state.roomCode, entry, state.profile);
        els.quickWordInput.value = "";
        return toast(`Hozzáadva: ${entry.word}.`, "ok");
      }
      const pending = Object.values((state.room && state.room.wordRequests) || {})
        .find(req => req.word === entry.word && req.status === "pending");
      if (pending) return toast("Erre a szóra már vár egy jóváhagyás.", "error");
      await window.SPRooms.proposeWord(state.roomCode, entry, state.profile);
      els.quickWordInput.value = "";
      toast(`Javaslat elküldve: ${entry.word}. Az ellenfélnek el kell fogadnia.`, "ok");
    } catch (err) { toast(err.message, "error"); }
  }

  async function respondToWordRequest(requestId, approved) {
    const req = state.room && state.room.wordRequests && state.room.wordRequests[requestId];
    if (!req || req.status !== "pending") return;
    if (req.requestedBy === state.profile.userId) return toast("A saját szavadat az ellenfélnek kell elfogadnia.", "error");
    try {
      if (approved) {
        await window.SPRooms.approveWordRequest(state.roomCode, requestId, state.profile);
        window.SPWordService.addLocalWord({
          word: req.word,
          addedBy: req.requestedBy,
          addedByName: req.requestedByName,
          addedAt: Date.now(),
          source: "approved-room"
        });
      } else {
        await window.SPRooms.rejectWordRequest(state.roomCode, requestId, state.profile);
        toast(`Elutasítva: ${req.word}.`, "");
      }
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
    if (els.soloGameButton) els.soloGameButton.addEventListener("click", startSoloGame);
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
    els.keyboard.addEventListener("click", ev => {
      const btn = ev.target.closest("button[data-key]");
      if (btn) handleKey(btn.dataset.key);
    });
    els.quickWordInput.addEventListener("keydown", ev => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        quickAddWord();
      }
    });
    els.wordRequestList.addEventListener("click", ev => {
      const button = ev.target.closest("[data-word-action]");
      if (!button) return;
      respondToWordRequest(button.dataset.requestId, button.dataset.wordAction === "approve");
    });
    if (els.wordApprovalDock) {
      els.wordApprovalDock.addEventListener("click", ev => {
        const button = ev.target.closest("[data-word-action]");
        if (!button) return;
        respondToWordRequest(button.dataset.requestId, button.dataset.wordAction === "approve");
      });
    }
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
