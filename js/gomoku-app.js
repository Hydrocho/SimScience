import { checkIsTeacherAllowed, isConnected, supabaseClient } from './supabase.js';
import {
  COLORS,
  applyMove,
  createBoard,
  createGameState,
  createRoomId,
} from './gomoku-core.mjs';

const LOBBY_CHANNEL = 'gomoku_lobby';
const ROOM_TTL_MS = 9000;
const HEARTBEAT_MS = 3000;
const PLAYER_LABELS = {
  black: '흑',
  white: '백',
  spectator: '관전',
  lobby: '로비',
};

const state = {
  id: getClientId(),
  mode: 'start',
  nickname: '',
  teacherEmail: '',
  teacherAllowed: false,
  lobbyChannel: null,
  roomChannel: null,
  rooms: new Map(),
  lobbyStudents: [],
  teacherHeartbeatAt: 0,
  roomHeartbeatId: null,
  teacherHeartbeatId: null,
  roomId: '',
  roomTitle: '',
  ownerId: '',
  participants: [],
  mySeat: 'lobby',
  game: createGameState(),
  appliedMoveIds: new Set(),
};

const $ = (id) => document.getElementById(id);

function getClientId() {
  const key = 'gomoku_client_id';
  try {
    const saved = sessionStorage.getItem(key);
    if (saved) return saved;
    const next = `gm_${Math.random().toString(36).slice(2, 11)}`;
    sessionStorage.setItem(key, next);
    return next;
  } catch {
    return `gm_${Math.random().toString(36).slice(2, 11)}`;
  }
}

function showScreen(screenId) {
  document.querySelectorAll('[data-screen]').forEach((screen) => {
    screen.classList.toggle('hidden', screen.id !== screenId);
  });
}

function renderTeacherQrCode(url) {
  const qr = $('teacher-qr-code');
  if (!qr) return;
  qr.innerHTML = '';
  
  if (window.QRCode) {
    new window.QRCode(qr, {
      text: url,
      width: 136,
      height: 136,
      correctLevel: window.QRCode.CorrectLevel.M,
    });
  } else {
    qr.textContent = 'QR 라이브러리 로드 실패';
  }
}

