import { getResultPopupMessageFromStatus } from './gomoku-result.mjs';

const popup = document.getElementById('result-popup');
const title = document.getElementById('result-popup-title');
const closeButton = document.getElementById('result-popup-close');
const status = document.getElementById('room-status');
const mySeat = document.getElementById('my-seat');

let dismissedMessage = '';

function hidePopup({ resetDismissed = false } = {}) {
  popup?.classList.add('hidden');
  if (resetDismissed) dismissedMessage = '';
}

function showPopup(message) {
  if (!popup || !title || !message || message === dismissedMessage) return;
  title.textContent = message;
  popup.classList.remove('hidden');
}

function syncPopup() {
  const message = getResultPopupMessageFromStatus({
    statusText: status?.textContent,
    mySeatText: mySeat?.textContent,
  });

  if (!message) {
    hidePopup({ resetDismissed: true });
    return;
  }

  showPopup(message);
}

closeButton?.addEventListener('click', () => {
  dismissedMessage = title?.textContent?.trim() || '';
  hidePopup();
});

document.getElementById('reset-game-btn')?.addEventListener('click', () => hidePopup({ resetDismissed: true }));
document.getElementById('leave-room-btn')?.addEventListener('click', () => hidePopup({ resetDismissed: true }));
document.getElementById('mode-multi-btn')?.addEventListener('click', () => hidePopup({ resetDismissed: true }));
document.getElementById('mode-solo-btn')?.addEventListener('click', () => hidePopup({ resetDismissed: true }));
document.getElementById('solo-start-btn')?.addEventListener('click', () => hidePopup({ resetDismissed: true }));

if (status) {
  const observer = new MutationObserver(syncPopup);
  observer.observe(status, { childList: true, characterData: true, subtree: true });
  syncPopup();
}
