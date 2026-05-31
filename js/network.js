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
      onResultReported: () => {},  // Occurs when teacher receives result from student
      onRankingUpdate: () => {},   // Occurs when student receives leaderboard from teacher
      onKick: () => {},            // Occurs if kicked (e.g. duplicate nickname)
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
    this.id = role === 'teacher' ? 'teacher' : 'std_' + Math.random().toString(36).substring(2, 11);

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

      // Filter and format students
      const students = rawUsers.filter(u => u.role === 'student');
      
      // Check for duplicate nicknames if we are the teacher
      if (this.role === 'teacher') {
        const usedNames = new Set();
        students.forEach(student => {
          if (usedNames.has(student.nickname)) {
            // Kick duplicate student via broadcast
            this.channel.send({
              type: 'broadcast',
              event: 'kick-student',
              payload: { targetId: student.id, reason: 'duplicate_nickname' }
            });
          } else {
            usedNames.add(student.nickname);
          }
        });
      }

      this.callbacks.onStudentSync(students);
    });

    // 2. Setup Broadcast Listeners
    this.channel
      .on('broadcast', { event: 'settings-change' }, ({ payload }) => {
        if (this.role === 'student') {
          this.callbacks.onReceiveSettings(payload);
        }
      })
      .on('broadcast', { event: 'start-game' }, () => {
        if (this.role === 'student') {
          this.callbacks.onGameStart();
        }
      })
      .on('broadcast', { event: 'report-result' }, ({ payload }) => {
        if (this.role === 'teacher') {
          this.callbacks.onResultReported(payload);
        }
      })
      .on('broadcast', { event: 'ranking-update' }, ({ payload }) => {
        if (this.role === 'student') {
          this.callbacks.onRankingUpdate(payload);
        }
      })
      .on('broadcast', { event: 'kick-student' }, ({ payload }) => {
        if (this.role === 'student' && payload.targetId === this.id) {
          this.callbacks.onKick(payload.reason);
          this.disconnect();
        }
      });

    // 3. Subscribe and Track presence
    return new Promise((resolve) => {
      this.channel.subscribe(async (status) => {
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
   * [Teacher] Broadcast settings payload (e.g. target, countdown)
   * @param {object} settings 
   */
  broadcastSettings(settings) {
    if (this.role !== 'teacher' || !this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'settings-change',
      payload: settings
    });
  }

  /**
   * [Teacher] Broadcast start game command
   */
  broadcastStart() {
    if (this.role !== 'teacher' || !this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'start-game',
      payload: {}
    });
  }

  /**
   * [Teacher] Broadcast sorted rankings back to students
   * @param {object} rankings Payload containing sorted ranking list
   */
  broadcastRankings(rankings) {
    if (this.role !== 'teacher' || !this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'ranking-update',
      payload: rankings
    });
  }

  /**
   * [Student] Broadcast score/result to teacher
   * @param {number} score Earned score points
   * @param {object} resultDetails Object containing errorOffset, targetDist, focusDist, etc.
   */
  sendResult(score, resultDetails) {
    if (this.role !== 'student' || !this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'report-result',
      payload: {
        studentId: this.id,
        nickname: this.nickname,
        score: score,
        ...resultDetails
      }
    });
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
