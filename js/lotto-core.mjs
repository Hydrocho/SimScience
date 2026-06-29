export const LOTTO_MIN = 1;
export const LOTTO_MAX = 45;
export const LOTTO_PICK_COUNT = 6;

export function isValidLottoNumber(value) {
  return Number.isInteger(value) && value >= LOTTO_MIN && value <= LOTTO_MAX;
}

export function normalizeNumbers(numbers) {
  return [...new Set(numbers.map(Number))]
    .filter(isValidLottoNumber)
    .sort((a, b) => a - b);
}

export function toggleSelection(currentSelection, number) {
  const value = Number(number);
  if (!isValidLottoNumber(value)) return normalizeNumbers(currentSelection);

  const selected = normalizeNumbers(currentSelection);
  if (selected.includes(value)) {
    return selected.filter((item) => item !== value);
  }
  if (selected.length >= LOTTO_PICK_COUNT) {
    return selected;
  }
  return normalizeNumbers([...selected, value]);
}

export function canSubmitSelection(numbers) {
  const normalized = normalizeNumbers(numbers);
  return normalized.length === LOTTO_PICK_COUNT && numbers.length === LOTTO_PICK_COUNT;
}

export function drawRandomNumbers(random = Math.random) {
  const pool = Array.from({ length: LOTTO_MAX }, (_, index) => index + 1);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return {
    winning: normalizeNumbers(pool.slice(0, LOTTO_PICK_COUNT)),
    bonus: pool[LOTTO_PICK_COUNT],
  };
}

export function evaluateTicket(selectedNumbers, draw) {
  const selected = normalizeNumbers(selectedNumbers);
  const winning = normalizeNumbers(draw.winning || []);
  const bonus = Number(draw.bonus);
  const matchedNumbers = selected.filter((number) => winning.includes(number));
  const bonusMatched = selected.includes(bonus);
  const matchCount = matchedNumbers.length;

  let rank = null;
  if (matchCount === 6) rank = 1;
  else if (matchCount === 5 && bonusMatched) rank = 2;
  else if (matchCount === 5) rank = 3;
  else if (matchCount === 4) rank = 4;
  else if (matchCount === 3) rank = 5;

  return {
    rank,
    rankLabel: rank ? `${rank}등` : '꽝!',
    matchCount,
    matchedNumbers,
    bonusMatched,
  };
}

export function sortRanking(entries) {
  return [...entries].sort((left, right) => {
    const leftRank = left.result?.rank ?? 99;
    const rightRank = right.result?.rank ?? 99;
    if (leftRank !== rightRank) return leftRank - rightRank;

    const leftMatches = left.result?.matchCount ?? 0;
    const rightMatches = right.result?.matchCount ?? 0;
    if (leftMatches !== rightMatches) return rightMatches - leftMatches;

    return (left.submittedAt || 0) - (right.submittedAt || 0);
  });
}

export function formatTimer(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function createRoundId(now = Date.now(), random = Math.random) {
  return `lotto-${now}-${random().toString(36).slice(2, 8)}`;
}
