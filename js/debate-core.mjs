export const DEBATE_TOPIC = '지구 온난화 대응을 위해 개발을 제한해야 하는가?';
export const DEBATE_MAX_MESSAGE_LENGTH = 700;
export const DEBATE_HISTORY_LIMIT = 12;

const SUPPORTED_ROLES = new Set(['student', 'ai']);

export function sanitizeDebateMessage(value, maxLength = DEBATE_MAX_MESSAGE_LENGTH) {
  return String(value || '').trim().slice(0, maxLength);
}

export function isValidDebateMessage(value) {
  const text = String(value || '').trim();
  return text.length > 0 && text.length <= DEBATE_MAX_MESSAGE_LENGTH;
}

export function normalizeChatHistory(history = [], limit = DEBATE_HISTORY_LIMIT) {
  return history
    .filter((entry) => SUPPORTED_ROLES.has(entry?.role) && sanitizeDebateMessage(entry.content))
    .map((entry) => ({
      role: entry.role,
      content: sanitizeDebateMessage(entry.content),
    }))
    .slice(-limit);
}

export function buildDebatePrompt({ studentName = '학생', message, history = [] } = {}) {
  const safeName = sanitizeDebateMessage(studentName, 30) || '학생';
  const safeMessage = sanitizeDebateMessage(message);
  const context = normalizeChatHistory(history)
    .map((entry) => `${entry.role === 'student' ? safeName : 'AI'}: ${entry.content}`)
    .join('\n');

  return [
    '당신은 중학교 과학/사회 융합 수업의 토론 상대 AI입니다.',
    `토론 주제: ${DEBATE_TOPIC}`,
    '',
    '역할 규칙:',
    '- 학생의 입장을 먼저 파악하고, 반대 관점의 근거 또는 검증 질문을 제시하세요.',
    '- 한쪽 결론을 대신 내려주지 마세요.',
    '- 지구 온난화, 탄소 배출, 생태계, 경제, 일자리, 형평성을 균형 있게 다루세요.',
    '- 답변은 한국어로 1~2문장만 쓰고, 마지막은 학생이 이어서 답할 수 있는 짧은 질문으로 끝내세요.',
    '- 비난하거나 조롱하지 말고 수업 토론에 맞는 표현을 쓰세요.',
    '',
    context ? `이전 대화:\n${context}\n` : '',
    `${safeName}의 새 주장: ${safeMessage}`,
    '',
    '위 주장에 토론 상대처럼 응답하세요.',
  ].filter(Boolean).join('\n');
}

export function createDebateRoomId(now = Date.now(), random = Math.random) {
  return `debate-${now}-${random().toString(36).slice(2, 8)}`;
}
