// --- Classroom VR Lab 공통 멀티플레이어 통신 모듈 (js/network.js) ---

export class ClassroomNetwork {
  /**
   * @param {string} supabaseUrl Supabase project URL
   * @param {string} supabaseAnonKey Supabase anon public API key
   */
  constructor(supabaseUrl, supabaseAnonKey) {
    this.url = supabaseUrl;
    this.key = supabaseAnonKey;
    this.client = null;
    this.channel = null;
    this.pin = null;
    this.role = null; // 'teacher' | 'student'
    this.id = null; // Unique ID (e.g. UUID or random string)
    this.nickname = null;
    
    // Callback event handlers
    this.callbacks = {
      onStudentSync: () => {},     // Occurs when the student list changes (presence sync)
      onReceiveSettings: () => {}, // Occurs when student receives settings from teacher
      onGameStart: () => {},       // Occurs when student receives start trigger from teacher
      onForceSubmit: () => {},     // Occurs when unfinished students must submit their current state
      onRoundReset: () => {},      // Occurs when students should return to the waiting room
      onResultReported: () => {},  // Occurs when teacher receives result from student
      onResultAcknowledged: () => {}, // Occurs when teacher confirms receipt of a student result
      onRankingUpdate: () => {},   // Occurs when student receives leaderboard from teacher
      onKick: () => {},            // Occurs if kicked (e.g. duplicate nickname)
      onTeacherStateSync: () => {}, // Occurs when teacher's presence state is synced/updated
    };

    // Initialize client
    if (typeof supabase !== 'undefined') {
      this.client = supabase.createClient(this.url, this.key);
    } else {
      console.error("[Network] Supabase library is not loaded. Please include the Supabase CDN script in your HTML.");
    }
  }

  /**
   * Check if Supabase client is successfully initialized
   */
  isConnected() {
    return this.client !== null;
  }

  /**
   * Join a classroom session room using PIN and user credentials
   * @param {string} pin 6-digit session pin
   * @param {string} nickname Nickname of the user
   * @param {string} role 'teacher' | 'student'
   * @param {object} extraData Optional initial metadata (e.g. ready state)
   */
  async joinSession(pin, nickname, role, extraData = {}) {
    if (!this.client) {
      console.error("[Network] Cannot join session: Supabase client not initialized.");
      return false;
    }

    this.pin = pin;
    this.nickname = nickname;
    this.role = role;
    
    if (role === 'teacher') {
      this.id = 'teacher';
    } else {
      const sessionKey = `classroom_session_${pin}`;
      let studentId = null;
      try {
        const saved = sessionStorage.getItem(sessionKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.nickname === nickname) {
            studentId = parsed.id;
          }
        }
      } catch (e) {
        console.warn("[Network] sessionStorage read failed:", e);
      }

      if (!studentId) {
        studentId = 'std_' + Math.random().toString(36).substring(2, 11);
        try {
          sessionStorage.setItem(sessionKey, JSON.stringify({ id: studentId, nickname }));
        } catch (e) {
          console.warn("[Network] sessionStorage write failed:", e);
        }
      }
      this.id = studentId;
    }

    const channelName = `classroom_room_${pin}`;
    this.channel = this.client.channel(channelName, {
      config: { presence: { key: pin } }
    });

