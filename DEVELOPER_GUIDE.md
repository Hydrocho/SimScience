# Classroom VR Lab 개발자 연동 가이드 (Developer Guide)

이 문서는 명인중학교 VR 가상 과학 실험실 프로젝트에 새로운 3D/2D 인터랙티브 시뮬레이션 및 게임을 추가하고자 하는 개발자를 위한 온보딩 표준 매뉴얼입니다.

---

## 1. 프로젝트 폴더 구조 및 규칙

* **`/index.html`**: 모든 과학 게임을 연결해 주는 공통 로비 포털.
* **`/car_simul.html`**: 3D 자동차 제동 거리 시뮬레이터.
* **`/eye_focus.html`**: 3D 눈 초점 조절 작용 게임.
* **`/eye.html`**: 눈 구조 스피드 퀴즈 레이싱.
* **`/js/network.js`**: 다자간 동기화를 위한 공통 멀티플레이어 통신 모듈.
* **기타 규칙**:
  - 외부 오디오 자원(`.mp3`, `.wav`)은 로딩 지연 및 유실 우려가 크므로 **Web Audio API 신시사이징** 기법을 통한 사운드 생성을 준수합니다.
  - 외부 이미지 자원은 가급적 지양하고, 수학적 그리드 또는 Three.js Geometry 빌드를 활용하여 경량화를 도모합니다.

---

## 2. 신규 콘텐츠 추가 절차 (Adding a New Game)

새로운 과학 가상 실험(예: 프리즘 빛 굴절 시뮬레이션 `prism.html`)을 추가하는 표준 단계는 다음과 같습니다.

### 단계 1: HTML 파일 생성 및 기본 스타일 적용 (밝은 톤 테마 기준)
- 모든 프로젝트는 기본적으로 다크 모드가 아닌 **화사하고 눈이 편안한 밝은 톤(Light Mode)**으로 설계해야 합니다.
- 공통 폰트(Outfit, Noto Sans KR) 및 FontAwesome CDN을 포함합니다.
- 공통 밝은 네온 글래스모피즘 테마를 적용하기 위해 아래 변수를 CSS에 이식합니다.

```css
:root {
  --primary: #4f46e5;
  --primary-hover: #4338ca;
  --primary-light: rgba(79, 70, 229, 0.08);
  --neon-blue: #0891b2;
  --neon-pink: #db2777;
  --bg-color: #f8fafc;       /* 밝은 회백색 톤 */
  --card-bg: rgba(255, 255, 255, 0.8);
  --card-border: rgba(241, 245, 249, 0.8);
  --text-main: #0f172a;       /* 어두운 차콜색 텍스트 */
  --text-muted: #475569;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02);
}
body {
  background: radial-gradient(circle at center, #f8fafc 0%, #f1f5f9 100%);
  color: var(--text-main);
}
```

### 단계 2: 포털 메인 홈(`index.html`)에 링크 카드 추가
- `index.html` 내의 `<main class="portal-grid">` 컨테이너 내부에 새로운 카드를 추가합니다.
- 카드 마우스 호버 시 입체적 반응을 위해 상응하는 클래스(예: `.portal-card.prism-glow`)를 정의하여 줍니다.

```html
<a href="prism.html" class="portal-card prism-glow">
  <div>
    <div class="icon-badge prism-icon">
      <i class="fa-solid fa-triangle-exclamation"></i>
    </div>
    <h2 class="card-title">
      프리즘 빛 분산 실험
      <i class="fa-solid fa-chevron-right arrow-icon"></i>
    </h2>
    <p class="card-desc">
      백색광이 유리 프리즘을 통과할 때 파장별 굴절률 차이로 인해 무지개 빛깔로 분산되는 광학 현상을 관찰합니다.
    </p>
  </div>
  <div class="tag-list">
    <span class="tag-item">광학 (파동)</span>
    <span class="tag-item">빛의 굴절과 분산</span>
  </div>
</a>
```

---

## 3. 공통 멀티플레이어 모듈 (`js/network.js`) 활용 가이드

새로운 콘텐츠에 학생-교사 간 실시간 설정 제어 및 랭킹 시스템을 넣으려면 `ClassroomNetwork`를 활용하십시오. 이 모듈은 데이터베이스 테이블 스키마 추가 없이 **인메모리 브로드캐스트**로만 작동하므로 매우 가볍고 빠릅니다.

### A. 모듈 임포트 및 초기화
HTML 맨 아래의 자바스크립트를 모듈 타입(`<script type="module">`)으로 설정하고 초기화합니다.

```javascript
import { ClassroomNetwork } from './js/network.js';

const SUPABASE_URL = "https://vdyvpsteofvhbvvrilxe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
const network = new ClassroomNetwork(SUPABASE_URL, SUPABASE_ANON_KEY);
```

### B. 학생 참가 (Student Flow)
```javascript
// 대기실 접속 및 이벤트 핸들러 바인딩
async function joinRoom(pin, nickname) {
  const success = await network.joinSession(pin, nickname, 'student');
  if (success) {
    // 1. 교사가 게임 설정(예: 프리즘 각도, 광선 세기)을 바꿨을 때 수신
    network.on('onReceiveSettings', (settings) => {
      currentAngle = settings.prismAngle;
      updateUI();
    });

    // 2. 교사가 일괄 시작 신호를 전송했을 때 게임 시작
    network.on('onGameStart', () => {
      startSimulLoop();
    });

    // 3. 교사가 최종 랭킹 테이블을 뿌렸을 때 결과 반영
    network.on('onRankingUpdate', (payload) => {
      showMyRank(payload.rankings);
    });
  }
}

// 게임 결과 보고 (촬영/실험 완료 시)
function reportGameScore(scoreValue, errorValue) {
  network.sendResult(scoreValue, {
    errorOffset: errorValue,
    prismAngle: currentAngle
  });
}
```

### C. 교사 제어 패널 (Teacher Flow)
```javascript
async function openTeacherRoom() {
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  await network.joinSession(pin, 'Teacher', 'teacher');
  
  // 1. 접속한 학생 목록 동기화
  network.on('onStudentSync', (students) => {
    renderStudentListUI(students);
  });

  // 2. 학생이 각자 완료 보고서를 보냈을 때 취합
  const results = [];
  network.on('onResultReported', (payload) => {
    results.push(payload);
    results.sort((a, b) => a.errorOffset - b.errorOffset); // 최소 오차 순 정렬
    
    renderLeaderboardUI(results); // 실시간 화면 갱신
    network.broadcastRankings({ rankings: results }); // 학생들에게 랭킹 브로드캐스트
  });
}

// 실시간 조절 중인 설정을 학생들에게 방송
function onSliderChanged() {
  network.broadcastSettings({
    prismAngle: parseFloat(document.getElementById('prism-slider').value)
  });
}

// 실험 일괄 시작 신호 전송
function triggerLaunch() {
  network.broadcastStart();
}
```

---

## 4. Web Audio API 사운드 신시사이저 설계 수칙

리소스 로딩 속도 최적화를 위해 브라우저 가청 주파수를 조합해 사운드를 동적 생성합니다.

```javascript
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSynthClick(freq = 600, duration = 0.08) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}
```

위 규칙을 준수하여 가상 실험실에 새로운 즐거움을 덧입혀 주시기 바랍니다!
