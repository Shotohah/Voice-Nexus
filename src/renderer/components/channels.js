import { USERS } from '../data.js';
import { getActiveServer, getState, selectChannel } from '../store.js';

const CHANNEL_ICONS = { text: '○', voice: '◐' };

export function renderChannels(container) {
  const server = getActiveServer();
  const state = getState();
  if (!server) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="channels__header" id="channels-header" role="button" tabindex="0" aria-label="Меню сервера ${escapeHtml(server.name)}">
      <span>${escapeHtml(server.name)}</span>
      <span class="channels__header-caret">▾</span>
    </div>
    <div class="channels__list" id="channels-list"></div>
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
      const itemEl = document.createElement('div');
      itemEl.className = `channel-item${isActive ? ' channel-item--active' : ''}`;
      itemEl.setAttribute('role', 'button');
      itemEl.setAttribute('tabindex', '0');
      itemEl.setAttribute('aria-current', String(isActive));

      const icon = CHANNEL_ICONS[group.type] || '○';
      const memberCount =
        group.type === 'voice' && channel.members && channel.members.length
          ? ` · ${channel.members.length}`
          : '';

      itemEl.innerHTML = `
        <span class="channel-item__icon" aria-hidden="true">${icon}</span>
        <span class="channel-item__name">${escapeHtml(channel.name)}${memberCount}</span>
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

      // Вложенный список говорящих участников прямо под voice-каналом —
      // виден без захода в канал, как в концепте.
      if (group.type === 'voice' && channel.members && channel.members.length) {
        const preview = document.createElement('div');
        preview.className = 'voice-preview';
        channel.members.forEach((userId, idx) => {
          const user = USERS[userId];
          if (!user) return;
          const isMuted = idx === 1; // демо: второй участник замьючен
          const isSpeaking = idx === 0; // демо: первый участник говорит
          const row = document.createElement('div');
          row.className = 'voice-preview__member';
          row.innerHTML = `
            <span class="voice-preview__avatar${
              isSpeaking ? ' voice-preview__avatar--speaking' : ''
            }" style="background:${user.color}">${user.initials}</span>
            <span>${escapeHtml(user.name.split(' ')[0])}</span>
            <span class="voice-preview__mic-icon${
              isMuted ? ' voice-preview__mic-icon--muted' : ''
            }" aria-hidden="true">${isMuted ? '🔇' : '🎤'}</span>
          `;
          preview.appendChild(row);
        });
        groupEl.appendChild(preview);
      }
    });

    list.appendChild(groupEl);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
