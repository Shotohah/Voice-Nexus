import { createServer } from '../store.js';

// Модальное окно "Создать сервер" — открывается кнопкой "+" на рельсе
// (rail.js). Минимально: только имя сервера, т.к. это прототип без
// бэкенда — иконка/приглашения тут не нужны, в отличие от настоящего
// Discord. При успехе createServer сам переключает стор на новый сервер,
// так что дальше ничего дополнительно вызывать не нужно — renderAll
// подхватит изменение через subscribe в app.js.
export function openCreateServerModal() {
  if (document.getElementById('create-server-modal')) return; // уже открыта

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'create-server-modal';
  overlay.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-server-title">
      <div class="modal-card__header">
        <h2 class="modal-card__title" id="create-server-title">Создать сервер</h2>
        <button type="button" class="modal-card__close" id="create-server-close" aria-label="Закрыть">✕</button>
      </div>
      <p class="modal-card__hint">Дай серверу имя — остальное можно будет настроить потом.</p>
      <form id="create-server-form">
        <input
          type="text"
          class="modal-card__input"
          id="create-server-input"
          placeholder="Например, «Клуб настолок»"
          maxlength="40"
          autocomplete="off"
        />
        <div class="modal-card__error" id="create-server-error" hidden></div>
        <div class="modal-card__actions">
          <button type="button" class="modal-card__btn modal-card__btn--ghost" id="create-server-cancel">Отмена</button>
          <button type="submit" class="modal-card__btn modal-card__btn--primary">Создать</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = overlay.querySelector('#create-server-input');
  const errorEl = overlay.querySelector('#create-server-error');
  const form = overlay.querySelector('#create-server-form');

  const close = () => overlay.remove();

  overlay.querySelector('#create-server-close').addEventListener('click', close);
  overlay.querySelector('#create-server-cancel').addEventListener('click', close);

  // Клик по фону (не по самой карточке) тоже закрывает — стандартное
  // поведение модалок, которого люди ожидают.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const onKeydown = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKeydown);
  // Снимаем обработчик, когда модалка реально уходит из DOM, чтобы не
  // плодить висящие keydown-слушатели на document при повторных открытиях.
  const observer = new MutationObserver(() => {
    if (!document.body.contains(overlay)) {
      document.removeEventListener('keydown', onKeydown);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) {
      errorEl.textContent = 'Введи название сервера';
      errorEl.hidden = false;
      input.focus();
      return;
    }
    createServer(name);
    close();
  });

  requestAnimationFrame(() => input.focus());
}
