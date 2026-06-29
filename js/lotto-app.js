import { checkIsTeacherAllowed, isConnected, supabaseClient } from './supabase.js';
import { ClassroomNetwork } from './network.js';
import {
  canSubmitSelection,
  createRoundId,
  drawRandomNumbers,
  evaluateTicket,
  formatTimer,
  normalizeNumbers,
  sortRanking,
  toggleSelection,
} from './lotto-core.mjs';

void [canSubmitSelection, createRoundId, drawRandomNumbers, evaluateTicket, normalizeNumbers, sortRanking, toggleSelection];

const SUPABASE_URL = 'https://vdyvpsteofvhbvvrilxe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkeXZwc3Rlb2Z2aGJ2dnJpbHhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MzQ4ODMsImV4cCI6MjA5NTExMDg4M30.9kYsTmJGigMpanoj0CWFdHOZkDTUXqZo8neNuBxXIYU';

const state = {
  mode: 'start',
  pin: '',
  roundId: '',
  roundState: 'lobby',
  creatingRoom: false,
  network: null,
  students: [],
  submissions: new Map(),
  selectedNumbers: [],
  submitted: false,
  timer: {
    totalSeconds: 120,
    remainingSeconds: 120,
    intervalId: null,
  },
  draw: {
    winning: [],
    bonus: null,
  },
  ranking: [],
  myResult: null,
};

let booted = false;
let manualDrawStep = 'winning';

const $ = (id) => document.getElementById(id);

function showScreen(screenId) {
  document.querySelectorAll('[data-screen]').forEach((screen) => {
    screen.hidden = screen.id !== screenId;
  });
}

function setStatus(message, tone = 'neutral') {
  const status = $('app-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function readRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room') || '';
  return /^\d{6}$/.test(room) ? room : '';
}

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function buildStudentUrl(pin) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', pin);
  return url.toString();
}

async function ensureTeacherAllowed() {
  if (!supabaseClient) {
    throw new Error('Supabase 연결을 사용할 수 없습니다.');
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;

  const session = data?.session;
  if (!session) {
    await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
      },
    });
    return null;
  }

  const email = session.user?.email || '';
  const isAllowedTeacher = await checkIsTeacherAllowed(email);
  if (!isAllowedTeacher) {
    await supabaseClient.auth.signOut();
    throw new Error('허용된 교사 계정이 아닙니다.');
  }

  const emailStatus = $('teacher-email');
  if (emailStatus) {
    emailStatus.textContent = `로그인 계정: ${email}`;
  }

  return email;
}

function bindStartEvents() {
  $('teacher-start-btn')?.addEventListener('click', createTeacherRoom);
  $('student-join-form')?.addEventListener('submit', joinStudentRoom);
  $('student-join-form-active')?.addEventListener('submit', joinStudentRoom);
}

function bindTeacherRoundControls() {
  $('timer-seconds')?.addEventListener('input', (event) => {
    state.timer.totalSeconds = Math.max(10, Math.min(600, Number(event.target.value) || 120));
    state.timer.remainingSeconds = state.timer.totalSeconds;
    renderTeacherRoom();
  });

  document.querySelectorAll('.timer-preset').forEach((button) => {
    button.addEventListener('click', () => {
      state.timer.totalSeconds = Number(button.dataset.seconds);
      state.timer.remainingSeconds = state.timer.totalSeconds;
      const input = $('timer-seconds');
      if (input) input.value = String(state.timer.totalSeconds);
      renderTeacherRoom();
    });
  });

  $('start-round-btn')?.addEventListener('click', startTeacherRound);
  $('close-round-btn')?.addEventListener('click', closeTeacherRound);
  $('random-draw-btn')?.addEventListener('click', useRandomDraw);
  $('reveal-results-btn')?.addEventListener('click', revealResults);
  $('next-round-btn')?.addEventListener('click', goToLobby);
  $('qr-code')?.addEventListener('click', openLargeQr);
  renderWinningBalls();
  renderManualWinningGrid();
}