function openLargeQr() {
  const qrImg = document.querySelector('#teacher-qr-code img');
  if (!qrImg || !qrImg.src) {
    setStatus('QR 코드가 아직 준비되지 않았습니다.', 'error');
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
      <title>교실 오목 대기실 - QR Code</title>
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
          background: #eef4fb;
          color: #172033;
          text-align: center;
        }
        .container {
          padding: 32px;
          background: #ffffff;
          border: 1px solid #d9e2ef;
          border-radius: 24px;
          box-shadow: 0 15px 35px rgba(23, 32, 51, 0.1);
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
          color: #607089;
          margin-bottom: 24px;
          font-weight: 600;
        }
        img {
          width: 420px;
          height: 420px;
          max-width: 100%;
          height: auto;
          border: 1px solid #d9e2ef;
          border-radius: 16px;
          padding: 8px;
          background: #ffffff;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>교실 오목 대기실</h1>
        <p>휴대폰 카메라로 QR 코드를 스캔하여 게임에 참여하세요!</p>
        <img src="${src}" alt="QR Code">
      </div>
    </body>
    </html>
  `);
  qrWin.document.close();
}

function setupTeacherDashboard() {
  state.mode = 'teacher';
  showScreen('teacher-screen');
  
  // Set up student entry URL and QR Code
  const studentUrl = window.location.origin + window.location.pathname;
  const urlBox = $('student-url-box');
  if (urlBox) urlBox.textContent = studentUrl;
  renderTeacherQrCode(studentUrl);
}

function setStatus(message, tone = 'neutral') {
  const status = $('app-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function setRoomStatus(message, tone = 'neutral') {
  const status = $('room-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function setHidden(id, hidden) {
  const el = $(id);
  if (el) el.classList.toggle('hidden', hidden);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatRole(role) {
  return PLAYER_LABELS[role] || role;
}

function getRoomTitle(room) {
  return room?.title || `${room?.ownerName || '친구'}의 오목방`;
}

function bindEvents() {
  $('teacher-login-btn')?.addEventListener('click', handleTeacherLogin);
  $('permission-toggle-btn')?.addEventListener('click', toggleTeacherPermission);
  $('student-join-form')?.addEventListener('submit', handleStudentJoin);
  $('create-room-btn')?.addEventListener('click', createStudentRoom);
  $('reset-game-btn')?.addEventListener('click', resetGame);
  $('leave-room-btn')?.addEventListener('click', leaveRoom);
  $('teacher-logout-btn')?.addEventListener('click', handleTeacherLogout);
  $('teacher-qr-code')?.addEventListener('click', openLargeQr);
}

async function initLobbyChannel(trackPayload = null) {
  if (!supabaseClient) return false;
  if (state.lobbyChannel) {
    if (trackPayload) await state.lobbyChannel.track(trackPayload);
    return true;
  }

  state.lobbyChannel = supabaseClient.channel(LOBBY_CHANNEL, {
    config: { presence: { key: state.id } },
  });

  state.lobbyChannel
    .on('presence', { event: 'sync' }, handleLobbyPresence)
    .on('broadcast', { event: 'permission-change' }, ({ payload }) => {
      updateTeacherPermission(Boolean(payload?.allowed), Date.now());
    })
    .on('broadcast', { event: 'teacher-heartbeat' }, ({ payload }) => {
      updateTeacherPermission(Boolean(payload?.allowed), Date.now());
    })
    .on('broadcast', { event: 'room-upsert' }, ({ payload }) => {
      upsertRoom(payload);
    })
    .on('broadcast', { event: 'room-heartbeat' }, ({ payload }) => {
      upsertRoom(payload);
    })
    .on('broadcast', { event: 'room-remove' }, ({ payload }) => {
      if (payload?.roomId) {
        state.rooms.delete(payload.roomId);
        renderRoomList();
        renderTeacherMetrics();
      }
    });

  return new Promise((resolve) => {
    state.lobbyChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        if (trackPayload) await state.lobbyChannel.track(trackPayload);
        resolve(true);
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        resolve(false);
      }
    });
  });
}

function handleLobbyPresence() {
  const users = flattenPresence(state.lobbyChannel?.presenceState());
  const teacher = users.find((user) => user.role === 'teacher' && user.game === 'gomoku');
  state.lobbyStudents = users.filter((user) => user.role === 'student' && user.game === 'gomoku');
  if (teacher) {
    updateTeacherPermission(Boolean(teacher.allowed), Date.now());
  } else {
    updateTeacherPermission(false, Date.now());
  }
  renderTeacherMetrics();
}

function flattenPresence(presenceState = {}) {
  return Object.values(presenceState).flatMap((entries) => entries);
}

function updateTeacherPermission(allowed, sentAt) {
  state.teacherAllowed = allowed && Date.now() - sentAt < ROOM_TTL_MS;
  state.teacherHeartbeatAt = sentAt;
  renderPermissionState();
}

function broadcastLobby(event, payload) {
  if (!state.lobbyChannel) return;
  state.lobbyChannel.send({
    type: 'broadcast',
    event,
    payload,
  });
}

function upsertRoom(room) {
  if (!room?.roomId) return;
  if (Date.now() - (room.updatedAt || 0) > ROOM_TTL_MS) return;
  state.rooms.set(room.roomId, room);
  pruneRooms();
  renderRoomList();
  renderTeacherMetrics();
}

function pruneRooms() {
  const now = Date.now();
  for (const [roomId, room] of state.rooms.entries()) {
    if (now - (room.updatedAt || 0) > ROOM_TTL_MS) {
      state.rooms.delete(roomId);
    }
  }
}

async function handleTeacherLogin() {
  if (!supabaseClient) {
    setStatus('Supabase 연결을 사용할 수 없습니다.', 'error');
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    const session = data?.session;
    if (!session) {
      await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname },
      });
      return;
    }

    const email = session.user?.email || '';
    const allowed = await checkIsTeacherAllowed(email);
    if (!allowed) {
      await supabaseClient.auth.signOut();
      throw new Error('승인된 교사 계정이 아닙니다.');
    }

    state.teacherEmail = email;
    await initLobbyChannel(buildTeacherPresence());
    startTeacherHeartbeat();
    
    setupTeacherDashboard();
    
    $('teacher-email').textContent = email;
    setStatus('교사 계정 확인 완료. 오목 허용을 켜면 학생들이 방을 만들 수 있습니다.', 'success');
    renderPermissionState();
  } catch (error) {
    console.error('[Gomoku] Teacher login failed:', error);
    setStatus(error.message || '교사 로그인을 완료하지 못했습니다.', 'error');
  }
}

async function handleTeacherLogout() {
  try {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
    stopTeacherHeartbeat();
    state.teacherEmail = '';
    state.teacherAllowed = false;
    state.mode = 'start';
    showScreen('start-screen');
    setStatus('로그아웃되었습니다.', 'success');
  } catch (error) {
    console.error('[Gomoku] Sign out failed:', error);
    setStatus('로그아웃 중 오류가 발생했습니다.', 'error');
  }
}

function buildTeacherPresence() {
  return {
    id: state.id,
    role: 'teacher',
    game: 'gomoku',
    nickname: 'Teacher',
    email: state.teacherEmail,
    allowed: state.teacherAllowed,
    updatedAt: new Date().toISOString(),
  };
}

async function toggleTeacherPermission() {
  state.teacherAllowed = !state.teacherAllowed;
  const sentAt = Date.now();
  await state.lobbyChannel?.track(buildTeacherPresence());
  broadcastLobby('permission-change', {
    allowed: state.teacherAllowed,
    sentAt,
  });
  renderPermissionState();
  setStatus(state.teacherAllowed ? '오목 방 만들기를 허용했습니다.' : '새 오목 방 만들기를 닫았습니다.', 'success');
}

function startTeacherHeartbeat() {
  stopTeacherHeartbeat();
  state.teacherHeartbeatId = window.setInterval(async () => {
    await state.lobbyChannel?.track(buildTeacherPresence());
    broadcastLobby('teacher-heartbeat', {
      allowed: state.teacherAllowed,
      sentAt: Date.now(),
    });
  }, HEARTBEAT_MS);
}

function stopTeacherHeartbeat() {
  if (!state.teacherHeartbeatId) return;
  window.clearInterval(state.teacherHeartbeatId);
  state.teacherHeartbeatId = null;
}

async function handleStudentJoin(event) {
  event.preventDefault();
  const input = $('nickname-input');
  const nickname = input?.value.trim() || '';
  if (!nickname) {
    setStatus('닉네임을 입력하세요.', 'error');
    return;
  }
  state.nickname = nickname.slice(0, 16);
  const joined = await initLobbyChannel({
    id: state.id,
    role: 'student',
    game: 'gomoku',
    nickname: state.nickname,
    joinedAt: new Date().toISOString(),
  });
  if (!joined) {
    setStatus('오목 로비에 연결하지 못했습니다.', 'error');
    return;
  }
  
  state.mode = 'student';
  showScreen('student-screen');

  // Move room-panel to student-game-container
  const roomPanel = $('room-panel');
  const studentContainer = $('student-game-container');
  if (roomPanel && studentContainer) {
    studentContainer.appendChild(roomPanel);
  }
  
  $('student-name-label').textContent = state.nickname;
  setStatus('로비에 입장했습니다. 교사 허가가 켜지면 방을 만들 수 있습니다.', 'success');
  renderPermissionState();
  renderRoomList();
}

async function createStudentRoom() {
  if (!state.nickname) {
    setStatus('먼저 닉네임으로 로비에 입장하세요.', 'error');
    return;
  }
  if (!state.teacherAllowed) {
    setStatus('교사가 오목 방 만들기를 허용해야 합니다.', 'warn');
    return;
  }
  const roomId = createRoomId();
  const roomTitle = `${state.nickname}의 오목방`;
  const room = {
    roomId,
    title: roomTitle,
    ownerId: state.id,
    ownerName: state.nickname,
    blackName: state.nickname,
    whiteName: '',
    spectatorCount: 0,
    status: 'waiting',
    updatedAt: Date.now(),
  };
  state.rooms.set(roomId, room);
  broadcastLobby('room-upsert', room);
  renderRoomList();
  await joinRoom(roomId, roomTitle, true);
}

async function joinRoom(roomId, title = '', asOwner = false) {
  if (!state.nickname && state.mode !== 'teacher') {
    setStatus('먼저 닉네임으로 로비에 입장하세요.', 'error');
    return;
  }
  await leaveRoom(false);

  state.roomId = roomId;
  state.roomTitle = title || getRoomTitle(state.rooms.get(roomId));
  state.ownerId = asOwner ? state.id : '';
  state.game = createGameState();
  state.appliedMoveIds = new Set();
  state.participants = [];
  state.mySeat = 'spectator';

  if (state.mode === 'teacher') {
    const roomPanel = $('room-panel');
    const teacherRoomView = $('teacher-room-view');
    if (roomPanel && teacherRoomView) {
      teacherRoomView.appendChild(roomPanel);
    }
    setHidden('teacher-monitoring-view', true);
    setHidden('teacher-room-view', false);
  }

  state.roomChannel = supabaseClient.channel(`gomoku_room_${roomId}`, {
    config: { presence: { key: state.id } },
  });

  state.roomChannel
    .on('presence', { event: 'sync' }, handleRoomPresence)
    .on('broadcast', { event: 'move-played' }, ({ payload }) => {
      applyRemoteMove(payload);
    })
    .on('broadcast', { event: 'game-reset' }, ({ payload }) => {
      state.game = createGameState();
      state.appliedMoveIds.clear();
      setRoomStatus(payload?.message || '새 판이 시작됐습니다.', 'success');
      renderBoard();
      renderRoomInfo();
      publishRoomSummary();
    })
    .on('broadcast', { event: 'request-state' }, ({ payload }) => {
      if (state.ownerId === state.id) {
        state.roomChannel?.send({
          type: 'broadcast',
          event: 'sync-state',
          payload: {
            targetId: payload?.requesterId,
            board: state.game.board,
            turn: state.game.turn,
            status: state.game.status,
            winner: state.game.winner,
            lastMove: state.game.lastMove,
            appliedMoveIds: Array.from(state.appliedMoveIds),
          },
        });
      }
    })
    .on('broadcast', { event: 'sync-state' }, ({ payload }) => {
      if (payload?.targetId === state.id) {
        state.game = createGameState({
          board: payload.board,
          turn: payload.turn,
          status: payload.status,
          winner: payload.winner,
          lastMove: payload.lastMove,
        });
        state.appliedMoveIds = new Set(payload.appliedMoveIds || []);
        renderBoard();
        renderRoomInfo();
      }
    });

  const joined = await new Promise((resolve) => {
    state.roomChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await state.roomChannel.track(buildRoomPresence());
        // Request current game state from active players/owner after a tiny delay
        setTimeout(() => {
          state.roomChannel?.send({
            type: 'broadcast',
            event: 'request-state',
            payload: { requesterId: state.id },
          });
        }, 150);
        resolve(true);
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        resolve(false);
      }
    });
  });

  if (!joined) {
    setStatus('방에 입장하지 못했습니다.', 'error');
    return;
  }

  startRoomHeartbeat();
  renderBoard();
  renderRoomInfo();
  setStatus('오목방에 입장했습니다.', 'success');
}

function buildRoomPresence() {
  return {
    id: state.id,
    nickname: state.mode === 'teacher' ? '교사' : state.nickname,
    role: state.mode === 'teacher' ? 'teacher' : 'student',
    game: 'gomoku',
    roomId: state.roomId,
    owner: state.ownerId === state.id,
    joinedAt: new Date().toISOString(),
  };
}

function handleRoomPresence() {
  const users = flattenPresence(state.roomChannel?.presenceState())
    .filter((user) => user.role === 'student' && user.game === 'gomoku')
    .sort((left, right) => {
      const leftTime = Date.parse(left.joinedAt || '') || 0;
      const rightTime = Date.parse(right.joinedAt || '') || 0;
      return leftTime - rightTime;
    });

  const uniqueByNickname = new Map();
  users.forEach((user) => uniqueByNickname.set(user.nickname, user));
  const unique = [...uniqueByNickname.values()];
  const ownDuplicate = unique.find((user) => user.nickname === state.nickname);
  if (ownDuplicate && ownDuplicate.id !== state.id) {
    setRoomStatus('같은 닉네임의 새 접속이 있어 이 방에서 나갑니다.', 'warn');
    leaveRoom();
    return;
  }

  if (!state.ownerId || !unique.some((user) => user.id === state.ownerId)) {
    state.ownerId = unique[0]?.id || '';
  }

  state.participants = unique.map((user, index) => ({
    ...user,
    seat: index === 0 ? 'black' : index === 1 ? 'white' : 'spectator',
    owner: user.id === state.ownerId,
  }));
  state.mySeat = state.participants.find((user) => user.id === state.id)?.seat || 'spectator';
  renderBoard();
  renderRoomInfo();
  publishRoomSummary();
}

function applyRemoteMove(payload) {
  if (!payload?.moveId || state.appliedMoveIds.has(payload.moveId)) return;
  const next = applyMove(state.game, payload);
  if (!next.ok) return;
  state.appliedMoveIds.add(payload.moveId);
  state.game = next;
  renderBoard();
  renderRoomInfo();
  publishRoomSummary();
}

function handleCellClick(row, col) {
  if (state.mySeat !== 'black' && state.mySeat !== 'white') {
    setRoomStatus('관전자는 착수할 수 없습니다.', 'warn');
    return;
  }
  const color = state.mySeat === 'black' ? COLORS.BLACK : COLORS.WHITE;
  const moveId = `${state.id}-${Date.now()}-${row}-${col}`;
  const next = applyMove(state.game, { row, col, color });
  if (!next.ok) {
    setRoomStatus(reasonToMessage(next.reason), 'warn');
    return;
  }

  state.appliedMoveIds.add(moveId);
  state.game = next;
  state.roomChannel?.send({
    type: 'broadcast',
    event: 'move-played',
    payload: {
      moveId,
      row,
      col,
      color,
      playerId: state.id,
      nickname: state.nickname,
    },
  });
  renderBoard();
  renderRoomInfo();
  publishRoomSummary();
}

function reasonToMessage(reason) {
  const messages = {
    occupied: '이미 돌이 놓인 자리입니다.',
    'wrong-turn': '현재 차례가 아닙니다.',
    finished: '종료된 판입니다. 새 판을 시작하세요.',
    'double-three': '쌍삼은 둘 수 없습니다.',
    'out-of-bounds': '오목판 밖입니다.',
  };
  return messages[reason] || '둘 수 없는 자리입니다.';
}

function renderBoard() {
  const board = $('gomoku-board');
  if (!board) return;
  board.innerHTML = '';

  // Update turn preview classes on the board container
  board.classList.remove('my-turn-black', 'my-turn-white');
  if (state.game.status === 'playing' && state.game.turn === state.mySeat) {
    board.classList.add(`my-turn-${state.mySeat}`);
  }

  state.game.board.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cell';
      button.setAttribute('aria-label', `${rowIndex + 1}행 ${colIndex + 1}열`);
      button.disabled = Boolean(cell) || state.game.status === 'finished';

      // Set boundary line override classes
      if (rowIndex === 0) button.classList.add('top');
      if (rowIndex === state.game.board.length - 1) button.classList.add('bottom');
      if (colIndex === 0) button.classList.add('left');
      if (colIndex === row.length - 1) button.classList.add('right');

      // Set standard 9 star points for 15x15 board
      const isStar = (rowIndex === 3 || rowIndex === 7 || rowIndex === 11) &&
                     (colIndex === 3 || colIndex === 7 || colIndex === 11);
      if (isStar) {
        button.classList.add('star-point');
      }

      if (cell) {
        const stone = document.createElement('span');
        stone.className = `stone ${cell}`;
        button.appendChild(stone);
      }
      button.addEventListener('click', () => handleCellClick(rowIndex, colIndex));
      board.appendChild(button);
    });
  });
}

function renderRoomInfo() {
  $('room-title').textContent = state.roomId ? state.roomTitle : '방에 입장하면 오목판이 표시됩니다.';
  const black = state.participants.find((user) => user.seat === 'black');
  const white = state.participants.find((user) => user.seat === 'white');
  const spectators = state.participants.filter((user) => user.seat === 'spectator');
  $('black-player').textContent = black ? `${black.nickname}${black.owner ? ' · 방장' : ''}` : '비어 있음';
  $('white-player').textContent = white ? `${white.nickname}${white.owner ? ' · 방장' : ''}` : '비어 있음';
  $('spectator-count').textContent = String(spectators.length);
  $('my-seat').textContent = formatRole(state.mySeat);
  $('leave-room-btn').disabled = !state.roomId;
  $('reset-game-btn').disabled = !state.roomId || state.game.status !== 'finished' || !canResetGame();

  if (!state.roomId) {
    setRoomStatus('로비에서 방을 만들거나 입장하세요.');
    return;
  }
  if (state.game.status === 'finished') {
    setRoomStatus(`${formatRole(state.game.winner)} 승리!`, 'success');
    return;
  }
  if (!black || !white) {
    setRoomStatus('상대가 들어오면 대국을 시작할 수 있습니다.', 'warn');
    return;
  }
  setRoomStatus(`${formatRole(state.game.turn)} 차례입니다.`);
}

function canResetGame() {
  return state.mySeat === 'black' || state.mySeat === 'white' || state.ownerId === state.id;
}

function resetGame() {
  if (!canResetGame()) return;
  state.game = createGameState();
  state.appliedMoveIds.clear();
  state.roomChannel?.send({
    type: 'broadcast',
    event: 'game-reset',
    payload: { message: `${state.nickname}님이 새 판을 시작했습니다.` },
  });
  renderBoard();
  renderRoomInfo();
  publishRoomSummary();
}

async function leaveRoom(removeIfOwner = true) {
  stopRoomHeartbeat();
  const shouldRemoveRoom = removeIfOwner
    && state.roomId
    && state.ownerId === state.id
    && state.participants.length <= 1;
  if (state.roomChannel) {
    await supabaseClient.removeChannel(state.roomChannel);
    state.roomChannel = null;
  }
  if (shouldRemoveRoom) {
    broadcastLobby('room-remove', { roomId: state.roomId });
    state.rooms.delete(state.roomId);
  }
  state.roomId = '';
  state.roomTitle = '';
  state.ownerId = '';
  state.participants = [];
  state.mySeat = 'lobby';
  state.game = createGameState();
  state.appliedMoveIds.clear();

  if (state.mode === 'teacher') {
    const roomPanel = $('room-panel');
    const studentContainer = $('student-game-container');
    if (roomPanel && studentContainer) {
      studentContainer.appendChild(roomPanel);
    }
    setHidden('teacher-monitoring-view', false);
    setHidden('teacher-room-view', true);
  }

  renderBoard();
  renderRoomInfo();
  renderRoomList();
}

function startRoomHeartbeat() {
  stopRoomHeartbeat();
  state.roomHeartbeatId = window.setInterval(publishRoomSummary, HEARTBEAT_MS);
  publishRoomSummary();
}

function stopRoomHeartbeat() {
  if (!state.roomHeartbeatId) return;
  window.clearInterval(state.roomHeartbeatId);
  state.roomHeartbeatId = null;
}

function publishRoomSummary() {
  if (!state.roomId || !state.lobbyChannel) return;
  const black = state.participants.find((user) => user.seat === 'black');
  const white = state.participants.find((user) => user.seat === 'white');
  const spectators = state.participants.filter((user) => user.seat === 'spectator');
  const room = {
    roomId: state.roomId,
    title: state.roomTitle,
    ownerId: state.ownerId,
    ownerName: state.participants.find((user) => user.id === state.ownerId)?.nickname || state.nickname,
    blackName: black?.nickname || '',
    whiteName: white?.nickname || '',
    spectatorCount: spectators.length,
    status: state.game.status === 'finished' ? 'finished' : black && white ? 'playing' : 'waiting',
    updatedAt: Date.now(),
  };
  state.rooms.set(state.roomId, room);
  broadcastLobby('room-heartbeat', room);
  renderRoomList();
  renderTeacherMetrics();
}

function renderPermissionState() {
  const teacherLabel = $('teacher-permission-label');
  if (teacherLabel) teacherLabel.textContent = state.teacherAllowed ? '오목 방 만들기 허용 중' : '오목 방 만들기 닫힘';
  const toggle = $('permission-toggle-btn');
  if (toggle) {
    toggle.textContent = state.teacherAllowed ? '허용 끄기' : '허용 켜기';
    toggle.classList.toggle('danger', state.teacherAllowed);
    toggle.classList.toggle('success', !state.teacherAllowed);
  }
  const studentLabel = $('student-permission-label');
  if (studentLabel) studentLabel.textContent = state.teacherAllowed ? '방을 만들 수 있습니다.' : '교사 허가 대기 중';
  const createButton = $('create-room-btn');
  if (createButton) createButton.disabled = !state.nickname || !state.teacherAllowed;
}

function renderTeacherMetrics() {
  $('teacher-student-count').textContent = String(state.lobbyStudents.length);
  $('teacher-room-count').textContent = String(state.rooms.size);
}

function renderRoomList() {
  pruneRooms();
  const rooms = [...state.rooms.values()].sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));

  // 1. Render student room list
  const list = $('room-list');
  if (list) {
    if (!rooms.length) {
      list.innerHTML = '<div class="empty">아직 열린 방이 없습니다.</div>';
    } else {
      list.innerHTML = rooms.map((room) => `
        <button type="button" class="room-item" data-room-id="${escapeHtml(room.roomId)}">
          <span class="room-title-line">
            <span>${escapeHtml(getRoomTitle(room))}</span>
            <span class="badge">${statusLabel(room.status)}</span>
          </span>
          <span class="room-meta">흑 ${escapeHtml(room.blackName || '비어 있음')} · 백 ${escapeHtml(room.whiteName || '비어 있음')} · 관전자 ${room.spectatorCount || 0}명</span>
        </button>
      `).join('');
      list.querySelectorAll('[data-room-id]').forEach((button) => {
        button.addEventListener('click', () => {
          const room = state.rooms.get(button.dataset.roomId || '');
          if (room) joinRoom(room.roomId, getRoomTitle(room), false);
        });
      });
    }
  }

  // 2. Render teacher room list
  const teacherList = $('teacher-room-list');
  if (teacherList) {
    if (!rooms.length) {
      teacherList.innerHTML = '<div class="empty">아직 진행 중인 방이 없습니다.</div>';
    } else {
      teacherList.innerHTML = rooms.map((room) => `
        <button type="button" class="room-item" data-room-id="${escapeHtml(room.roomId)}">
          <span class="room-title-line">
            <span>${escapeHtml(getRoomTitle(room))}</span>
            <span class="badge">${statusLabel(room.status)}</span>
          </span>
          <span class="room-meta">흑 ${escapeHtml(room.blackName || '비어 있음')} · 백 ${escapeHtml(room.whiteName || '비어 있음')} · 관전자 ${room.spectatorCount || 0}명</span>
        </button>
      `).join('');
      teacherList.querySelectorAll('[data-room-id]').forEach((button) => {
        button.addEventListener('click', () => {
          const room = state.rooms.get(button.dataset.roomId || '');
          if (room) joinRoom(room.roomId, getRoomTitle(room), false);
        });
      });
    }
  }
}

function statusLabel(status) {
  if (status === 'playing') return '대국 중';
  if (status === 'finished') return '종료';
  return '대기 중';
}

async function boot() {
  bindEvents();
  renderBoard();
  renderRoomInfo();
  renderRoomList();

  const connectionLabel = $('connection-label');
  if (!isConnected()) {
    connectionLabel.textContent = 'Supabase 연결 실패';
    setStatus('Supabase CDN 또는 설정을 확인하세요.', 'error');
    return;
  }
  connectionLabel.textContent = 'Supabase Realtime 사용';
  setStatus('교사는 로그인을 하고, 학생은 닉네임을 입력하여 오목에 참여하세요.');

  try {
    const { data } = await supabaseClient.auth.getSession();
    const email = data?.session?.user?.email || '';
    if (email && await checkIsTeacherAllowed(email)) {
      state.teacherEmail = email;
      await initLobbyChannel(buildTeacherPresence());
      startTeacherHeartbeat();
      
      setupTeacherDashboard();
      
      $('teacher-email').textContent = email;
      renderPermissionState();
    } else {
      state.mode = 'start';
      showScreen('start-screen');
    }
  } catch (error) {
    console.warn('[Gomoku] Initial teacher session check failed:', error);
    state.mode = 'start';
    showScreen('start-screen');
  }
}

window.addEventListener('DOMContentLoaded', boot);
window.addEventListener('beforeunload', () => {
  stopTeacherHeartbeat();
  stopRoomHeartbeat();
});
