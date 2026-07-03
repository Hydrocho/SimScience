const COLOR_LABELS = {
  black: '흑',
  white: '백',
};

export function getResultPopupMessage({ playMode, winner, mySeat }) {
  if (!winner) return '';

  if (playMode === 'solo') {
    return winner === 'black' ? '승리' : '패배';
  }

  if (mySeat === 'black' || mySeat === 'white') {
    return winner === mySeat ? '승리' : '패배';
  }

  return `${COLOR_LABELS[winner] || winner} 승리`;
}

export function getResultPopupMessageFromStatus({ statusText, mySeatText }) {
  const status = String(statusText || '').replace(/\s+/g, ' ').trim();
  const seat = String(mySeatText || '').replace(/\s+/g, ' ').trim();

  if (status.includes('학생 승리')) return '승리';
  if (status.includes('AI 승리')) return '패배';

  if (status.includes('흑 승리')) {
    if (seat.includes('흑')) return '승리';
    if (seat.includes('백')) return '패배';
    return '흑 승리';
  }

  if (status.includes('백 승리')) {
    if (seat.includes('백')) return '승리';
    if (seat.includes('흑')) return '패배';
    return '백 승리';
  }

  return '';
}
