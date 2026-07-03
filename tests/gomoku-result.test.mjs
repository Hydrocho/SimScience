import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  getResultPopupMessage,
  getResultPopupMessageFromStatus,
} from '../js/gomoku-result.mjs';

test('solo result popup shows win for student black and loss for AI white', () => {
  assert.equal(getResultPopupMessage({
    playMode: 'solo',
    winner: 'black',
    mySeat: 'black',
  }), '승리');

  assert.equal(getResultPopupMessage({
    playMode: 'solo',
    winner: 'white',
    mySeat: 'black',
  }), '패배');
});

test('multiplayer result popup is relative to the current player seat', () => {
  assert.equal(getResultPopupMessage({
    playMode: 'multi',
    winner: 'black',
    mySeat: 'black',
  }), '승리');

  assert.equal(getResultPopupMessage({
    playMode: 'multi',
    winner: 'white',
    mySeat: 'black',
  }), '패배');
});

test('spectators and teachers see the winning color instead of personal win or loss', () => {
  assert.equal(getResultPopupMessage({
    playMode: 'multi',
    winner: 'black',
    mySeat: 'spectator',
  }), '흑 승리');

  assert.equal(getResultPopupMessage({
    playMode: 'multi',
    winner: 'white',
    mySeat: 'lobby',
  }), '백 승리');
});

test('status text popup message supports solo AI results', () => {
  assert.equal(getResultPopupMessageFromStatus({
    statusText: '학생 승리!',
    mySeatText: '흑',
  }), '승리');

  assert.equal(getResultPopupMessageFromStatus({
    statusText: 'AI 승리!',
    mySeatText: '흑',
  }), '패배');
});

test('status text popup message is relative to multiplayer seat', () => {
  assert.equal(getResultPopupMessageFromStatus({
    statusText: '흑 승리!',
    mySeatText: '흑',
  }), '승리');

  assert.equal(getResultPopupMessageFromStatus({
    statusText: '백 승리!',
    mySeatText: '흑',
  }), '패배');

  assert.equal(getResultPopupMessageFromStatus({
    statusText: '백 승리!',
    mySeatText: '관전자',
  }), '백 승리');
});

test('gomoku page includes the centered result popup elements', async () => {
  const html = await readFile(new URL('../gomoku.html', import.meta.url), 'utf8');

  assert.match(html, /id="result-popup"/);
  assert.match(html, /id="result-popup-title"/);
  assert.match(html, /id="result-popup-close"/);
  assert.match(html, /class="result-popup hidden"/);
  assert.match(html, /gomoku-result-popup\.mjs/);
});