async function createTeacherRoom() {
  if (state.creatingRoom) return;

  const startButton = $('teacher-start-btn');
  let roomCreated = false;

  try {
    state.creatingRoom = true;
    if (startButton) startButton.disabled = true;

    setStatus('교사 계정을 확인하고 있습니다.');
    const teacherEmail = await ensureTeacherAllowed();
    if (!teacherEmail) return;

    const pin = generatePin();
    const network = new ClassroomNetwork(SUPABASE_URL, SUPABASE_ANON_KEY);
    const joined = await network.joinSession(pin, 'Teacher', 'teacher', { game: 'lotto' });
    if (!joined) {
      throw new Error('로또 방을 만들지 못했습니다. 잠시 후 다시 시도하세요.');
    }

    state.mode = 'teacher';
    state.pin = pin;
    state.network = network;
    state.students = [];
    state.submissions = new Map();
    roomCreated = true;

    state.network.on('onStudentSync', (students) => {
      state.students = students.filter((student) => student.game === 'lotto' || !student.game);
      renderTeacherRoom();
    });
    state.network.on('onResultReported', (payload) => {
      if (payload?.game !== 'lotto' || payload.roundId !== state.roundId) return;
      if (!canSubmitSelection(payload.numbers || [])) return;
      state.submissions.set(payload.studentId, {
        studentId: payload.studentId,
        nickname: payload.nickname,
        numbers: normalizeNumbers(payload.numbers),
        submittedAt: payload.submittedAt || Date.now(),
        autoSubmitted: Boolean(payload.autoSubmitted),
      });
      renderTeacherRoom();
    });

    showScreen('teacher-screen');
    renderTeacherRoom();
    setStatus('교사용 로또 방이 준비되었습니다.', 'success');
  } catch (error) {
    console.error('[Lotto] Failed to create teacher room:', error);
    setStatus(error.message || '교사용 방을 만들 수 없습니다.', 'error');
  } finally {
    state.creatingRoom = false;
    if (!roomCreated && startButton) {
      startButton.disabled = false;
    }
  }
}

async function joinStudentRoom(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const room = (
    form.querySelector('[name="room"]')?.value ||
    $('student-room-code')?.value ||
    state.pin ||
    ''
  ).trim();
  const nickname = (
    form.querySelector('[name="name"]')?.value ||
    $('student-name')?.value ||
    $('student-name-active')?.value ||
    ''
  ).trim();

  if (!/^\d{6}$/.test(room)) {
    setStatus('6자리 방 코드를 입력하세요.', 'error');
    return;
  }
  if (!nickname) {
    setStatus('이름 또는 별명을 입력하세요.', 'error');
    return;
  }
  if (!isConnected()) {
    setStatus('Supabase 연결을 사용할 수 없습니다.', 'error');
    return;
  }

  state.mode = 'student';
  state.pin = room;
  state.network = new ClassroomNetwork(SUPABASE_URL, SUPABASE_ANON_KEY);
  setStudentRoomFields(room);
  showScreen('student-screen');
  setStatus('방에 접속하는 중입니다.');

  const joined = await state.network.joinSession(room, nickname, 'student', {
    game: 'lotto',
    submitted: false,
  });
  if (!joined) {
    setStatus('방 접속에 실패했습니다. 방 코드를 확인하세요.', 'error');
    return;
  }

  state.network.on('onGameStart', (payload) => {
    if (payload?.game !== 'lotto') return;
    state.roundId = payload.roundId;
    state.roundState = 'selecting';
    showStudentGamePanel();
    setStatus('번호 6개를 선택해 제출하세요.');
  });
  state.network.on('onForceSubmit', (payload) => {
    if (payload?.game !== 'lotto' || payload.roundId !== state.roundId) return;
    if (!submitStudentTicket(true)) {
      state.submitted = true;
      setStatus('6개 번호를 고르지 않아 미제출 처리되었습니다.', 'error');
      renderStudentSelection();
    }
  });
  state.network.on('onRankingUpdate', (payload) => {
    if (payload?.game !== 'lotto' || payload.roundId !== state.roundId) return;
    const myEntry = (payload.ranking || []).find((entry) => entry.studentId === state.network.id);
    if (!myEntry) {
      setStatus('이번 라운드는 미제출 처리되었습니다.', 'error');
      return;
    }
    state.myResult = myEntry;
    renderMyResult();
  });

  setStatus('접속 완료. 교사의 시작을 기다리세요.', 'success');
}

