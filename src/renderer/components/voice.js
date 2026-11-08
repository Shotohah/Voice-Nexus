import { USERS } from '../data.js';
import { leaveVoice, getState } from '../store.js';
import {
  joinVoiceChannel,
  leaveVoiceChannel,
  setMicrophoneEnabled,
  setScreenShareEnabled,
  getLocalAudioMediaStreamTrack,
  getRemoteAudioMediaStreamTrack
} from '../livekit.js';

let rafId = null;
let recSeconds = 724; // 12:04 демо-таймер записи — сама запись пока не настоящая
let currentContainer = null;
let currentParticipants = []; // последний снимок участников из LiveKit
let micEnabled = true;
let joinToken = 0; // счётчик на случай быстрого выхода/входа, чтобы не гонять колбэки устаревшего подключения

export function renderVoiceScreen(container, channel) {
  currentContainer = container;
  const myToken = ++joinToken;

  container.innerHTML = `
    <div class="voice-screen">
      <header class="voice-screen__header">
        <div class="voice-screen__title">
          <span class="voice-screen__title-icon" aria-hidden="true">◐</span>
          <span>${escapeHtml(channel.name)}</span>
        </div>
        <div class="voice-screen__header-actions">
          <span class="voice-screen__status" id="voice-status">подключение…</span>
          <button class="chat__header-btn" title="Пригласить" aria-label="Пригласить в канал">👤+</button>
          <button class="chat__header-btn" title="Настройки канала" aria-label="Настройки канала">⚙</button>
        </div>
      </header>
      <div id="voice-banner" class="voice-screen__banner" hidden></div>
      <div class="voice-screen__grid-wrap">
        <div class="voice-grid" id="voice-grid"></div>
      </div>
      <div class="voice-controls-wrap">
        <div class="voice-controls">
          <span class="voice-controls__rec">
            <span class="voice-controls__rec-dot" aria-hidden="true"></span>
            <span id="rec-timer">REC 12:04</span>
          </span>
          <span class="voice-controls__divider" aria-hidden="true"></span>
          <button class="voice-btn" id="voice-btn-mic" title="Микрофон" aria-label="Переключить микрофон" aria-pressed="true">🎤</button>
          <button class="voice-btn" id="voice-btn-deaf" title="Наушники" aria-label="Переключить звук">🎧</button>
          <button class="voice-btn" id="voice-btn-cam" title="Камера" aria-label="Переключить камеру">📷</button>
          <button class="voice-btn" id="voice-btn-share" title="Демонстрация экрана" aria-label="Демонстрация экрана">🖥</button>
          <span class="voice-controls__divider" aria-hidden="true"></span>
          <button class="voice-btn voice-btn--leave" id="voice-btn-leave" aria-label="Выйти из голосового канала">
            <span aria-hidden="true">☎</span><span>Выйти</span>
          </button>
        </div>
      </div>
    </div>
  `;

  wireControls(container);
  startRecTimer(container);

  const username = USERS.me.name;
  const roomName = channel.id;

  joinVoiceChannel(username, roomName, {
    onConnectionStateChanged: (state) => {
      if (myToken !== joinToken || !document.body.contains(container)) return;
      renderConnectionStatus(container, state);
    },
    onParticipantsChanged: (participants) => {
      if (myToken !== joinToken || !document.body.contains(container)) return;
      currentParticipants = participants;
      renderParticipants(container, participants);
    },
    onError: (err) => {
      if (myToken !== joinToken || !document.body.contains(container)) return;
      showBanner(container, err.message);
    }
  });
}

// Вызывается при уходе из голосового экрана (смена канала, выход из звонка,
// закрытие приложения) — обязательно отключается от LiveKit Room, иначе
// микрофон продолжит публиковаться в комнату после ухода с экрана.
export function stopVoiceAnimation() {
  cancelAnimationFrame(rafId);
  rafId = null;
  joinToken++; // инвалидируем колбэки уже закрытого подключения
  currentContainer = null;
  currentParticipants = [];
  leaveVoiceChannel();
}

function renderConnectionStatus(container, state) {
  const statusEl = container.querySelector('#voice-status');
  if (!statusEl) return;
  const labels = {
    connecting: 'подключение…',
    connected: '',
    reconnecting: 'переподключение…',
    disconnected: 'отключено'
  };
  statusEl.textContent = labels[state] ?? '';
  statusEl.hidden = state === 'connected';

  if (state === 'connected') {
    hideBanner(container);
  }
}

