import { USERS } from '../data.js';
import { leaveVoice, getState } from '../store.js';
import {
  joinVoiceChannel,
  leaveVoiceChannel,
  clearHandlers,
  setMicrophoneEnabled,
  setScreenShareEnabled,
  getLocalAudioMediaStreamTrack,
  getRemoteAudioMediaStreamTrack
} from '../livekit.js';

// ----------------------------------------------------------------------------
// Жизненный цикл: показ голосового ЭКРАНА и само звонковое СОЕДИНЕНИЕ — это
// две разные вещи, которые могут жить независимо (как в Discord — ушёл
// смотреть другой сервер, а разговор идёт дальше в фоне). renderVoiceScreen
// строит DOM и подписывается на события текущего звонка; detachVoiceScreen
// отписывается от DOM при уходе с экрана, но звонок НЕ разрывает;
// endVoiceCall — настоящий выход из звонка (кнопка "Выйти").
// ----------------------------------------------------------------------------

let rafId = null;

export function renderVoiceScreen(container, channel) {
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

  const username = USERS.me.name;
  const roomName = channel.id;

  // joinVoiceChannel сам решает: если мы уже в этой же комнате (вернулись
  // на экран звонка, который шёл в фоне) — не переподключается по сети,
  // просто перепривязывает эти handlers и сразу отдаёт текущее состояние.
  joinVoiceChannel(username, roomName, {
    onConnectionStateChanged: (state) => {
      if (!document.body.contains(container)) return;
      renderConnectionStatus(container, state);
    },
    onParticipantsChanged: (participants) => {
      if (!document.body.contains(container)) return;
      renderParticipants(container, participants);
      syncMicButton(container, participants);
    },
    onError: (err) => {
      if (!document.body.contains(container)) return;
      showBanner(container, err.message);
    },
    onRoomDisconnected: () => {
      // Сервер/сеть разорвали звонок сами (не наш явный "Выйти") — стор
      // должен узнать об этом, чтобы убрать плашку активного звонка и
      // саму отметку "мы в голосовом канале", иначе она зависнет навсегда.
      leaveVoice();
    }
  });
}

// Уход с голосового ЭКРАНА (сменили канал/сервер на что-то другое, пока
// показывался этот экран) — звонок сам по себе НЕ разрывается, просто
// прекращаем перерисовывать DOM, которого уже нет на странице.
export function detachVoiceScreen() {
  cancelAnimationFrame(rafId);
  rafId = null;
  clearHandlers();
}

// Настоящий выход из звонка — кнопка "Выйти" на голосовом экране. В отличие
// от detachVoiceScreen, здесь LiveKit-соединение закрывается по-настоящему:
// комната покидается, публикация микрофона прекращается.
export function endVoiceCall() {
  cancelAnimationFrame(rafId);
  rafId = null;
  leaveVoiceChannel();
}

// Кнопка мьюта отражает РЕАЛЬНОЕ состояние локального трека (пришедшее от
// LiveKit через onParticipantsChanged) вместо отдельной локальной
// переменной — иначе при возврате на экран звонка, идущего в фоне, кнопка
// могла бы показывать "микрофон включён", пока он на самом деле выключен
// (состояние, выставленное до ухода с экрана, не пережило бы пересборку DOM).
function syncMicButton(container, participants) {
  const micBtn = container.querySelector('#voice-btn-mic');
  if (!micBtn) return;
  const local = participants.find((p) => p.isLocal);
  if (!local) return;
  const enabled = !local.muted;
  micBtn.setAttribute('aria-pressed', String(enabled));
  micBtn.classList.toggle('voice-btn--off', !enabled);
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
// собеседников извне строим карточку на лету из их identity.
function resolveUser(identity) {
  if (identity === USERS.me.name) return USERS.me;
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
// недоступен (лучше тихая анимация, чем ошибка).
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

function wireControls(container) {
  const micBtn = container.querySelector('#voice-btn-mic');
  const deafBtn = container.querySelector('#voice-btn-deaf');
  const camBtn = container.querySelector('#voice-btn-cam');
  const shareBtn = container.querySelector('#voice-btn-share');
  const leaveBtn = container.querySelector('#voice-btn-leave');

  micBtn.addEventListener('click', () => {
    // Оптимистичный отклик по клику — реальное состояние всё равно придёт
    // следом через onParticipantsChanged (syncMicButton) и перепишет это,
    // если LiveKit в итоге решил иначе (см. комментарий у syncMicButton).
    const wasEnabled = micBtn.getAttribute('aria-pressed') !== 'false';
    const nextEnabled = !wasEnabled;
    micBtn.setAttribute('aria-pressed', String(nextEnabled));
    micBtn.classList.toggle('voice-btn--off', !nextEnabled);
    setMicrophoneEnabled(nextEnabled).catch((err) => {
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
    endVoiceCall();
    leaveVoice();
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
