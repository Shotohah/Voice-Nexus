import { USERS } from '../data.js';
import {
  getActiveServer,
  getActiveVoiceCallInfo,
  getState,
  selectChannel,
  returnToActiveVoiceChannel,
  leaveVoice
} from '../store.js';
import { endVoiceCall } from './voice.js';

const CHANNEL_ICONS = { text: '○', voice: '◐' };

export function renderChannels(container) {
  const server = getActiveServer();
  const state = getState();
  if (!server) {
    container.innerHTML = '';
    return;
  }

  const callInfo = getActiveVoiceCallInfo();

  container.innerHTML = `
    <div class="channels__header" id="channels-header" role="button" tabindex="0" aria-label="Меню сервера ${escapeHtml(server.name)}">
      <span>${escapeHtml(server.name)}</span>
      <span class="channels__header-caret">▾</span>
    </div>
    <div class="channels__list" id="channels-list"></div>
    ${callInfo && !callInfo.isCurrentlyViewing ? buildActiveCallBannerHtml(callInfo) : ''}
    <div class="user-card">
      <div class="user-card__avatar" style="background:${USERS.me.color}">
        ${USERS.me.initials}
        <span class="user-card__status-dot" aria-hidden="true"></span>
      </div>
      <div class="user-card__info">
        <div class="user-card__name">${escapeHtml(USERS.me.name)}</div>
        <div class="user-card__status-text">В сети</div>
      </div>
      <div class="user-card__controls">
        <button class="user-card__btn" title="Микрофон" aria-label="Переключить микрофон">🎤</button>
        <button class="user-card__btn" title="Настройки" aria-label="Настройки">⚙</button>
      </div>
    </div>
  `;

  if (callInfo && !callInfo.isCurrentlyViewing) {
    wireActiveCallBanner(container);
  }

  const list = container.querySelector('#channels-list');

  server.channelGroups.forEach((group) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'channel-group';

    const labelEl = document.createElement('div');
    labelEl.className = 'channel-group__label';
    labelEl.textContent = group.label;
    groupEl.appendChild(labelEl);

    group.channels.forEach((channel) => {
      const isActive = channel.id === state.activeChannelId;
      // Отдельно от "что отображается" — этот самый канал прямо сейчас
      // держит реальное LiveKit-соединение (возможно, в фоне).
      const isLiveHere =
        group.type === 'voice' && channel.id === callInfo?.channelId;

      const itemEl = document.createElement('div');
      itemEl.className = `channel-item${isActive ? ' channel-item--active' : ''}${
        isLiveHere ? ' channel-item--voice-live' : ''
      }`;
      itemEl.setAttribute('role', 'button');
      itemEl.setAttribute('tabindex', '0');
      itemEl.setAttribute('aria-current', String(isActive));

      const icon = CHANNEL_ICONS[group.type] || '○';

      itemEl.innerHTML = `
        <span class="channel-item__icon" aria-hidden="true">${icon}</span>
        <span class="channel-item__name">${escapeHtml(channel.name)}</span>
        ${
          channel.unread
            ? `<span class="channel-item__badge">${channel.unread}</span>`
            : ''
        }
      `;

      itemEl.addEventListener('click', () => selectChannel(channel.id, group.type));
      itemEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectChannel(channel.id, group.type);
        }
      });

      groupEl.appendChild(itemEl);
    });

    list.appendChild(groupEl);
  });
}

// Плашка активного звонка: показывается, когда есть идущий LiveKit-звонок,
// но мы сейчас смотрим не на его экран (ушли на другой сервер/канал) — как
// в Discord, где такая плашка держит разговор на виду, пока ты листаешь
// другие каналы. Клик по названию канала возвращает на его экран без
// переподключения; отдельная кнопка — настоящий выход из звонка.
function buildActiveCallBannerHtml(callInfo) {
  return `
    <div class="active-call-banner" id="active-call-banner">
      <div class="active-call-banner__info" id="active-call-banner-info" role="button" tabindex="0">
        <span class="active-call-banner__dot" aria-hidden="true"></span>
        <div class="active-call-banner__text">
          <div class="active-call-banner__title">Голосовой канал подключён</div>
          <div class="active-call-banner__subtitle">${escapeHtml(callInfo.serverName)} / ${escapeHtml(callInfo.channelName)}</div>
        </div>
      </div>
      <button class="active-call-banner__leave" id="active-call-banner-leave" title="Отключиться" aria-label="Отключиться от голосового канала">☎</button>
    </div>
  `;
}

function wireActiveCallBanner(container) {
  const infoEl = container.querySelector('#active-call-banner-info');
  const leaveBtn = container.querySelector('#active-call-banner-leave');

  const goToCall = () => returnToActiveVoiceChannel();

  infoEl?.addEventListener('click', goToCall);
  infoEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      goToCall();
    }
  });

  leaveBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    endVoiceCall();
    leaveVoice();
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