function showBanner(container, message) {
  const banner = container.querySelector('#voice-banner');
  if (!banner) return;
  banner.textContent = message;
  banner.hidden = false;
}

function hideBanner(container) {
  const banner = container.querySelector('#voice-banner');
  if (!banner) return;
  banner.hidden = true;
  banner.textContent = '';
}

function renderParticipants(container, participants) {
  const grid = container.querySelector('#voice-grid');
  if (!grid) return;

  // Полная перерисовка — состав участников звонка меняется редко
  // (вход/выход), а не на каждый кадр, так что это не дорого.
  grid.innerHTML = '';
  participants.forEach((p) => grid.appendChild(buildVoiceCard(p)));

  restartAmplitudeLoop(grid, participants);
}

function buildVoiceCard(participant) {
  const user = resolveUser(participant.identity);
  const card = document.createElement('div');
  card.className = `voice-card${participant.speaking ? ' voice-card--speaking' : ''}${
    participant.muted ? ' voice-card--muted' : ''
  }`;
  card.dataset.identity = participant.identity;
  card.dataset.speaking = String(participant.speaking);

  if (participant.screenshare) {
    card.classList.add('voice-card--screenshare');
    card.innerHTML = `
      <div class="voice-card__screen-placeholder">🖥 демонстрация экрана</div>
      <span class="voice-card__screen-label">${escapeHtml(user.name)}</span>
    `;
    return card;
  }

  card.innerHTML = `
    <div class="voice-avatar-wrap">
      <svg class="voice-avatar-wrap__wave" viewBox="0 0 88 88" aria-hidden="true">
        <circle cx="44" cy="44" r="34" />
        <circle cx="44" cy="44" r="34" />
        <circle cx="44" cy="44" r="34" />
      </svg>
      <div class="voice-avatar" style="background:${user.color}">${user.initials}</div>
      <div class="voice-card__mic-badge ${
        participant.muted ? 'voice-card__mic-badge--muted' : 'voice-card__mic-badge--active'
      }">${participant.muted ? '🔇' : '🎤'}</div>
    </div>
    <div class="voice-card__name">${escapeHtml(user.name)}${participant.isLocal ? ' (ты)' : ''}</div>
    <div class="voice-card__status-label${
      participant.speaking ? ' voice-card__status-label--speaking' : ''
    }">${participant.muted ? 'микрофон выключен' : participant.speaking ? 'говорит' : 'слушает'}</div>
  `;

  return card;
}

// identity участника — это username, который ввели при входе (см.
// setCurrentUsername в data.js и joinVoiceChannel в livekit.js). Если это
// наш собственный логин — берём готовую карточку USERS.me; для реальных
// собеседников извне (не из демо-списка USERS) строим карточку на лету.
function resolveUser(identity) {
  if (identity === USERS.me.name) return USERS.me;
  const known = Object.values(USERS).find((u) => u.name === identity);
  if (known) return known;
  return {
    name: identity,
    initials: identity.slice(0, 2).toUpperCase(),
    color: 'var(--color-accent)'
  };
}

// ----------------------------------------------------------------------------
// Осциллограмма по реальной громкости голоса.
//
// Для каждого говорящего участника читаем его настоящий MediaStreamTrack
// (свой микрофон — getLocalAudioMediaStreamTrack, чужой — через подписанный
// LiveKit-трек) и подключаем Web Audio AnalyserNode, который даёт текущий
// уровень громкости кадр за кадром. Больше никакого Math.sin/Math.random —
// амплитуда колец напрямую зависит от того, насколько громко говорит человек.
// ----------------------------------------------------------------------------

let audioContext = null;
const analysers = new Map(); // identity -> { analyser, dataArray, sourceTrackId }

function getAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function ensureAnalyser(identity, mediaStreamTrack) {
  if (!mediaStreamTrack) return null;

  const existing = analysers.get(identity);
  if (existing && existing.sourceTrackId === mediaStreamTrack.id) {
    return existing;
  }

  // Трек сменился (переподключение) — пересоздаём граф Web Audio
  if (existing) {
    try {
      existing.sourceNode.disconnect();
    } catch (e) {
      /* уже отключено — не критично */
    }
  }

  try {
    const ctx = getAudioContext();
    const stream = new MediaStream([mediaStreamTrack]);
    const sourceNode = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    sourceNode.connect(analyser);

    const entry = {
      analyser,
      sourceNode,
      dataArray: new Uint8Array(analyser.frequencyBinCount),
      sourceTrackId: mediaStreamTrack.id
    };
    analysers.set(identity, entry);
    return entry;
  } catch (err) {
    // AnalyserNode недоступен (например, трек ещё не готов) — не фатально,
    // кольца в этом кадре просто не обновятся.
    return null;
  }
}

