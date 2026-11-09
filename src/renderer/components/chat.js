import { MESSAGES, USERS } from '../data.js';
import { getActiveChannel, getState } from '../store.js';

export function renderChat(container) {
  const channel = getActiveChannel();
  if (!channel) {
    container.innerHTML = '';
    return;
  }

  const messages = MESSAGES[channel.id] || [];

  container.innerHTML = `
    <header class="chat__header">
      <div class="chat__header-title">
        <span class="chat__header-icon" aria-hidden="true">○</span>
        <span>${escapeHtml(channel.name)}</span>
      </div>
      <div class="chat__header-actions">
        <button class="chat__header-btn" title="Закреплённые" aria-label="Закреплённые сообщения">📌</button>
        <button class="chat__header-btn" title="Участники" aria-label="Список участников">👥</button>
        <button class="chat__header-btn" title="Поиск" aria-label="Поиск по каналу">🔍</button>
      </div>
    </header>
    <div class="chat__scroll" id="chat-scroll"></div>
    <div class="chat__composer">
      <form class="composer" id="composer-form">
        <input
          class="composer__input"
          id="composer-input"
          type="text"
          placeholder="Написать в #${escapeAttr(channel.name)}…"
          autocomplete="off"
          aria-label="Новое сообщение"
        />
        <div class="composer__actions">
          <button type="button" class="composer__btn" title="Прикрепить файл" aria-label="Прикрепить файл">📎</button>
          <button type="button" class="composer__btn" title="Эмодзи" aria-label="Добавить эмодзи">😊</button>
          <button type="submit" class="composer__btn composer__btn--send" title="Отправить" aria-label="Отправить сообщение">➤</button>
        </div>
      </form>
    </div>
  `;

  const scroll = container.querySelector('#chat-scroll');

  if (messages.length === 0) {
    scroll.innerHTML = `
      <div class="chat__empty">
        <div class="chat__empty-title">Пока тихо</div>
        <div>Здесь ещё никто не писал — будь первым в #${escapeHtml(channel.name)}.</div>
      </div>
    `;
  } else {
    renderMessageGroups(scroll, messages);
  }

  scroll.scrollTop = scroll.scrollHeight;

  setupComposer(container, channel, scroll);
}

function renderMessageGroups(scroll, messages) {
  const groups = groupMessagesByAuthor(messages);
  groups.forEach((group) => {
    scroll.appendChild(buildMessageGroupEl(group));
  });
}

function groupMessagesByAuthor(messages) {
  const groups = [];
  messages.forEach((msg) => {
    const last = groups[groups.length - 1];
    if (last && last.authorId === msg.authorId) {
      last.messages.push(msg);
    } else {
      groups.push({ authorId: msg.authorId, messages: [msg] });
    }
  });
  return groups;
}

function buildMessageGroupEl(group) {
  const author = USERS[group.authorId] || USERS.me;
  const first = group.messages[0];

  const el = document.createElement('div');
  el.className = 'msg-group';
  el.innerHTML = `
    <div class="msg-group__avatar" style="background:${author.color}">${author.initials}</div>
    <div class="msg-group__body">
      <div class="msg-group__meta">
        <span class="msg-group__author">${escapeHtml(author.name)}</span>
        <span class="msg-group__time">${escapeHtml(first.time)}</span>
      </div>
    </div>
  `;

  const body = el.querySelector('.msg-group__body');

  group.messages.forEach((msg) => {
    const lineEl = document.createElement('div');
    lineEl.className = `msg-line${msg.sending ? ' msg-line--sending' : ''}`;
    lineEl.textContent = msg.text;
    if (msg.sending) {
      const statusIcon = document.createElement('span');
      statusIcon.className = 'msg-line__status-icon';
      statusIcon.textContent = '🕐';
      lineEl.appendChild(statusIcon);
    }
    body.appendChild(lineEl);

    if (msg.attachment) {
      const attEl = document.createElement('div');
      attEl.className = 'msg-attachment';
      attEl.innerHTML = `
        <span class="msg-attachment__icon" aria-hidden="true">▤</span>
        <div>
          <div class="msg-attachment__name">${escapeHtml(msg.attachment.name)}</div>
          <div class="msg-attachment__size">${escapeHtml(msg.attachment.size)}</div>
        </div>
      `;
      body.appendChild(attEl);
    }

    if (msg.reactions && msg.reactions.length) {
      const reactionsEl = document.createElement('div');
      reactionsEl.className = 'msg-reactions';
      msg.reactions.forEach((r) => {
        reactionsEl.appendChild(buildReactionChip(r));
      });
      body.appendChild(reactionsEl);
    }
  });

  return el;
}

// Реакция — это toggle (как в Discord): клик ставит свою реакцию (+1 к
// счётчику, подсветка), повторный клик снимает её (-1, подсветка пропадает).
// Раньше счётчик просто бесконечно рос на каждый клик без ограничений —
// r.reactedByMe помнит, стоит ли СВОЯ реакция, чтобы было что переключать.
function buildReactionChip(r) {
  const chip = document.createElement('button');
  chip.type = 'button';

  const render = () => {
    chip.className = `msg-reaction${r.reactedByMe ? ' msg-reaction--mine' : ''}`;
    chip.setAttribute('aria-pressed', String(Boolean(r.reactedByMe)));
    chip.innerHTML = `<span>${r.emoji}</span><span class="msg-reaction__count">${r.count}</span>`;
  };
  render();

  chip.addEventListener('click', () => {
    if (r.reactedByMe) {
      r.count = Math.max(0, r.count - 1);
      r.reactedByMe = false;
    } else {
      r.count += 1;
      r.reactedByMe = true;
    }
    render();
  });

  return chip;
}

function setupComposer(container, channel, scroll) {
  const form = container.querySelector('#composer-form');
  const input = container.querySelector('#composer-input');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;

    const newMsg = { id: `local-${Date.now()}`, authorId: 'me', time, text, sending: true };

    if (!MESSAGES[channel.id]) MESSAGES[channel.id] = [];
    MESSAGES[channel.id].push(newMsg);

    // Перерисовываем ленту, чтобы учесть группировку
    scroll.innerHTML = '';
    renderMessageGroups(scroll, MESSAGES[channel.id]);
    scroll.scrollTop = scroll.scrollHeight;

    input.value = '';

    // Имитация задержки сервера: "sending" → "sent" (fade до 100%)
    setTimeout(() => {
      newMsg.sending = false;
      scroll.innerHTML = '';
      renderMessageGroups(scroll, MESSAGES[channel.id]);
      scroll.scrollTop = scroll.scrollHeight;
    }, 550);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str);
}
