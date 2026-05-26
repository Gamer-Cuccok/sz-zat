(function () {
  function difficultyMultiplier(wordLength, maxAttempts) {
    let multiplier = 1;
    if (wordLength >= 13) multiplier = 2;
    else if (wordLength >= 9) multiplier = 1.5;
    else if (wordLength >= 6) multiplier = 1.2;
    if (maxAttempts <= 4) multiplier += 0.25;
    return multiplier;
  }

  function calculateRoundScore({ wordLength, maxAttempts, attemptsUsed, elapsedSeconds, timeLimitSeconds, won }) {
    const basePoints = Number(wordLength) * 10;
    const safeAttempts = Math.max(1, Number(maxAttempts) || 6);
    const used = Math.max(1, Number(attemptsUsed) || safeAttempts);
    const attemptRatio = Math.max(0, (safeAttempts - used + 1) / safeAttempts);
    const attemptBonus = Math.round(basePoints * attemptRatio);
    const speedWindow = Number(timeLimitSeconds) > 0 ? Number(timeLimitSeconds) : 180;
    const speedBonus = Math.max(0, Math.round(basePoints * (1 - (Number(elapsedSeconds) || 0) / speedWindow)));
    const winnerBonus = won ? Math.round(basePoints * 0.5) : 0;
    const totalRoundPoints = basePoints + attemptBonus + speedBonus + winnerBonus;
    const xp = Math.round(totalRoundPoints * difficultyMultiplier(Number(wordLength), safeAttempts));
    return { basePoints, attemptBonus, speedBonus, winnerBonus, totalRoundPoints, xp };
  }

  function xpNeededForNext(level) {
    return 100 + level * level * 60;
  }

  function levelFromXP(totalXP) {
    let remaining = Math.max(0, Number(totalXP) || 0);
    let level = 1;
    while (remaining >= xpNeededForNext(level)) {
      remaining -= xpNeededForNext(level);
      level += 1;
    }
    return { level, currentLevelXP: remaining, nextLevelXP: xpNeededForNext(level) };
  }

  window.SPScoring = { difficultyMultiplier, calculateRoundScore, xpNeededForNext, levelFromXP };
})();