function setStudentRoomFields(room) {
  const roomInput = $('student-room-code');
  if (roomInput) roomInput.value = room;
  const activeRoomInput = $('student-room-code-active');
  if (activeRoomInput) activeRoomInput.value = room;
  const activeRoomLabel = $('student-room-code-label');
  if (activeRoomLabel) activeRoomLabel.textContent = room;
}

function renderTeacherRoom() {
  const studentUrl = buildStudentUrl(state.pin);
  const roomCode = $('teacher-room-code');
  if (roomCode) roomCode.textContent = state.pin || '------';

  const url = $('student-room-url');
  if (url) url.textContent = studentUrl;

  const studentCount = $('student-count');
  if (studentCount) studentCount.textContent = String(state.students.length);

  const submittedCount = $('submitted-count');
  if (submittedCount) submittedCount.textContent = String(state.submissions.size);

  const unsubmittedCount = $('unsubmitted-count');
  if (unsubmittedCount) {
    unsubmittedCount.textContent = String(Math.max(0, state.students.length - state.submissions.size));
  }

  const timerDisplay = $('timer-display');
  if (timerDisplay) timerDisplay.textContent = formatTimer(state.timer.remainingSeconds);

  renderQrCode(studentUrl);
  renderStudentList();
  updateTeacherSteps();
}

function updateTeacherSteps() {
  const roundState = state.roundState;

  const lobbyPanel = $('teacher-step-panel-lobby');
  const selectingPanel = $('teacher-step-panel-selecting');
  const drawingPanel = $('teacher-step-panel-drawing');
  const resultsPanel = $('teacher-step-panel-results');

  if (lobbyPanel) lobbyPanel.hidden = roundState !== 'lobby';
  if (selectingPanel) selectingPanel.hidden = roundState !== 'selecting';
  if (drawingPanel) drawingPanel.hidden = roundState !== 'closed' && roundState !== 'drawing';
  if (resultsPanel) resultsPanel.hidden = roundState !== 'results';

  const stepLobby = $('step-lobby');
  const stepSelecting = $('step-selecting');
  const stepDrawing = $('step-drawing');
  const stepResults = $('step-results');

  const steps = [
    { el: stepLobby, key: 'lobby' },
    { el: stepSelecting, key: 'selecting' },
    { el: stepDrawing, keys: ['closed', 'drawing'] },
    { el: stepResults, key: 'results' },
  ];

  let currentStepIdx = 0;
  if (roundState === 'selecting') currentStepIdx = 1;
  else if (roundState === 'closed' || roundState === 'drawing') currentStepIdx = 2;
  else if (roundState === 'results') currentStepIdx = 3;

  steps.forEach((step, idx) => {
    if (!step.el) return;
    step.el.classList.remove('active', 'completed');
    if (idx === currentStepIdx) {
      step.el.classList.add('active');
    } else if (idx < currentStepIdx) {
      step.el.classList.add('completed');
    }
  });
}

function renderQrCode(studentUrl) {
  const qr = $('qr-code');
  if (!qr) return;
  qr.innerHTML = '';

  if (window.QRCode) {
    new window.QRCode(qr, {
      text: studentUrl,
      width: 196,
      height: 196,
      correctLevel: window.QRCode.CorrectLevel.M,
    });
  } else {
    qr.textContent = 'QR 라이브러리를 불러오지 못했습니다.';
  }
}

function renderStudentList() {
  const lobbyList = $('student-list-lobby');
  const selectingList = $('student-list-selecting');

  if (lobbyList) {
    if (!state.students.length) {
      lobbyList.textContent = '학생 접속 대기 중...';
    } else {
      lobbyList.innerHTML = state.students
        .map((student) => `<div class="student-chip">${escapeHtml(student.nickname)}</div>`)
        .join('');
    }
  }

  if (selectingList) {
    if (!state.students.length) {
      selectingList.textContent = '학생 접속 대기 중...';
    } else {
      selectingList.innerHTML = state.students
        .map((student) => {
          const hasSubmitted = state.submissions.has(student.id);
          const submittedClass = hasSubmitted ? 'submitted' : '';
          return `<div class="student-chip ${submittedClass}">${escapeHtml(student.nickname)}</div>`;
        })
        .join('');
    }
  }
}