    // 1. Setup Presence Sync Listener (Student List monitoring)
    this.channel.on('presence', { event: 'sync' }, () => {
      const state = this.channel.presenceState();
      const rawUsers = [];
      Object.keys(state).forEach(key => {
        state[key].forEach(u => {
          rawUsers.push(u);
        });
      });

      console.log("[Debug Network] Presence sync event. Users in room:", rawUsers);

      // Filter and format students
      const rawStudents = rawUsers.filter(u => u.role === 'student');
      
      // Sort chronologically by joinedAt so we preserve the original order of connection
      rawStudents.sort((a, b) => {
        const timeA = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
        const timeB = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
        return timeA - timeB;
      });

      // Check for duplicate nicknames if we are the teacher
      if (this.role === 'teacher') {
        const nicknameToId = new Map();
        rawStudents.forEach(student => {
          if (nicknameToId.has(student.nickname)) {
            const existingId = nicknameToId.get(student.nickname);
            if (existingId !== student.id) {
              // Different ID, same nickname -> Kick the OLD duplicate student session
              this.sendBroadcast('kick-student', {
                targetId: existingId,
                reason: 'duplicate_nickname'
              });
              // Keep the newer session ID
              nicknameToId.set(student.nickname, student.id);
            }
          } else {
            nicknameToId.set(student.nickname, student.id);
          }
        });
      }

      // Deduplicate student list by nickname (latest socket connection overwrites previous)
      const uniqueStudentsMap = new Map();
      rawStudents.forEach(student => {
        uniqueStudentsMap.set(student.nickname, student);
      });
      const uniqueStudents = Array.from(uniqueStudentsMap.values());

      this.callbacks.onStudentSync(uniqueStudents);

      if (this.role === 'student') {
        const teacher = rawUsers.find(u => u.role === 'teacher');
        this.callbacks.onTeacherStateSync(teacher || null);
      }
    });

    // 2. Setup Broadcast Listeners
    this.channel
      .on('broadcast', { event: 'settings-change' }, ({ payload }) => {
        console.log("[Debug Network] Received settings-change. payload:", payload);
        if (this.role === 'student') {
          this.callbacks.onReceiveSettings(payload);
        }
      })
      .on('broadcast', { event: 'start-game' }, ({ payload }) => {
        console.log("[Debug Network] Received start-game. payload:", payload);
        if (this.role === 'student') {
          this.callbacks.onGameStart(payload);
        }
      })
      .on('broadcast', { event: 'force-submit' }, () => {
        console.log("[Debug Network] Received force-submit signal");
        if (this.role === 'student') {
          this.callbacks.onForceSubmit();
        }
      })
      .on('broadcast', { event: 'round-reset' }, ({ payload }) => {
        console.log("[Debug Network] Received round-reset. payload:", payload);
        if (this.role === 'student') {
          this.callbacks.onRoundReset(payload || {});
        }
      })
      .on('broadcast', { event: 'report-result' }, ({ payload }) => {
        console.log("[Debug Network] Received report-result. payload:", payload);
        if (this.role === 'teacher') {
          this.callbacks.onResultReported(payload);
        }
      })
      .on('broadcast', { event: 'result-ack' }, ({ payload }) => {
        console.log("[Debug Network] Received result-ack. payload:", payload);
        if (this.role === 'student' && payload.studentId === this.id) {
          this.callbacks.onResultAcknowledged(payload);
        }
      })
      .on('broadcast', { event: 'ranking-update' }, ({ payload }) => {
        console.log("[Debug Network] Received ranking-update. payload:", payload);
        if (this.role === 'student') {
          this.callbacks.onRankingUpdate(payload);
        }
      })
      .on('broadcast', { event: 'kick-student' }, ({ payload }) => {
        console.log("[Debug Network] Received kick-student. payload:", payload);
        if (this.role === 'student' && payload.targetId === this.id) {
          this.callbacks.onKick(payload.reason);
          this.disconnect();
        }
      });

