import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_SIZE,
  COLORS,
  applyMove,
  createBoard,
  createGameState,
  createRoomId,
  detectWinner,
  getCell,
  isDoubleThree,
} from '../js/gomoku-core.mjs';

function withStones(stones) {
  const board = createBoard();
  stones.forEach(([row, col, color]) => {
    board[row][col] = color;
  });
  return board;
}

test('createBoard returns a 19x19 empty board', () => {
  const board = createBoard();
  assert.equal(BOARD_SIZE, 19);
  assert.equal(board.length, BOARD_SIZE);
  assert.equal(board.every((row) => row.length === BOARD_SIZE), true);
  assert.equal(board.flat().every((cell) => cell === null), true);
});

test('applyMove places a stone and advances the turn', () => {
  const state = createGameState();
  const next = applyMove(state, { row: 7, col: 7, color: COLORS.BLACK });

  assert.equal(getCell(next.board, 7, 7), COLORS.BLACK);
  assert.equal(next.turn, COLORS.WHITE);
  assert.equal(next.status, 'playing');
  assert.equal(next.lastMove.row, 7);
});

test('applyMove rejects occupied intersections', () => {
  const state = createGameState({
    board: withStones([[7, 7, COLORS.BLACK]]),
    turn: COLORS.WHITE,
  });

  const next = applyMove(state, { row: 7, col: 7, color: COLORS.WHITE });

  assert.equal(next.ok, false);
  assert.equal(next.reason, 'occupied');
  assert.equal(getCell(next.state.board, 7, 7), COLORS.BLACK);
});

test('applyMove rejects wrong-turn moves', () => {
  const state = createGameState({ turn: COLORS.BLACK });
  const next = applyMove(state, { row: 7, col: 7, color: COLORS.WHITE });

  assert.equal(next.ok, false);
  assert.equal(next.reason, 'wrong-turn');
});

test('detectWinner finds horizontal, vertical, and diagonal wins with five or more stones', () => {
  assert.equal(detectWinner(withStones([
    [3, 2, COLORS.BLACK],
    [3, 3, COLORS.BLACK],
    [3, 4, COLORS.BLACK],
    [3, 5, COLORS.BLACK],
    [3, 6, COLORS.BLACK],
    [3, 7, COLORS.BLACK],
  ]), { row: 3, col: 5, color: COLORS.BLACK }).winner, COLORS.BLACK);

  assert.equal(detectWinner(withStones([
    [1, 8, COLORS.WHITE],
    [2, 8, COLORS.WHITE],
    [3, 8, COLORS.WHITE],
    [4, 8, COLORS.WHITE],
    [5, 8, COLORS.WHITE],
  ]), { row: 3, col: 8, color: COLORS.WHITE }).winner, COLORS.WHITE);

  assert.equal(detectWinner(withStones([
    [4, 4, COLORS.BLACK],
    [5, 5, COLORS.BLACK],
    [6, 6, COLORS.BLACK],
    [7, 7, COLORS.BLACK],
    [8, 8, COLORS.BLACK],
  ]), { row: 6, col: 6, color: COLORS.BLACK }).winner, COLORS.BLACK);
});

test('applyMove finishes the game when a player wins', () => {
  const state = createGameState({
    board: withStones([
      [7, 3, COLORS.BLACK],
      [7, 4, COLORS.BLACK],
      [7, 5, COLORS.BLACK],
      [7, 6, COLORS.BLACK],
    ]),
    turn: COLORS.BLACK,
  });

  const next = applyMove(state, { row: 7, col: 7, color: COLORS.BLACK });

  assert.equal(next.status, 'finished');
  assert.equal(next.winner, COLORS.BLACK);
});

test('applyMove rejects moves after a finished game', () => {
  const state = createGameState({ status: 'finished', winner: COLORS.BLACK });
  const next = applyMove(state, { row: 7, col: 7, color: COLORS.WHITE });

  assert.equal(next.ok, false);
  assert.equal(next.reason, 'finished');
});

test('isDoubleThree allows one open-three', () => {
  const board = withStones([
    [7, 6, COLORS.BLACK],
    [7, 8, COLORS.BLACK],
  ]);

  assert.equal(isDoubleThree(board, { row: 7, col: 7, color: COLORS.BLACK }), false);
});

test('isDoubleThree rejects two open-threes for either color', () => {
  const board = withStones([
    [7, 6, COLORS.WHITE],
    [7, 8, COLORS.WHITE],
    [6, 7, COLORS.WHITE],
    [8, 7, COLORS.WHITE],
  ]);

  assert.equal(isDoubleThree(board, { row: 7, col: 7, color: COLORS.WHITE }), true);
});

test('createRoomId creates a gomoku-prefixed id', () => {
  assert.match(createRoomId(123, () => 0.5), /^gomoku-123-[a-z0-9]+$/);
});