function renderWinningBalls(revealedCount = 7) {
  const winningBalls = $('winning-balls');
  const winningBallsResult = $('winning-balls-result');

  const balls = [...state.draw.winning, state.draw.bonus].filter(Boolean);
  const visible = balls.slice(0, revealedCount);
  while (visible.length < 7) visible.push(null);

  const html = visible.map((number, index) => {
    if (!number) return '<span class="lotto-ball ball-empty">-</span>';
    const label = index === 6 ? `${number}<small>보너스</small>` : number;
    return `<span class="lotto-ball" style="background:${getBallColor(number)}">${label}</span>`;
  }).join('');

  if (winningBalls) {
    winningBalls.innerHTML = html;
  }
  if (winningBallsResult) {
    winningBallsResult.innerHTML = html;
  }
}

function renderManualWinningGrid() {
  const grid = $('manual-winning-grid');
  if (!grid) return;

  const selected = [...state.draw.winning, state.draw.bonus].filter(Boolean);
  grid.innerHTML = Array.from({ length: 45 }, (_, index) => {
    const number = index + 1;
    const pressed = selected.includes(number);
    return `<button class="number-btn" type="button" data-winning-number="${number}" aria-pressed="${pressed}">${number}</button>`;
  }).join('');

  grid.querySelectorAll('[data-winning-number]').forEach((button) => {
    button.addEventListener('click', () => chooseWinningNumber(Number(button.dataset.winningNumber)));
  });

  const revealButton = $('reveal-results-btn');
  if (revealButton) {
    revealButton.disabled = !(state.draw.winning.length === 6 && state.draw.bonus);
  }
}

function chooseWinningNumber(number) {
  if (state.draw.winning.includes(number)) {
    state.draw.winning = state.draw.winning.filter((item) => item !== number);
    manualDrawStep = 'winning';
  } else if (state.draw.bonus === number) {
    state.draw.bonus = null;
    manualDrawStep = 'bonus';
  } else if (state.draw.winning.length < 6) {
    state.draw.winning = normalizeNumbers([...state.draw.winning, number]);
    manualDrawStep = state.draw.winning.length >= 6 ? 'bonus' : 'winning';
  } else if (!state.draw.bonus) {
    state.draw.bonus = number;
    manualDrawStep = 'complete';
  }

  renderWinningBalls();
  renderManualWinningGrid();
}

function useRandomDraw() {
  state.draw = drawRandomNumbers();
  manualDrawStep = 'complete';
  renderWinningBalls();
  renderManualWinningGrid();
  playTeacherTone(660, 0.08);
}

function getBallColor(number) {
  if (number <= 10) return '#fbbf24';
  if (number <= 20) return '#60a5fa';
  if (number <= 30) return '#f87171';
  if (number <= 40) return '#a78bfa';
  return '#34d399';
}

function renderSelectedBalls() {
  const values = [...state.selectedNumbers];
  while (values.length < 6) values.push(null);

  const selectedBalls = $('selected-balls');
  if (!selectedBalls) return;
  selectedBalls.innerHTML = values
    .map((number) => {
      if (!number) return '<span class="lotto-ball ball-empty">-</span>';
      return `<span class="lotto-ball" style="background:${getBallColor(number)}">${number}</span>`;
    })
    .join('');
}

function renderNumberGrid() {
  const grid = $('number-grid');
  if (!grid) return;

  grid.innerHTML = Array.from({ length: 45 }, (_, index) => {
    const number = index + 1;
    const selected = state.selectedNumbers.includes(number);
    const disabled = state.submitted ? 'disabled' : '';
    return `<button class="number-btn" type="button" data-number="${number}" aria-pressed="${selected}" ${disabled}>${number}</button>`;
  }).join('');

  grid.querySelectorAll('.number-btn').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedNumbers = toggleSelection(state.selectedNumbers, Number(button.dataset.number));
      renderStudentSelection();
    });
  });
}

function renderStudentSelection() {
  renderSelectedBalls();
  renderNumberGrid();
  const submitButton = $('submit-ticket-btn');
  if (submitButton) {
    submitButton.disabled = state.submitted || !canSubmitSelection(state.selectedNumbers);
  }
}