    // 3. Subscribe and Track presence
    return new Promise((resolve) => {
      this.channel.subscribe(async (status) => {
        console.log(`[Debug Network] Channel subscription status change: "${status}" for channel: ${channelName}`);
        if (status === 'SUBSCRIBED') {
          console.log(`[Network] Subscribed to Supabase channel: ${channelName}`);
          
          // Track presence
          await this.channel.track({
            id: this.id,
            nickname: this.nickname,
            role: this.role,
            joinedAt: new Date().toISOString(),
            ...extraData
          });
          
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }

  /**
   * Broadcast over WebSocket when subscribed, or explicitly use REST while reconnecting.
   * Supabase is deprecating the implicit send() REST fallback.
   */
  sendBroadcast(event, payload = {}) {
    if (!this.channel) {
      console.warn(`[Debug Network] sendBroadcast failed: no channel for event "${event}"`);
      return Promise.resolve('error');
    }
    const message = {
      type: 'broadcast',
      event,
      payload
    };

    console.log(`[Debug Network] sendBroadcast. Event: "${event}", Payload:`, payload, "Channel state:", this.channel.state);

    if (this.channel.state !== 'joined' && typeof this.channel.httpSend === 'function') {
      console.log(`[Debug Network] Channel state is "${this.channel.state}" (not 'joined'). Invoking httpSend for event "${event}"`);
      return this.channel.httpSend(event, payload);
    }
    const res = this.channel.send(message);
    console.log(`[Debug Network] Channel.send returned:`, res);
    return res;
  }

  /**
   * [Teacher] Broadcast settings payload (e.g. target, countdown)
   * @param {object} settings 
   */
  broadcastSettings(settings) {
    if (this.role !== 'teacher' || !this.channel) return;
    this.sendBroadcast('settings-change', settings);
  }

  /**
   * [Teacher] Broadcast start game command
   */
  broadcastStart(payload = {}) {
    if (this.role !== 'teacher' || !this.channel) return;
    this.sendBroadcast('start-game', payload);
  }

  /**
   * [Teacher] Request an immediate result from unfinished students
   */
  broadcastForceSubmit() {
    if (this.role !== 'teacher' || !this.channel) return;
    this.sendBroadcast('force-submit');
  }

  /**
   * [Teacher] Return student screens to the waiting room after a round
   */
  broadcastRoundReset(payload = {}) {
    if (this.role !== 'teacher' || !this.channel) return;
    this.sendBroadcast('round-reset', payload);
  }

  /**
   * [Teacher] Broadcast sorted rankings back to students
   * @param {object} rankings Payload containing sorted ranking list
   */
  broadcastRankings(rankings) {
    if (this.role !== 'teacher' || !this.channel) return;
    this.sendBroadcast('ranking-update', rankings);
  }

  /**
   * [Student] Broadcast score/result to teacher
   * @param {number} score Earned score points
   * @param {object} resultDetails Object containing errorOffset, targetDist, focusDist, etc.
   */
  sendResult(score, resultDetails) {
    if (this.role !== 'student' || !this.channel) return;
    this.sendBroadcast('report-result', {
      studentId: this.id,
      nickname: this.nickname,
      score: score,
      ...resultDetails
    });
  }

  /**
   * [Teacher] Confirm receipt of one student's result
   */
  sendResultAcknowledgement(studentId, roundId) {
    if (this.role !== 'teacher' || !this.channel) return;
    this.sendBroadcast('result-ack', { studentId, roundId });
  }

  /**
   * [Teacher] Remove one student from the session
   */
  sendKickStudent(studentId, reason = 'kicked_by_teacher') {
    if (this.role !== 'teacher' || !this.channel) return;
    this.sendBroadcast('kick-student', { targetId: studentId, reason });
  }

  /**
   * Update tracked presence metadata (e.g. ready status)
   * @param {object} extraData 
   */
  async updatePresenceState(extraData = {}) {
    if (!this.channel) return;
    await this.channel.track({
      id: this.id,
      nickname: this.nickname,
      role: this.role,
      ...extraData
    });
  }

  /**
   * Unsubscribe and leave the channel
   */
  disconnect() {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
      console.log(`[Network] Disconnected from channel room PIN: ${this.pin}`);
    }
    this.pin = null;
    this.role = null;
    this.id = null;
    this.nickname = null;
  }

  /**
   * Event listener registration
   */
  on(event, callback) {
    if (this.callbacks[event] !== undefined) {
      this.callbacks[event] = callback;
    } else {
      console.warn(`[Network] Event "${event}" is not supported.`);
    }
  }
}
