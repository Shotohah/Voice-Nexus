import { SERVERS } from '../data.js';
import { getState, selectServer } from '../store.js';
import { openCreateServerModal } from './create-server-modal.js';

export function renderRail(container) {
  const state = getState();
  container.innerHTML = '';

  SERVERS.forEach((server) => {
    const isActive = server.id === state.activeServerId;
    const item = document.createElement('div');
    item.className = `rail-item${isActive ? ' rail-item--active' : ''}${
      server.unread && !isActive ? ' rail-item--unread' : ''
    }`;
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', server.name);
    item.setAttribute('aria-pressed', String(isActive));

    item.innerHTML = `
      <span class="rail-item__indicator" aria-hidden="true"></span>
      <div class="rail-item__icon">${server.shortName}</div>
      <span class="rail-tooltip">${escapeHtml(server.name)}</span>
    `;

    item.addEventListener('click', () => selectServer(server.id));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectServer(server.id);
      }
    });

    container.appendChild(item);
  });

  const divider = document.createElement('div');
  divider.className = 'rail-divider';
  container.appendChild(divider);

  const addItem = document.createElement('div');
  addItem.className = 'rail-item';
  addItem.setAttribute('role', 'button');
  addItem.setAttribute('tabindex', '0');
  addItem.setAttribute('aria-label', 'Добавить сервер');
  addItem.innerHTML = `
    <span class="rail-item__indicator" aria-hidden="true"></span>
    <div class="rail-item__icon rail-item__icon--add">+</div>
    <span class="rail-tooltip">Добавить сервер</span>
  `;
  addItem.addEventListener('click', openCreateServerModal);
  addItem.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openCreateServerModal();
    }
  });
  container.appendChild(addItem);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
