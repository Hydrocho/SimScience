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
  const list = $('student-list');
  if (!list) return;

  if (!state.students.length) {
    list.textContent = '학생 접속 대기 중...';
    return;
  }

  list.innerHTML = state.students
    .map((student) => `<div class="student-chip">${escapeHtml(student.nickname)}</div>`)
    .join('');
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function boot() {
  if (booted) return;
  booted = true;

  const supabaseReady = isConnected();
  if (!supabaseReady) {
    setStatus('Supabase 연결을 사용할 수 없습니다. CDN 로딩 상태를 확인하세요.', 'error');
  }

  bindStartEvents();
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
