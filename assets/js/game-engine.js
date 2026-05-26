(function () {
  const HUNGARIAN_LETTERS = "aábcdeéfghiíjklmnoóöőpqrstuúüűvwxyz";
  const VALID_WORD_RE = new RegExp(`^[${HUNGARIAN_LETTERS}]+$`, "iu");
  const KEYBOARD_ROWS = [
    ["q", "w", "e", "é", "r", "t", "z", "u", "ú", "i", "í", "o", "ó", "ö", "ő", "p"],
    ["a", "á", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["Enter", "y", "x", "c", "v", "b", "n", "m", "ü", "ű", "Backspace"]
  ];

  function normalizeWord(raw) {
    return String(raw || "")
      .trim()
      .toLocaleLowerCase("hu-HU")
      .normalize("NFC");
  }

  function isValidHungarianWordShape(word) {
    const normalized = normalizeWord(word);
    return normalized.length > 0 && VALID_WORD_RE.test(normalized);
  }

  function validateGuessShape(guess, answerLength) {
    const word = normalizeWord(guess);
    if (!isValidHungarianWordShape(word)) return { ok: false, code: "invalidChars", message: "Csak magyar betűket használj." };
    if (word.length !== Number(answerLength)) return { ok: false, code: "wrongLength", message: "Nem megfelelő hosszúságú szó." };
    return { ok: true, word };
  }

  function evaluateGuess(guessRaw, answerRaw) {
    const guess = Array.from(normalizeWord(guessRaw));
    const answer = Array.from(normalizeWord(answerRaw));
    const result = guess.map(letter => ({ letter, state: "gray" }));
    const remaining = new Map();

    for (let i = 0; i < answer.length; i += 1) {
      if (guess[i] === answer[i]) {
        result[i].state = "green";
      } else {
        remaining.set(answer[i], (remaining.get(answer[i]) || 0) + 1);
      }
    }

    for (let i = 0; i < guess.length; i += 1) {
      if (result[i].state === "green") continue;
      const count = remaining.get(guess[i]) || 0;
      if (count > 0) {
        result[i].state = "yellow";
        remaining.set(guess[i], count - 1);
      }
    }
    return result;
  }

  function countFeedback(feedback) {
    return feedback.reduce((acc, item) => {
      if (item.state === "green") acc.green += 1;
      if (item.state === "yellow") acc.yellow += 1;
      return acc;
    }, { green: 0, yellow: 0 });
  }

  function isSolved(feedback) {
    return feedback.length > 0 && feedback.every(item => item.state === "green");
  }

  function mergeKeyState(current, next) {
    const rank = { gray: 1, yellow: 2, green: 3 };
    if (!current) return next;
    return rank[next] > rank[current] ? next : current;
  }

  window.SPGameEngine = {
    HUNGARIAN_LETTERS,
    KEYBOARD_ROWS,
    normalizeWord,
    isValidHungarianWordShape,
    validateGuessShape,
    evaluateGuess,
    countFeedback,
    isSolved,
    mergeKeyState
  };
})();
