// ============================================================================
// Voice Nexus — экран регистрации / входа.
// Это UI-мокап: нет настоящего бэкенда и сети, поля и кнопки валидируются
// только на клиенте, а "успешный" вход просто открывает основной интерфейс.
// Логин задуман как в Steam: именно username + пароль, а не email.
// ============================================================================

const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

let mode = 'register'; // 'register' | 'login'

export function renderAuthScreen(container, onSuccess) {
  container.innerHTML = buildMarkup();
  wire(container, onSuccess);
  container.querySelector('#auth-username')?.focus();
}

function buildMarkup() {
  const isRegister = mode === 'register';
  return `
    <div class="auth-screen" id="auth-screen">
      <div class="auth-card">
        <div class="auth-card__brand">
          <span class="auth-card__brand-dot" aria-hidden="true"></span>
          <span class="auth-card__brand-name">Voice Nexus</span>
        </div>
        <h1 class="auth-card__title">${isRegister ? 'Создать аккаунт' : 'С возвращением'}</h1>
        <p class="auth-card__subtitle">${
          isRegister
            ? 'Придумай логин и пароль — почта не нужна'
            : 'Войди под своим логином'
        }</p>

        <div id="auth-error-slot"></div>

        <form id="auth-form" novalidate>
          <div class="auth-field">
            <label class="auth-field__label" for="auth-username">Логин</label>
            <div class="auth-field__input-wrap">
              <input
                class="auth-field__input"
                id="auth-username"
                name="username"
                type="text"
                autocomplete="username"
                placeholder="например, nightowl_22"
                maxlength="16"
              />
            </div>
            <div class="auth-field__hint" id="hint-username">${
              isRegister ? 'От 3 до 16 символов: латиница, цифры, _' : ''
            }</div>
          </div>

          <div class="auth-field">
            <label class="auth-field__label" for="auth-password">Пароль</label>
            <div class="auth-field__input-wrap">
              <input
                class="auth-field__input"
                id="auth-password"
                name="password"
                type="password"
                autocomplete="${isRegister ? 'new-password' : 'current-password'}"
                placeholder="минимум 6 символов"
              />
              <button type="button" class="auth-field__toggle-pass" data-toggle-for="auth-password" aria-label="Показать пароль">👁</button>
            </div>
            <div class="auth-field__hint" id="hint-password"></div>
          </div>

          ${
            isRegister
              ? `
          <div class="auth-field">
            <label class="auth-field__label" for="auth-password-confirm">Повтори пароль</label>
            <div class="auth-field__input-wrap">
              <input
                class="auth-field__input"
                id="auth-password-confirm"
                name="passwordConfirm"
                type="password"
                autocomplete="new-password"
                placeholder="ещё раз пароль"
              />
              <button type="button" class="auth-field__toggle-pass" data-toggle-for="auth-password-confirm" aria-label="Показать пароль">👁</button>
            </div>
            <div class="auth-field__hint" id="hint-password-confirm"></div>
          </div>`
              : ''
          }

          <button type="submit" class="auth-submit" id="auth-submit">
            <span id="auth-submit-label">${isRegister ? 'Зарегистрироваться' : 'Войти'}</span>
          </button>
        </form>

        <div class="auth-card__switch">
          ${
            isRegister
              ? `Уже есть аккаунт? <a href="#" class="auth-card__switch-link" id="auth-switch-link">Войти</a>`
              : `Ещё нет аккаунта? <a href="#" class="auth-card__switch-link" id="auth-switch-link">Зарегистрироваться</a>`
          }
        </div>
      </div>
    </div>
  `;
}