function showStudentGamePanel() {
  const joinPanel = $('student-join-panel');
  if (joinPanel) joinPanel.hidden = true;
  const gamePanel = $('student-game-panel');
  if (gamePanel) gamePanel.hidden = false;

  state.selectedNumbers = [];
  state.submitted = false;
  renderStudentSelection();
}

function submitStudentTicket(autoSubmitted = false) {
  if (state.submitted || !canSubmitSelection(state.selectedNumbers) || !state.network) return false;

  state.submitted = true;
  const numbers = normalizeNumbers(state.selectedNumbers);
  state.network.sendResult(0, {
    game: 'lotto',
    roundId: state.roundId,
    numbers,
    autoSubmitted,
    submittedAt: Date.now(),
  });
  state.network.updatePresenceState({ game: 'lotto', submitted: true });
  setStatus(autoSubmitted ? '시간 종료로 자동 제출되었습니다.' : '번호가 제출되었습니다.');
  renderStudentSelection();
  return true;
}

async function revealResults() {
  if (state.draw.winning.length !== 6 || !state.draw.bonus) return;

  state.roundState = 'drawing';
  setStatus('당첨 번호를 공개합니다.');
  for (let count = 1; count <= 7; count += 1) {
    renderWinningBalls(count);
    playTeacherTone(520 + count * 40, 0.08);
    await wait(650);
  }

  state.roundState = 'results';
  const entries = Array.from(state.submissions.values()).map((submission) => ({
    ...submission,
    result: evaluateTicket(submission.numbers, state.draw),
  }));
  state.ranking = sortRanking(entries);
  renderRanking();
  if (state.network) {
    state.network.broadcastRankings({
      game: 'lotto',
      roundId: state.roundId,
      draw: state.draw,
      ranking: state.ranking,
    });
  }
  setStatus('결과가 공개되었습니다.', 'success');
}

function renderRanking() {
  const list = $('ranking-list');
  if (!list) return;

  if (!state.ranking.length) {
    list.textContent = '제출 결과가 없습니다.';
    return;
  }

  list.innerHTML = state.ranking.map((entry, index) => `
    <div class="ranking-row">
      <strong>${index + 1}위</strong>
      <span>${escapeHtml(entry.nickname)} · ${entry.result.rankLabel} · ${entry.result.matchCount}개 일치</span>
      <span>${entry.numbers.join(', ')}</span>
    </div>
  `).join('');
}

