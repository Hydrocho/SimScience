import test from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, createBoard, createGameState } from '../js/gomoku-core.mjs';
import {
  DIFFICULTIES,
  applySoloResult,
  calculateLevel,
  calculateXpReward,
  chooseAiMove,
  getLegalMoves,
} from '../js/gomoku-ai.mjs';

function withStones(stones) {
  const board = createBoard();
  stones.forEach(([row, col, color]) => {
    board[row][col] = color;
  });
  return board;
}

test('chooseAiMove takes an immediate winning move at normal difficulty or higher', () => {
  const state = createGameState({
    board: withStones([
      [7, 3, COLORS.WHITE],
      [7, 4, COLORS.WHITE],
      [7, 5, COLORS.WHITE],
      [7, 6, COLORS.WHITE],
      [4, 4, COLORS.BLACK],
    ]),
    turn: COLORS.WHITE,
  });

  const move = chooseAiMove(state, DIFFICULTIES.NORMAL, () => 0);

  assert.deepEqual(move, { row: 7, col: 2, color: COLORS.WHITE });
});

test('chooseAiMove blocks the student immediate winning move at normal difficulty or higher', () => {
  const state = createGameState({
    board: withStones([
      [5, 5, COLORS.BLACK],
      [5, 6, COLORS.BLACK],
      [5, 7, COLORS.BLACK],
      [5, 8, COLORS.BLACK],
      [8, 8, COLORS.WHITE],
    ]),
    turn: COLORS.WHITE,
  });

  const move = chooseAiMove(state, DIFFICULTIES.NORMAL, () => 0);

  assert.deepEqual(move, { row: 5, col: 4, color: COLORS.WHITE });
});

test('getLegalMoves excludes occupied cells and double-three moves', () => {
  const state = createGameState({
    board: withStones([
      [7, 6, COLORS.WHITE],
      [7, 8, COLORS.WHITE],
      [6, 7, COLORS.WHITE],
      [8, 7, COLORS.WHITE],
      [3, 3, COLORS.BLACK],
    ]),
    turn: COLORS.WHITE,
  });

  const moves = getLegalMoves(state, COLORS.WHITE);

  assert.equal(moves.some((move) => move.row === 3 && move.col === 3), false);
  assert.equal(moves.some((move) => move.row === 7 && move.col === 7), false);
  assert.equal(moves.every((move) => move.color === COLORS.WHITE), true);
});

test('challenge difficulty prefers a stronger defensive block over a center move', () => {
  const state = createGameState({
    board: withStones([
      [9, 4, COLORS.BLACK],
      [9, 5, COLORS.BLACK],
      [9, 6, COLORS.BLACK],
      [9, 7, COLORS.BLACK],
      [7, 7, COLORS.WHITE],
    ]),
    turn: COLORS.WHITE,
  });

  const move = chooseAiMove(state, DIFFICULTIES.CHALLENGE, () => 0.99);

  assert.deepEqual(move, { row: 9, col: 3, color: COLORS.WHITE });
});

test('calculateXpReward uses difficulty plus streak bonus', () => {
  assert.equal(calculateXpReward(DIFFICULTIES.BEGINNER, 1), 8);
  assert.equal(calculateXpReward(DIFFICULTIES.CHALLENGE, 4), 87);
});

test('calculateLevel follows cumulative thresholds beyond level five', () => {
  assert.deepEqual(calculateLevel(0), { level: 1, currentLevelXp: 0, nextLevelXp: 30 });
  assert.deepEqual(calculateLevel(80), { level: 3, currentLevelXp: 80, nextLevelXp: 150 });
  assert.deepEqual(calculateLevel(400), { level: 6, currentLevelXp: 400, nextLevelXp: 700 });
});

test('applySoloResult updates temporary progress for wins and losses', () => {
  const initial = {
    nickname: 'A',
    level: 1,
    xp: 0,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastDifficulty: DIFFICULTIES.EASY,
  };

  const afterWin = applySoloResult(initial, { result: 'win', difficulty: DIFFICULTIES.EASY });
  assert.equal(afterWin.wins, 1);
  assert.equal(afterWin.losses, 0);
  assert.equal(afterWin.currentStreak, 1);
  assert.equal(afterWin.bestStreak, 1);
  assert.equal(afterWin.xp, 13);

  const afterLoss = applySoloResult(afterWin, { result: 'loss', difficulty: DIFFICULTIES.EASY });
  assert.equal(afterLoss.wins, 1);
  assert.equal(afterLoss.losses, 1);
  assert.equal(afterLoss.currentStreak, 0);
  assert.equal(afterLoss.xp, 13);
});