function wire(container, onSuccess) {
  const screen = container.querySelector('#auth-screen');
  const form = container.querySelector('#auth-form');
  const usernameInput = container.querySelector('#auth-username');
  const passwordInput = container.querySelector('#auth-password');
  const confirmInput = container.querySelector('#auth-password-confirm');
  const submitBtn = container.querySelector('#auth-submit');
  const submitLabel = container.querySelector('#auth-submit-label');
  const switchLink = container.querySelector('#auth-switch-link');
  const errorSlot = container.querySelector('#auth-error-slot');

  // Показать/скрыть пароль
  container.querySelectorAll('.auth-field__toggle-pass').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.toggleFor;
      const input = container.querySelector(`#${targetId}`);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? '🙈' : '👁';
    });
  });

  // Живая валидация логина
  usernameInput.addEventListener('input', () => {
    validateUsername(usernameInput, container.querySelector('#hint-username'));
  });

  // Живая валидация пароля (+ пересчёт совпадения, если есть поле подтверждения)
  passwordInput.addEventListener('input', () => {
    validatePassword(passwordInput, container.querySelector('#hint-password'));
    if (confirmInput) {
      validateConfirm(passwordInput, confirmInput, container.querySelector('#hint-password-confirm'));
    }
  });

  if (confirmInput) {
    confirmInput.addEventListener('input', () => {
      validateConfirm(passwordInput, confirmInput, container.querySelector('#hint-password-confirm'));
    });
  }

  switchLink?.addEventListener('click', (e) => {
    e.preventDefault();
    mode = mode === 'register' ? 'login' : 'register';
    renderAuthScreen(container, onSuccess);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorSlot.innerHTML = '';

    const usernameOk = validateUsername(usernameInput, container.querySelector('#hint-username'), true);
    const passwordOk = validatePassword(passwordInput, container.querySelector('#hint-password'), true);
    const confirmOk = confirmInput
      ? validateConfirm(passwordInput, confirmInput, container.querySelector('#hint-password-confirm'), true)
      : true;

    if (!usernameOk || !passwordOk || !confirmOk) {
      shakeCard(container);
      return;
    }

    // Имитация обращения к серверу: небольшая задержка + спиннер на кнопке,
    // чтобы состояние "loading" было видно, как и на остальных экранах.
    submitBtn.disabled = true;
    submitLabel.textContent = '';
    submitBtn.insertAdjacentHTML('beforeend', '<span class="auth-submit__spinner" aria-hidden="true"></span>');

    setTimeout(() => {
      // Имитация единственного "серверного" правила: логин "admin" занят —
      // чтобы в прототипе было видно состояние ошибки формы, а не только успех.
      if (mode === 'register' && usernameInput.value.trim().toLowerCase() === 'admin') {
        submitBtn.disabled = false;
        submitBtn.querySelector('.auth-submit__spinner')?.remove();
        submitLabel.textContent = 'Зарегистрироваться';
        errorSlot.innerHTML = `
          <div class="auth-card__error-banner">
            <span aria-hidden="true">⚠</span>
            <span>Логин «admin» уже занят — попробуй другой</span>
          </div>
        `;
        shakeCard(container);
        return;
      }

      screen.classList.add('auth-screen--leaving');
      setTimeout(() => onSuccess({ username: usernameInput.value.trim() }), 240);
    }, 650);
  });
}

function validateUsername(input, hintEl, isSubmit = false) {
  const value = input.value.trim();
  if (!value) {
    setFieldState(
      input,
      hintEl,
      isSubmit ? 'error' : 'neutral',
      isSubmit ? 'Укажи логин' : mode === 'register' ? 'От 3 до 16 символов: латиница, цифры, _' : ''
    );
    return false;
  }
  if (!USERNAME_RE.test(value)) {
    setFieldState(input, hintEl, 'error', 'Только латиница, цифры и _, от 3 до 16 символов');
    return false;
  }
  setFieldState(input, hintEl, 'ok', mode === 'register' ? 'Логин свободен' : '');
  return true;
}

function validatePassword(input, hintEl, isSubmit = false) {
  const value = input.value;
  if (!value) {
    setFieldState(input, hintEl, isSubmit ? 'error' : 'neutral', isSubmit ? 'Укажи пароль' : '');
    return false;
  }
  if (value.length < 6) {
    setFieldState(input, hintEl, 'error', 'Минимум 6 символов');
    return false;
  }
  setFieldState(input, hintEl, 'ok', '');
  return true;
}

function validateConfirm(passwordInput, confirmInput, hintEl, isSubmit = false) {
  if (!confirmInput.value) {
    setFieldState(confirmInput, hintEl, isSubmit ? 'error' : 'neutral', isSubmit ? 'Повтори пароль' : '');
    return false;
  }
  if (confirmInput.value !== passwordInput.value) {
    setFieldState(confirmInput, hintEl, 'error', 'Пароли не совпадают');
    return false;
  }
  setFieldState(confirmInput, hintEl, 'ok', 'Совпадает');
  return true;
}

function setFieldState(input, hintEl, state, message) {
  input.classList.toggle('auth-field__input--error', state === 'error');
  if (!hintEl) return;
  hintEl.textContent = message;
  hintEl.classList.toggle('auth-field__hint--error', state === 'error');
  hintEl.classList.toggle('auth-field__hint--ok', state === 'ok');
}

function shakeCard(container) {
  const card = container.querySelector('.auth-card');
  card.style.animation = 'none';
  // force reflow, чтобы анимация перезапустилась при повторной ошибке подряд
  void card.offsetWidth;
  card.style.animation = 'shake 0.4s ease-in-out';
}