function renderMyResult() {
  const result = $('student-result');
  if (!result || !state.myResult) return;

  result.hidden = false;
  result.innerHTML = `
    <h3>${state.myResult.result.rankLabel}</h3>
    <p>${state.myResult.result.matchCount}개 일치</p>
    <p>맞힌 번호: ${state.myResult.result.matchedNumbers.join(', ') || '없음'}</p>
    <p>보너스 번호: ${state.myResult.result.bonusMatched ? '일치' : '불일치'}</p>
  `;
  setStatus('내 결과가 공개되었습니다.', 'success');
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function playTeacherTone(frequency = 600, duration = 0.08) {
  if (state.mode !== 'teacher') return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = 'sine';
  gain.gain.setValueAtTime(0.08, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function openLargeQr() {
  const qrImg = document.querySelector('#qr-code img');
  if (!qrImg || !qrImg.src) {
    setStatus('QR 코드가 아직 생성되지 않았습니다.', 'error');
    return;
  }
  const src = qrImg.src;
  const qrWin = window.open('', '_blank', 'width=600,height=650,menubar=no,toolbar=no,location=no,status=no');
  if (!qrWin) {
    alert('팝업 차단이 설정되어 있습니다. 팝업 차단을 해제해주세요.');
    return;
  }
  qrWin.document.write(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <title>Classroom Lotto - QR Code</title>
      <meta charset="UTF-8">
      <style>
        body {
          margin: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          font-family: system-ui, -apple-system, sans-serif;
          background: #fff8df;
          color: #2f2106;
          text-align: center;
        }
        .container {
          padding: 32px;
          background: #ffffff;
          border: 1px solid rgba(132, 92, 10, 0.2);
          border-radius: 24px;
          box-shadow: 0 15px 35px rgba(148, 91, 9, 0.15);
          max-width: 90%;
        }
        h1 {
          font-size: 24px;
          margin-top: 0;
          margin-bottom: 8px;
          font-weight: 800;
        }
        p {
          font-size: 15px;
          color: #72551b;
          margin-bottom: 24px;
        }
        img {
          width: 420px;
          height: 420px;
          max-width: 100%;
          height: auto;
          border: 1px solid #f3ebe1;
          border-radius: 16px;
          padding: 8px;
          background: #ffffff;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Classroom Lotto</h1>
        <p>휴대폰 카메라로 QR 코드를 스캔하여 게임에 참여하세요!</p>
        <img src="${src}" alt="QR Code">
      </div>
    </body>
    </html>
  `);
  qrWin.document.close();
}

function goToLobby() {
  state.roundState = 'lobby';
  state.submissions = new Map();
  state.draw = { winning: [], bonus: null };
  state.ranking = [];
  state.timer.remainingSeconds = state.timer.totalSeconds;
  manualDrawStep = 'winning';
  state.myResult = null;
  renderWinningBalls();
  renderManualWinningGrid();
  renderRanking();
  renderTeacherRoom();
  setStatus('다음 라운드 준비를 위해 대기방으로 이동했습니다.');
}

function resetRoundState() {
  state.roundId = createRoundId();
  state.roundState = 'selecting';
  state.submissions = new Map();
  state.draw = { winning: [], bonus: null };
  state.ranking = [];
  state.timer.remainingSeconds = state.timer.totalSeconds;
  manualDrawStep = 'winning';
  state.myResult = null;
  renderWinningBalls();
  renderManualWinningGrid();
  renderRanking();
}

function startTeacherRound() {
  if (!state.network) {
    setStatus('먼저 교사용 방을 만들어 주세요.', 'error');
    return;
  }

  resetRoundState();
  state.network.broadcastRoundReset({ game: 'lotto', roundId: state.roundId });
  state.network.broadcastSettings({
    game: 'lotto',
    roundId: state.roundId,
    state: 'selecting',
    timerSeconds: state.timer.totalSeconds,
  });
  state.network.broadcastStart({ game: 'lotto', roundId: state.roundId });

  const startButton = $('start-round-btn');
  if (startButton) startButton.disabled = true;
  const closeButton = $('close-round-btn');
  if (closeButton) closeButton.disabled = false;

  startTimer();
  renderTeacherRoom();
  setStatus('라운드가 시작되었습니다.');
}

function startTimer() {
  stopTimer();
  state.timer.remainingSeconds = state.timer.totalSeconds;
  state.timer.intervalId = window.setInterval(() => {
    state.timer.remainingSeconds = Math.max(0, state.timer.remainingSeconds - 1);
    renderTeacherRoom();
    if (state.timer.remainingSeconds <= 0) {
      closeTeacherRound();
    }
  }, 1000);
}

function stopTimer() {
  if (!state.timer.intervalId) return;
  window.clearInterval(state.timer.intervalId);
  state.timer.intervalId = null;
}

function closeTeacherRound() {
  if (state.roundState !== 'selecting') return;

  state.roundState = 'closed';
  stopTimer();
  if (state.network) {
    state.network.broadcastForceSubmit({ game: 'lotto', roundId: state.roundId });
  }

  const startButton = $('start-round-btn');
  if (startButton) startButton.disabled = false;
  const closeButton = $('close-round-btn');
  if (closeButton) closeButton.disabled = true;

  renderTeacherRoom();
  setStatus('제출이 마감되었습니다. 당첨 번호를 설정하세요.');
}

function boot() {
  if (booted) return;
  booted = true;

  const supabaseReady = isConnected();
  if (!supabaseReady) {
    setStatus('Supabase 연결을 사용할 수 없습니다. CDN 로딩 상태를 확인하세요.', 'error');
  }

  bindStartEvents();
  bindTeacherRoundControls();
  $('submit-ticket-btn')?.addEventListener('click', () => submitStudentTicket(false));

  const room = readRoomFromUrl();
  if (room) {
    state.mode = 'student';
    state.pin = room;
    setStudentRoomFields(room);
    showScreen('student-screen');
    if (supabaseReady) {
      setStatus('이름을 입력하고 참여하세요.');
    }
    return;
  }

  showScreen('start-screen');
}

window.addEventListener('DOMContentLoaded', boot);
