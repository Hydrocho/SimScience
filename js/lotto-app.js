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

void [canSubmitSelection, createRoundId, drawRandomNumbers, evaluateTicket, formatTimer, normalizeNumbers, sortRanking, toggleSelection];

const SUPABASE_URL = 'https://vdyvpsteofvhbvvrilxe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkeXZwc3Rlb2Z2aGJ2dnJpbHhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MzQ4ODMsImV4cCI6MjA5NTExMDg4M30.9kYsTmJGigMpanoj0CWFdHOZkDTUXqZo8neNuBxXIYU';

const state = {
  mode: 'start',
  pin: '',
  roundId: '',
  roundState: 'lobby',
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
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
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
  if (error) {
    throw error;
  }

  const session = data?.session;
  if (!session) {
    await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href,
      },
    });
    throw new Error('Google 로그인으로 이동합니다.');
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
  try {
    setStatus('교사 계정을 확인하고 있습니다.', 'neutral');
    const teacherEmail = await ensureTeacherAllowed();
    const pin = generatePin();
    const network = new ClassroomNetwork(SUPABASE_URL, SUPABASE_ANON_KEY);

    const joined = await network.joinSession(pin, teacherEmail, 'teacher', { game: 'lotto' });
    if (!joined) {
      throw new Error('로또 방을 만들지 못했습니다. 잠시 후 다시 시도하세요.');
    }

    state.mode = 'teacher';
    state.pin = pin;
    state.network = network;

    const pinDisplay = $('teacher-room-code');
    if (pinDisplay) pinDisplay.textContent = pin;

    const urlDisplay = $('student-room-url');
    if (urlDisplay) urlDisplay.textContent = buildStudentUrl(pin);

    showScreen('teacher-screen');
    setStatus('교사용 로또 방이 준비되었습니다.', 'success');
  } catch (error) {
    console.error('[Lotto] Failed to create teacher room:', error);
    setStatus(error.message || '교사용 방을 만들 수 없습니다.', 'error');
  }
}

function joinStudentRoom(event) {
  event.preventDefault();
  setStatus('학생 참여 기능은 다음 작업에서 연결됩니다.', 'neutral');
}

function boot() {
  const supabaseReady = isConnected();
  if (!supabaseReady) {
    setStatus('Supabase 연결을 사용할 수 없습니다. CDN 로딩 상태를 확인하세요.', 'error');
  }

  bindStartEvents();

  const room = readRoomFromUrl();
  if (room) {
    state.mode = 'student';
    state.pin = room;
    const roomInput = $('student-room-code');
    if (roomInput) roomInput.value = room;
    showScreen('student-screen');
    if (supabaseReady) {
      setStatus('학생 참여 화면이 열렸습니다. 실제 참여 기능은 다음 작업에서 연결됩니다.', 'neutral');
    }
    return;
  }

  showScreen('start-screen');
}

window.addEventListener('DOMContentLoaded', boot);
