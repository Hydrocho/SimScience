import {
  BOARD_SIZE,
  COLORS,
  applyMove,
  cloneBoard,
  detectWinner,
  getCell,
  getOpponent,
  isDoubleThree,
  isInBounds,
} from './gomoku-core.mjs';

export const DIFFICULTIES = {
  BEGINNER: 'beginner',
  EASY: 'easy',
  NORMAL: 'normal',
  HARD: 'hard',
  CHALLENGE: 'challenge',
};

export const DIFFICULTY_LABELS = {
  [DIFFICULTIES.BEGINNER]: '입문',
  [DIFFICULTIES.EASY]: '쉬움',
  [DIFFICULTIES.NORMAL]: '보통',
  [DIFFICULTIES.HARD]: '어려움',
  [DIFFICULTIES.CHALLENGE]: '도전',
};

export const XP_REWARDS = {
  [DIFFICULTIES.BEGINNER]: 5,
  [DIFFICULTIES.EASY]: 10,
  [DIFFICULTIES.NORMAL]: 25,
  [DIFFICULTIES.HARD]: 45,
  [DIFFICULTIES.CHALLENGE]: 75,
};

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

export function getLegalMoves(state, color = COLORS.WHITE) {
  const moves = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (getCell(state.board, row, col) !== null) continue;
      if (isDoubleThree(state.board, { row, col, color })) continue;
      moves.push({ row, col, color });
    }
  }
  return moves;
}

export function chooseAiMove(state, difficulty = DIFFICULTIES.NORMAL, random = Math.random) {
  const color = COLORS.WHITE;
  const legalMoves = getCandidateMoves(state, color, difficulty);
  if (!legalMoves.length) return null;

  if (difficultyRank(difficulty) >= difficultyRank(DIFFICULTIES.NORMAL)) {
    const winMove = findImmediateWin(state, color, legalMoves);
    if (winMove) return winMove;

    const blockMove = findImmediateWin(state, getOpponent(color), legalMoves.map((move) => ({
      ...move,
      color: getOpponent(color),
    })));
    if (blockMove) return { row: blockMove.row, col: blockMove.col, color };
  }

  if (difficulty === DIFFICULTIES.BEGINNER) {
    return pickRandom(preferNearbyMoves(state, legalMoves), random);
  }

  const scored = legalMoves
    .map((move) => ({
      move,
      score: scoreMove(state, move, difficulty),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.move.row !== right.move.row) return left.move.row - right.move.row;
      return left.move.col - right.move.col;
    });

  const topScore = scored[0].score;
  const topMoves = scored.filter((entry) => entry.score === topScore).map((entry) => entry.move);
  return pickRandom(topMoves, random);
}

export function scoreMove(state, move, difficulty = DIFFICULTIES.NORMAL) {
  const attack = linePotential(state.board, move.row, move.col, move.color);
  const opponent = getOpponent(move.color);
  const defense = linePotential(state.board, move.row, move.col, opponent);
  const center = centerScore(move.row, move.col);

  const weights = {
    [DIFFICULTIES.EASY]: { attack: 2, defense: 2, center: 1 },
    [DIFFICULTIES.NORMAL]: { attack: 4, defense: 5, center: 1 },
    [DIFFICULTIES.HARD]: { attack: 7, defense: 8, center: 2 },
    [DIFFICULTIES.CHALLENGE]: { attack: 8, defense: 11, center: 2 },
  }[difficulty] || { attack: 4, defense: 5, center: 1 };

  return attack * weights.attack + defense * weights.defense + center * weights.center;
}

export function calculateXpReward(difficulty, currentStreak = 0) {
  return (XP_REWARDS[difficulty] || 0) + Math.max(0, Number(currentStreak) || 0) * 3;
}

export function calculateLevel(xp) {
  const safeXp = Math.max(0, Number(xp) || 0);
  const thresholds = [0, 30, 80, 150, 250, 400];
  let gap = 300;
  while (safeXp >= thresholds[thresholds.length - 1]) {
    thresholds.push(thresholds[thresholds.length - 1] + gap);
    gap += 150;
  }

  let level = 1;
  for (let index = 0; index < thresholds.length; index += 1) {
    if (safeXp >= thresholds[index]) {
      level = index + 1;
    }
  }
  return {
    level,
    currentLevelXp: thresholds[level - 1],
    nextLevelXp: thresholds[level],
  };
}

