import { MEMBERS_BY_PRESENCE, USERS } from '../data.js';

const GROUP_LABELS = {
  online: 'В сети',
  idle: 'Отошёл',
  dnd: 'Не беспокоить',
  offline: 'Не на сайте'
};

export function renderMembers(container, visible) {
  if (!visible) {
    container.className = 'members members--hidden';
    container.innerHTML = '';
    return;
  }
  container.className = 'members';

  container.innerHTML = '';

  Object.entries(MEMBERS_BY_PRESENCE).forEach(([status, userIds]) => {
    if (!userIds.length) return;

    const groupEl = document.createElement('div');
    groupEl.className = 'members__group';

    const label = document.createElement('div');
    label.className = 'members__group-label';
    label.textContent = `${GROUP_LABELS[status]} — ${userIds.length}`;
    groupEl.appendChild(label);

    userIds.forEach((userId) => {
      const user = USERS[userId];
      if (!user) return;
      const row = document.createElement('div');
      row.className = `member-row${status === 'offline' ? ' member-row--offline' : ''}`;
      row.innerHTML = `
        <div class="member-row__avatar-wrap">
          <div class="member-row__avatar" style="background:${user.color}">${user.initials}</div>
          <span class="member-row__status member-row__status--${status}" aria-hidden="true"></span>
        </div>
        <span class="member-row__name">${escapeHtml(user.name)}</span>
      `;
      groupEl.appendChild(row);
    });

    container.appendChild(groupEl);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
