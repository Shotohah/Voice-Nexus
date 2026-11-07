import { USERS } from '../data.js';
import { leaveVoice } from '../store.js';

// Демо-состав голосового канала с ролями для вайрфрейма "голосовой экран":
// кто-то говорит, кто-то замьючен, кто-то шарит экран.
const VOICE_PARTICIPANTS = [
  { userId: 'anya', speaking: true, muted: false, screenshare: false },
  { userId: 'ira', speaking: false, muted: false, screenshare: false },
  { userId: 'max', speaking: false, muted: false, screenshare: true }
];

let rafId = null;
let recSeconds = 724; // 12:04 демо-таймер записи

export function renderVoiceScreen(container, channelName) {
  container.innerHTML = `
    <div class="voice-screen">
      <header class="voice-screen__header">
        <div class="voice-screen__title">
          <span class="voice-screen__title-icon" aria-hidden="true">◐</span>
          <span>${escapeHtml(channelName)}</span>
        </div>
        <div class="voice-screen__header-actions">
          <button class="chat__header-btn" title="Пригласить" aria-label="Пригласить в канал">👤+</button>
          <button class="chat__header-btn" title="Настройки канала" aria-label="Настройки канала">⚙</button>
        </div>
      </header>
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

  const grid = container.querySelector('#voice-grid');
  VOICE_PARTICIPANTS.forEach((p) => grid.appendChild(buildVoiceCard(p)));

  wireControls(container);
  startAmplitudeLoop(grid);
  startRecTimer(container);
}

function buildVoiceCard(participant) {
  const user = USERS[participant.userId];
  const card = document.createElement('div');
  card.className = `voice-card${participant.speaking ? ' voice-card--speaking' : ''}${
    participant.muted ? ' voice-card--muted' : ''
  }`;
  card.dataset.userId = participant.userId;
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
    <div class="voice-card__name">${escapeHtml(user.name)}</div>
    <div class="voice-card__status-label${
      participant.speaking ? ' voice-card__status-label--speaking' : ''
    }">${participant.muted ? 'микрофон выключен' : participant.speaking ? 'говорит' : 'слушает'}</div>
  `;

  return card;
}

// Живая осциллограмма: амплитуда трёх колец модулируется случайным шумом,
// имитируя реальный уровень громкости микрофона, а не зацикленную CSS-анимацию.
function startAmplitudeLoop(grid) {
  cancelAnimationFrame(rafId);
  let t = 0;

  const tick = () => {
    t += 0.06;
    const speakingCards = grid.querySelectorAll('.voice-card--speaking');
    speakingCards.forEach((card) => {
      const circles = card.querySelectorAll('.voice-avatar-wrap__wave circle');
      circles.forEach((circle, i) => {
        const noise = Math.sin(t * 3 + i * 1.3) * 0.5 + Math.random() * 0.3;
        const amplitude = 34 + noise * 6 + i * 3;
        circle.setAttribute('r', String(Math.max(30, amplitude)));
      });
    });
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
}

export function stopVoiceAnimation() {
  cancelAnimationFrame(rafId);
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

  [micBtn, deafBtn, camBtn, shareBtn].forEach((btn) => {
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
