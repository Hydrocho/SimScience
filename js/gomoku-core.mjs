export const BOARD_SIZE = 15;
export const COLORS = {
  BLACK: 'black',
  WHITE: 'white',
};

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

export function createBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => null));
}

export function cloneBoard(board) {
  return board.map((row) => [...row]);
}

export function createGameState(overrides = {}) {
  return {
    board: overrides.board ? cloneBoard(overrides.board) : createBoard(),
    turn: overrides.turn || COLORS.BLACK,
    status: overrides.status || 'playing',
    winner: overrides.winner || null,
    lastMove: overrides.lastMove || null,
  };
}

export function isInBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function getCell(board, row, col) {
  if (!isInBounds(row, col)) return undefined;
  return board[row][col];
}

export function getOpponent(color) {
  return color === COLORS.BLACK ? COLORS.WHITE : COLORS.BLACK;
}

export function applyMove(state, move) {
  const current = createGameState(state);
  const row = Number(move?.row);
  const col = Number(move?.col);
  const color = move?.color;

  if (current.status === 'finished') {
    return { ok: false, reason: 'finished', state: current };
  }
  if (color !== current.turn) {
    return { ok: false, reason: 'wrong-turn', state: current };
  }
  if (!isInBounds(row, col)) {
    return { ok: false, reason: 'out-of-bounds', state: current };
  }
  if (getCell(current.board, row, col)) {
    return { ok: false, reason: 'occupied', state: current };
  }
  if (isDoubleThree(current.board, { row, col, color })) {
    return { ok: false, reason: 'double-three', state: current };
  }

  const board = cloneBoard(current.board);
  board[row][col] = color;
  const result = detectWinner(board, { row, col, color });
  return {
    ok: true,
    board,
    turn: result.winner ? current.turn : getOpponent(color),
    status: result.winner ? 'finished' : 'playing',
    winner: result.winner,
    lastMove: { row, col, color },
  };
}

export function detectWinner(board, move) {
  const row = Number(move?.row);
  const col = Number(move?.col);
  const color = move?.color;
  if (!color || !isInBounds(row, col) || getCell(board, row, col) !== color) {
    return { winner: null, count: 0 };
  }

  for (const [deltaRow, deltaCol] of DIRECTIONS) {
    const count = 1
      + countDirection(board, row, col, deltaRow, deltaCol, color)
      + countDirection(board, row, col, -deltaRow, -deltaCol, color);
    if (count >= 5) {
      return { winner: color, count };
    }
  }
  return { winner: null, count: 0 };
}

function countDirection(board, row, col, deltaRow, deltaCol, color) {
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

export function isDoubleThree(board, move) {
  const row = Number(move?.row);
  const col = Number(move?.col);
  const color = move?.color;
  if (!color || !isInBounds(row, col) || getCell(board, row, col)) return false;

  const candidate = cloneBoard(board);
  candidate[row][col] = color;
  const openThrees = DIRECTIONS.reduce((total, [deltaRow, deltaCol]) => {
    return total + (hasOpenThree(candidate, row, col, deltaRow, deltaCol, color) ? 1 : 0);
  }, 0);
  return openThrees >= 2;
}

function hasOpenThree(board, row, col, deltaRow, deltaCol, color) {
  for (let offset = -4; offset <= 0; offset += 1) {
    const cells = [];
    for (let index = 0; index < 5; index += 1) {
      const nextRow = row + (offset + index) * deltaRow;
      const nextCol = col + (offset + index) * deltaCol;
      cells.push(isInBounds(nextRow, nextCol) ? getCell(board, nextRow, nextCol) : undefined);
    }
    if (cells[0] === null
      && cells[4] === null
      && cells.slice(1, 4).every((cell) => cell === color)
      && windowContainsMove(offset)) {
      return true;
    }
  }
  return false;
}

function windowContainsMove(offset) {
  return offset <= 0 && offset + 4 >= 0;
}

export function createRoomId(now = Date.now(), random = Math.random) {
  return `gomoku-${now}-${random().toString(36).slice(2, 8)}`;
}
