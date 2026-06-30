import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEBATE_MAX_MESSAGE_LENGTH,
  buildDebatePrompt,
  createDebateRoomId,
  isValidDebateMessage,
  normalizeChatHistory,
  sanitizeDebateMessage,
} from '../js/debate-core.mjs';

test('sanitizeDebateMessage trims whitespace and collapses long messages', () => {
  const raw = `  ${'a'.repeat(DEBATE_MAX_MESSAGE_LENGTH + 30)}  `;
  const sanitized = sanitizeDebateMessage(raw);
  assert.equal(sanitized.length, DEBATE_MAX_MESSAGE_LENGTH);
  assert.equal(sanitized, 'a'.repeat(DEBATE_MAX_MESSAGE_LENGTH));
});

test('isValidDebateMessage rejects empty and overlong messages', () => {
  assert.equal(isValidDebateMessage(''), false);
  assert.equal(isValidDebateMessage('   '), false);
  assert.equal(isValidDebateMessage('개발 제한에 찬성합니다.'), true);
  assert.equal(isValidDebateMessage('가'.repeat(DEBATE_MAX_MESSAGE_LENGTH + 1)), false);
});

test('normalizeChatHistory keeps supported roles and limits context to recent messages', () => {
  const history = Array.from({ length: 18 }, (_, index) => ({
    role: index % 2 === 0 ? 'student' : 'ai',
    content: `message ${index}`,
  }));
  history.push({ role: 'teacher', content: 'ignored' });
  history.push({ role: 'student', content: '' });

  const normalized = normalizeChatHistory(history, 6);
  assert.equal(normalized.length, 6);
  assert.deepEqual(normalized.map((entry) => entry.content), [
    'message 12',
    'message 13',
    'message 14',
    'message 15',
    'message 16',
    'message 17',
  ]);
});

test('buildDebatePrompt instructs AI to debate without deciding for the student', () => {
  const prompt = buildDebatePrompt({
    studentName: '민준',
    message: '경제 발전을 위해 개발 제한은 신중해야 한다고 생각합니다.',
    history: [
      { role: 'ai', content: '그 주장에는 어떤 근거가 있나요?' },
      { role: 'student', content: '일자리 문제가 큽니다.' },
    ],
  });

  assert.match(prompt, /지구 온난화/);
  assert.match(prompt, /개발을 제한/);
  assert.match(prompt, /민준/);
  assert.match(prompt, /결론을 대신 내려주지 마세요/);
  assert.match(prompt, /1~2문장/);
  assert.match(prompt, /경제 발전/);
});

test('createDebateRoomId creates a debate-prefixed id', () => {
  assert.match(createDebateRoomId(123, () => 0.5), /^debate-123-[a-z0-9]+$/);
});