// Текущая громкость говорящего участника (0..1), либо null, если трек
// недоступен (демо-заглушка для случаев, когда реальный уровень взять
// неоткуда — лучше тихая анимация, чем ошибка).
function readVolume(identity, participant) {
  const track = participant.isLocal
    ? getLocalAudioMediaStreamTrack()
    : getRemoteAudioMediaStreamTrack(identity);

  const entry = ensureAnalyser(identity, track);
  if (!entry) return null;

  entry.analyser.getByteTimeDomainData(entry.dataArray);
  let sumSquares = 0;
  for (let i = 0; i < entry.dataArray.length; i++) {
    const normalized = (entry.dataArray[i] - 128) / 128;
    sumSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumSquares / entry.dataArray.length);
  return Math.min(1, rms * 4); // лёгкое усиление — RMS речи обычно небольшой
}

function restartAmplitudeLoop(grid, participants) {
  cancelAnimationFrame(rafId);

  const tick = () => {
    const speakingCards = grid.querySelectorAll('.voice-card--speaking');
    speakingCards.forEach((card) => {
      const identity = card.dataset.identity;
      const participant = participants.find((p) => p.identity === identity);
      if (!participant) return;

      const volume = readVolume(identity, participant);
      const circles = card.querySelectorAll('.voice-avatar-wrap__wave circle');
      circles.forEach((circle, i) => {
        const base = 34 + i * 3;
        const boost = volume == null ? 0 : volume * 14;
        circle.setAttribute('r', String(base + boost));
      });
    });
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
}

function startRecTimer(container) {
  const timerEl = container.querySelector('#rec-timer');
  if (!timerEl) return;
  const interval = setInterval(() => {
    if (!document.body.contains(timerEl)) {
      clearInterval(interval);
      return;
    }
    recSeconds += 1;
    const mm = String(Math.floor(recSeconds / 60)).padStart(2, '0');
    const ss = String(recSeconds % 60).padStart(2, '0');
    timerEl.textContent = `REC ${mm}:${ss}`;
  }, 1000);
}

function wireControls(container) {
  const micBtn = container.querySelector('#voice-btn-mic');
  const deafBtn = container.querySelector('#voice-btn-deaf');
  const camBtn = container.querySelector('#voice-btn-cam');
  const shareBtn = container.querySelector('#voice-btn-share');
  const leaveBtn = container.querySelector('#voice-btn-leave');

  micBtn.addEventListener('click', () => {
    micEnabled = !micEnabled;
    micBtn.setAttribute('aria-pressed', String(micEnabled));
    micBtn.classList.toggle('voice-btn--off', !micEnabled);
    setMicrophoneEnabled(micEnabled).catch((err) => {
      showBanner(container, 'Не удалось переключить микрофон: ' + err.message);
    });
  });

  shareBtn.addEventListener('click', () => {
    const isActive = shareBtn.getAttribute('aria-pressed') !== 'false';
    const next = !isActive;
    shareBtn.setAttribute('aria-pressed', String(next));
    shareBtn.classList.toggle('voice-btn--off', isActive);
    setScreenShareEnabled(next).catch((err) => {
      shareBtn.setAttribute('aria-pressed', String(isActive));
      shareBtn.classList.toggle('voice-btn--off', !isActive);
      showBanner(container, 'Не удалось включить демонстрацию экрана: ' + err.message);
    });
  });

  // Наушники и камера пока не влияют на реальное соединение — это
  // UI-состояние, которое ещё не подключено к LiveKit (камера как
  // публикуемый видео-трек — отдельная задача, наушники — локальный
  // плейбек, которым LiveKit управляет не через API комнаты).
  [deafBtn, camBtn].forEach((btn) => {
    btn.addEventListener('click', () => {
      const isActive = btn.getAttribute('aria-pressed') !== 'false';
      btn.setAttribute('aria-pressed', String(!isActive));
      btn.classList.toggle('voice-btn--off', isActive);
    });
  });

  leaveBtn.addEventListener('click', () => {
    stopVoiceAnimation();
    leaveVoice();
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
