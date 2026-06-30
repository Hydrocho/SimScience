import { checkIsTeacherAllowed, isConnected, supabaseClient } from './supabase.js';
import { ClassroomNetwork } from './network.js';
import {
  DEBATE_MAX_MESSAGE_LENGTH,
  buildDebatePrompt,
  isValidDebateMessage,
  normalizeChatHistory,
  sanitizeDebateMessage,
} from './debate-core.mjs';

void buildDebatePrompt;

const SUPABASE_URL = 'https://vdyvpsteofvhbvvrilxe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkeXZwc3Rlb2Z2aGJ2dnJpbHhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MzQ4ODMsImV4cCI6MjA5NTExMDg4M30.9kYsTmJGigMpanoj0CWFdHOZkDTUXqZo8neNuBxXIYU';

const state = {
  mode: 'start',
  pin: '',
  roomId: '',
  teacherEmail: '',
  chatOpen: false,
  network: null,
  students: [],
  messages: [],
  sending: false,
  roomStateSyncIntervalId: null,
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

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function readRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room') || '';
  return /^\d{6}$/.test(room) ? room : '';
}

function buildStudentUrl(pin) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', pin);
  return url.toString();
}

async function ensureTeacherSession() {
  if (!supabaseClient) {
    throw new Error('Supabase 연결을 사용할 수 없습니다.');
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;

  const session = data?.session;
  if (!session) {
    await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    return null;
  }

  const email = session.user?.email || '';
  const isAllowed = await checkIsTeacherAllowed(email);
  if (!isAllowed) {
    await supabaseClient.auth.signOut();
    throw new Error('허용된 교사 계정이 아닙니다.');
  }
  state.teacherEmail = email;
  const emailEl = $('teacher-email');
  if (emailEl) emailEl.textContent = `로그인 계정: ${email}`;
  return email;
}

async function invokeDebateFunction(body) {
  if (!supabaseClient) throw new Error('Supabase 연결을 사용할 수 없습니다.');
  const { data, error } = await supabaseClient.functions.invoke('gemini-debate', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

function bindStartEvents() {
  $('teacher-start-btn')?.addEventListener('click', createTeacherRoom);
  $('student-join-form')?.addEventListener('submit', joinStudentRoom);
  $('student-join-form-active')?.addEventListener('submit', joinStudentRoom);
}

function bindTeacherEvents() {
  $('open-chat-btn')?.addEventListener('click', () => setTeacherChatOpen(true));
  $('close-chat-btn')?.addEventListener('click', () => setTeacherChatOpen(false));
}

function bindStudentEvents() {
  $('send-message-btn')?.addEventListener('click', sendStudentMessage);
  $('student-message')?.addEventListener('input', renderStudentChatState);
}

async function createTeacherRoom() {
  const startButton = $('teacher-start-btn');
  if (startButton) startButton.disabled = true;

  try {
    setStatus('교사 계정을 확인하고 있습니다.');
    const teacherEmail = await ensureTeacherSession();
    if (!teacherEmail) return;

    const pin = generatePin();
    const created = await invokeDebateFunction({ action: 'create_room', pin });
    state.mode = 'teacher';
    state.pin = created.pin || pin;
    state.roomId = created.roomId || '';
    state.chatOpen = false;
    state.messages = [];
    state.network = new ClassroomNetwork(SUPABASE_URL, SUPABASE_ANON_KEY);

    state.network.on('onStudentSync', (students) => {
      state.students = students.filter((student) => student.game === 'debate' || !student.game);
      renderTeacherRoom();
    });
    state.network.on('onResultReported', (payload) => {
      if (payload?.game !== 'debate') return;
      addTeacherMonitorMessage(payload);
    });

    const joined = await state.network.joinSession(state.pin, 'Teacher', 'teacher', {
      game: 'debate',
      chatOpen: false,
    });
    if (!joined) throw new Error('토론방 실시간 채널에 연결하지 못했습니다.');

    showScreen('teacher-screen');
    renderTeacherRoom();
    setStatus('토론방이 준비되었습니다. 필요할 때 대화창을 여세요.', 'success');
  } catch (error) {
    console.error('[Debate] Failed to create room:', error);
    setStatus(error.message || '토론방을 만들 수 없습니다.', 'error');
    if (startButton) startButton.disabled = false;
  }
}

async function setTeacherChatOpen(isOpen) {
  if (!state.network || !state.pin) return;
  const openButton = $('open-chat-btn');
  const closeButton = $('close-chat-btn');
  if (openButton) openButton.disabled = true;
  if (closeButton) closeButton.disabled = true;

  try {
    await invokeDebateFunction({ action: 'set_room_open', pin: state.pin, isOpen });
    state.chatOpen = isOpen;
    state.network.broadcastSettings({ game: 'debate', chatOpen: isOpen });
    await state.network.updatePresenceState({ game: 'debate', chatOpen: isOpen });
    renderTeacherRoom();
    setStatus(isOpen ? '학생 대화창을 열었습니다.' : '학생 대화창을 닫았습니다.', 'success');
  } catch (error) {
    console.error('[Debate] Failed to update room state:', error);
    setStatus(error.message || '대화창 상태를 바꾸지 못했습니다.', 'error');
    renderTeacherRoom();
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
    setStatus('이름을 입력하세요.', 'error');
    return;
  }
  if (!isConnected()) {
    setStatus('Supabase 연결을 사용할 수 없습니다.', 'error');
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  const fields = form.querySelectorAll('input, button');
  if (submitButton) submitButton.disabled = true;
  fields.forEach((field) => { field.disabled = true; });

  try {
    state.mode = 'student';
    state.pin = room;
    state.messages = [];
    state.network = new ClassroomNetwork(SUPABASE_URL, SUPABASE_ANON_KEY);

    state.network.on('onReceiveSettings', (payload) => {
      if (payload?.game !== 'debate') return;
      state.chatOpen = Boolean(payload.chatOpen);
      renderStudentChatState();
    });
    state.network.on('onTeacherStateSync', (teacher) => {
      if (!teacher || teacher.game !== 'debate') return;
      state.chatOpen = Boolean(teacher.chatOpen);
      renderStudentChatState();
    });

    setStudentRoomFields(room);
    showScreen('student-screen');
    setStatus('토론방에 접속하는 중입니다.');

    const joined = await state.network.joinSession(room, nickname, 'student', {
      game: 'debate',
    });
    if (!joined) throw new Error('방 접속에 실패했습니다. 방 코드를 확인하세요.');

    const joinPanel = $('student-join-panel');
    if (joinPanel) joinPanel.hidden = true;
    const chatPanel = $('student-chat-panel');
    if (chatPanel) chatPanel.hidden = false;
    await syncRoomOpenFromDatabase();
    startRoomStateSync();
    renderChatLog();
    renderStudentChatState();
    setStatus(
      state.chatOpen
        ? '접속 완료. 토론을 시작하세요!'
        : '접속 완료. 교사가 대화창을 열 때까지 기다리세요.',
      'success'
    );
  } catch (error) {
    console.error('[Debate] Failed to join room:', error);
    setStatus(error.message || '방 접속에 실패했습니다.', 'error');
    fields.forEach((field) => { field.disabled = false; });
    if (submitButton) submitButton.disabled = false;
  }
}

async function sendStudentMessage() {
  if (state.sending || !state.network) return;
  const input = $('student-message');
  const rawMessage = input?.value || '';

  await syncRoomOpenFromDatabase();

  if (!state.chatOpen) {
    setStatus('교사가 대화창을 열어야 메시지를 보낼 수 있습니다.', 'error');
    return;
  }
  if (!isValidDebateMessage(rawMessage)) {
    setStatus(`1자 이상 ${DEBATE_MAX_MESSAGE_LENGTH}자 이하로 입력하세요.`, 'error');
    return;
  }

  const message = sanitizeDebateMessage(rawMessage);
  state.sending = true;
  if (input) input.value = '';
  const localStudentMessage = {
    role: 'student',
    nickname: state.network.nickname,
    content: message,
    createdAt: Date.now(),
  };
  state.messages.push(localStudentMessage);
  renderChatLog();
  renderStudentChatState();
  setStatus('AI가 응답을 준비하고 있습니다.');

  try {
    const response = await invokeDebateFunction({
      action: 'ask',
      pin: state.pin,
      studentId: state.network.id,
      nickname: state.network.nickname,
      message,
      history: normalizeChatHistory(state.messages),
    });
    const aiMessage = {
      role: 'ai',
      nickname: 'AI',
      content: response.reply || '',
      createdAt: Date.now(),
    };
    state.messages.push(aiMessage);
    state.network.sendResult(0, {
      game: 'debate',
      eventType: 'exchange',
      studentMessage: localStudentMessage.content,
      aiMessage: aiMessage.content,
      createdAt: Date.now(),
    });
    renderChatLog();
    setStatus('AI 응답이 도착했습니다.', 'success');
  } catch (error) {
    console.error('[Debate] Gemini request failed:', error);
    setStatus(error.message || 'AI 응답을 받을 수 없습니다.', 'error');
  } finally {
    state.sending = false;
    renderStudentChatState();
  }
}

function addTeacherMonitorMessage(payload) {
  state.messages.push({
    role: 'student',
    nickname: payload.nickname,
    content: payload.studentMessage || '',
    createdAt: payload.createdAt || Date.now(),
  });
  state.messages.push({
    role: 'ai',
    nickname: 'AI',
    studentNickname: payload.nickname,
    content: payload.aiMessage || '',
    createdAt: payload.createdAt || Date.now(),
  });
  renderTeacherRoom();
}

function setStudentRoomFields(room) {
  const roomInput = $('student-room-code');
  if (roomInput) roomInput.value = room;
  const activeRoomInput = $('student-room-code-active');
  if (activeRoomInput) activeRoomInput.value = room;
  const label = $('student-room-code-label');
  if (label) label.textContent = room;
}

function renderTeacherRoom() {
  const roomCode = $('teacher-room-code');
  if (roomCode) roomCode.textContent = state.pin || '------';
  const studentUrl = state.pin ? buildStudentUrl(state.pin) : '';
  const url = $('student-room-url');
  if (url) url.textContent = studentUrl;
  renderQrCode(studentUrl);

  const studentCount = $('student-count');
  if (studentCount) studentCount.textContent = String(state.students.length);
  const studentMessages = state.messages.filter((message) => message.role === 'student').length;
  const aiMessages = state.messages.filter((message) => message.role === 'ai').length;
  const messageCount = $('message-count');
  if (messageCount) messageCount.textContent = String(studentMessages);
  const aiCount = $('ai-count');
  if (aiCount) aiCount.textContent = String(aiMessages);

  const roomState = $('room-state');
  if (roomState) {
    roomState.textContent = state.chatOpen ? '열림' : '닫힘';
    roomState.classList.toggle('open', state.chatOpen);
  }
  const openButton = $('open-chat-btn');
  if (openButton) openButton.disabled = state.chatOpen;
  const closeButton = $('close-chat-btn');
  if (closeButton) closeButton.disabled = !state.chatOpen;

  renderStudentList();
  renderMonitorList();
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

function renderMonitorList() {
  const list = $('monitor-list');
  if (!list) return;
  if (!state.messages.length) {
    list.textContent = '아직 대화가 없습니다.';
    return;
  }
  list.innerHTML = state.messages
    .slice(-40)
    .map((message) => {
      const name = message.role === 'ai'
        ? `AI${message.studentNickname ? ` -> ${message.studentNickname}` : ''}`
        : message.nickname;
      return `
        <div class="monitor-item">
          <strong>${escapeHtml(name)}</strong>
          <p>${escapeHtml(message.content)}</p>
        </div>
      `;
    })
    .join('');
}

function renderQrCode(studentUrl) {
  const qr = $('qr-code');
  if (!qr) return;
  qr.innerHTML = '';
  if (!studentUrl) {
    qr.textContent = '방 생성 대기 중';
    return;
  }
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

async function syncRoomOpenFromDatabase() {
  if (!supabaseClient || state.mode !== 'student' || !state.pin) return;

  const { data, error } = await supabaseClient
    .from('debate_rooms')
    .select('is_open')
    .eq('pin', state.pin)
    .maybeSingle();

  if (error || !data) return;

  const nextChatOpen = Boolean(data.is_open);
  if (state.chatOpen === nextChatOpen) return;

  state.chatOpen = nextChatOpen;
  renderStudentChatState();
}

function startRoomStateSync() {
  stopRoomStateSync();
  state.roomStateSyncIntervalId = window.setInterval(syncRoomOpenFromDatabase, 2000);
}

function stopRoomStateSync() {
  if (!state.roomStateSyncIntervalId) return;
  window.clearInterval(state.roomStateSyncIntervalId);
  state.roomStateSyncIntervalId = null;
}

function renderStudentChatState() {
  const stateEl = $('student-room-state');
  if (stateEl) {
    stateEl.textContent = state.chatOpen
      ? '대화창 열림: AI와 토론할 수 있습니다.'
      : '교사가 대화창을 열 때까지 기다리세요.';
    stateEl.classList.toggle('open', state.chatOpen);
  }
  const input = $('student-message');
  const button = $('send-message-btn');
  const hasMessage = isValidDebateMessage(input?.value || '');
  if (input) input.disabled = !state.chatOpen || state.sending;
  if (button) button.disabled = !state.chatOpen || !hasMessage || state.sending;
}

function renderChatLog() {
  const log = $('chat-log');
  if (!log) return;
  if (!state.messages.length) {
    log.innerHTML = '<p>내 입장을 먼저 적어 보세요. AI가 반론과 질문을 이어갑니다.</p>';
    return;
  }
  log.innerHTML = state.messages
    .map((message) => `
      <div class="message ${message.role}">
        <strong>${message.role === 'ai' ? 'AI 토론자' : escapeHtml(message.nickname || '나')}</strong>
        <p>${escapeHtml(message.content)}</p>
      </div>
    `)
    .join('');
  log.scrollTop = log.scrollHeight;
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
  if (!isConnected()) {
    setStatus('Supabase 연결을 사용할 수 없습니다. CDN 로딩 상태를 확인하세요.', 'error');
  }

  bindStartEvents();
  bindTeacherEvents();
  bindStudentEvents();

  const room = readRoomFromUrl();
  if (room) {
    state.mode = 'student';
    state.pin = room;
    setStudentRoomFields(room);
    showScreen('student-screen');
    setStatus('이름을 입력하고 참여하세요.');
    return;
  }

  showScreen('start-screen');
}

window.addEventListener('DOMContentLoaded', boot);
