import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOTTO_MAX,
  LOTTO_PICK_COUNT,
  canSubmitSelection,
  createRoundId,
  drawRandomNumbers,
  evaluateTicket,
  formatTimer,
  sortRanking,
  toggleSelection,
} from '../js/lotto-core.mjs';

test('toggleSelection adds and removes unique numbers with a six-number cap', () => {
  let selected = [];
  selected = toggleSelection(selected, 7);
  selected = toggleSelection(selected, 12);
  selected = toggleSelection(selected, 19);
  selected = toggleSelection(selected, 28);
  selected = toggleSelection(selected, 34);
  selected = toggleSelection(selected, 41);
  assert.deepEqual(selected, [7, 12, 19, 28, 34, 41]);
  assert.deepEqual(toggleSelection(selected, 45), selected);
  assert.deepEqual(toggleSelection(selected, 19), [7, 12, 28, 34, 41]);
});

test('canSubmitSelection requires exactly six unique in-range numbers', () => {
  assert.equal(canSubmitSelection([1, 2, 3, 4, 5]), false);
  assert.equal(canSubmitSelection([1, 2, 3, 4, 5, 5]), false);
  assert.equal(canSubmitSelection([1, 2, 3, 4, 5, 46]), false);
  assert.equal(canSubmitSelection([1, 2, 3, 4, 5, 45]), true);
});

test('drawRandomNumbers returns six winning numbers plus one unique bonus number', () => {
  for (let i = 0; i < 100; i += 1) {
    const draw = drawRandomNumbers();
    assert.equal(draw.winning.length, LOTTO_PICK_COUNT);
    assert.equal(new Set(draw.winning).size, LOTTO_PICK_COUNT);
    assert.equal(draw.winning.every((n) => n >= 1 && n <= LOTTO_MAX), true);
    assert.equal(draw.bonus >= 1 && draw.bonus <= LOTTO_MAX, true);
    assert.equal(draw.winning.includes(draw.bonus), false);
  }
});

test('evaluateTicket applies real Lotto rank rules', () => {
  const draw = { winning: [1, 2, 3, 4, 5, 6], bonus: 7 };
  assert.equal(evaluateTicket([1, 2, 3, 4, 5, 6], draw).rank, 1);
  assert.equal(evaluateTicket([1, 2, 3, 4, 5, 7], draw).rank, 2);
  assert.equal(evaluateTicket([1, 2, 3, 4, 5, 8], draw).rank, 3);
  assert.equal(evaluateTicket([1, 2, 3, 4, 8, 9], draw).rank, 4);
  assert.equal(evaluateTicket([1, 2, 3, 8, 9, 10], draw).rank, 5);
  assert.equal(evaluateTicket([1, 2, 8, 9, 10, 11], draw).rank, null);
});

test('sortRanking orders prize ranks first, then match count, then submitted time', () => {
  const ranking = sortRanking([
    { nickname: 'B', result: { rank: 3, matchCount: 5 }, submittedAt: 200 },
    { nickname: 'A', result: { rank: 2, matchCount: 5 }, submittedAt: 300 },
    { nickname: 'C', result: { rank: null, matchCount: 2 }, submittedAt: 100 },
    { nickname: 'D', result: { rank: 5, matchCount: 3 }, submittedAt: 50 },
  ]);
  assert.deepEqual(ranking.map((r) => r.nickname), ['A', 'B', 'D', 'C']);
});

test('formatTimer returns mm:ss', () => {
  assert.equal(formatTimer(0), '00:00');
  assert.equal(formatTimer(9), '00:09');
  assert.equal(formatTimer(65), '01:05');
});

test('createRoundId creates a lotto-prefixed id', () => {
  assert.match(createRoundId(), /^lotto-\d+-[a-z0-9]+$/);
});