export function applySoloResult(progress, { result, difficulty }) {
  const next = {
    nickname: progress.nickname || '',
    level: progress.level || 1,
    xp: progress.xp || 0,
    wins: progress.wins || 0,
    losses: progress.losses || 0,
    currentStreak: progress.currentStreak || 0,
    bestStreak: progress.bestStreak || 0,
    lastDifficulty: difficulty || progress.lastDifficulty || DIFFICULTIES.BEGINNER,
  };

  if (result === 'win') {
    next.wins += 1;
    next.currentStreak += 1;
    next.bestStreak = Math.max(next.bestStreak, next.currentStreak);
    next.xp += calculateXpReward(difficulty, next.currentStreak);
  } else if (result === 'loss') {
    next.losses += 1;
    next.currentStreak = 0;
  } else if (result === 'draw') {
    next.currentStreak = 0;
  }

  next.level = calculateLevel(next.xp).level;
  return next;
}

function difficultyRank(difficulty) {
  return [
    DIFFICULTIES.BEGINNER,
    DIFFICULTIES.EASY,
    DIFFICULTIES.NORMAL,
    DIFFICULTIES.HARD,
    DIFFICULTIES.CHALLENGE,
  ].indexOf(difficulty);
}

function getCandidateMoves(state, color, difficulty) {
  const legalMoves = getLegalMoves(state, color);
  const occupied = state.board.flat().some(Boolean);
  if (!occupied) return [{ row: 7, col: 7, color }];

  if (difficulty === DIFFICULTIES.CHALLENGE || difficulty === DIFFICULTIES.HARD) {
    return legalMoves.filter((move) => hasNeighbor(state.board, move.row, move.col, 2));
  }
  return legalMoves.filter((move) => hasNeighbor(state.board, move.row, move.col, 1));
}

function hasNeighbor(board, row, col, distance) {
  for (let r = row - distance; r <= row + distance; r += 1) {
    for (let c = col - distance; c <= col + distance; c += 1) {
      if (!isInBounds(r, c) || (r === row && c === col)) continue;
      if (board[r][c]) return true;
    }
  }
  return false;
}

function preferNearbyMoves(state, moves) {
  const nearby = moves.filter((move) => hasNeighbor(state.board, move.row, move.col, 1));
  return nearby.length ? nearby : moves;
}

function pickRandom(moves, random) {
  if (!moves.length) return null;
  const index = Math.min(moves.length - 1, Math.floor(random() * moves.length));
  return moves[index];
}

function findImmediateWin(state, color, candidateMoves) {
  for (const move of candidateMoves) {
    const board = cloneBoard(state.board);
    if (getCell(board, move.row, move.col) !== null) continue;
    board[move.row][move.col] = color;
    if (detectWinner(board, { row: move.row, col: move.col, color }).winner === color) {
      return { row: move.row, col: move.col, color };
    }
  }
  return null;
}

function linePotential(board, row, col, color) {
  let best = 0;
  for (const [deltaRow, deltaCol] of DIRECTIONS) {
    const forward = countLine(board, row, col, deltaRow, deltaCol, color);
    const backward = countLine(board, row, col, -deltaRow, -deltaCol, color);
    const openEnds = Number(isOpenEnd(board, row, col, deltaRow, deltaCol, color))
      + Number(isOpenEnd(board, row, col, -deltaRow, -deltaCol, color));
    const length = forward + backward + 1;
    best = Math.max(best, length * length * 10 + openEnds * 8);
  }
  return best;
}

function countLine(board, row, col, deltaRow, deltaCol, color) {
  let count = 0;
  let nextRow = row + deltaRow;
  let nextCol = col + deltaCol;
  while (isInBounds(nextRow, nextCol) && getCell(board, nextRow, nextCol) === color) {
    count += 1;
    nextRow += deltaRow;
    nextCol += deltaCol;
  }
  return count;
}

function isOpenEnd(board, row, col, deltaRow, deltaCol, color) {
  let nextRow = row + deltaRow;
  let nextCol = col + deltaCol;
  while (isInBounds(nextRow, nextCol) && getCell(board, nextRow, nextCol) === color) {
    nextRow += deltaRow;
    nextCol += deltaCol;
  }
  return isInBounds(nextRow, nextCol) && getCell(board, nextRow, nextCol) === null;
}

function centerScore(row, col) {
  const center = Math.floor(BOARD_SIZE / 2);
  return BOARD_SIZE - (Math.abs(row - center) + Math.abs(col - center));
}
