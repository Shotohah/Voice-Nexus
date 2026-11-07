import { renderRail } from './components/rail.js';
import { renderChannels } from './components/channels.js';
import { renderChat } from './components/chat.js';
import { renderMembers } from './components/members.js';
import { renderVoiceScreen, stopVoiceAnimation } from './components/voice.js';
import { renderAuthScreen } from './components/auth.js';
import { setCurrentUsername } from './data.js';
import { getActiveChannel, getState, setTheme, subscribe } from './store.js';

const railEl = document.getElementById('rail');
const channelsEl = document.getElementById('channels');
const contentEl = document.getElementById('content');
const membersEl = document.getElementById('members');
const mainLayoutEl = document.getElementById('main-layout');
const authContainerEl = document.getElementById('auth-container');

let lastRenderedChannelId = null;

function renderAll() {
  const state = getState();
  const channel = getActiveChannel();

  renderRail(railEl);
  renderChannels(channelsEl);

  const channelChanged = channel?.id !== lastRenderedChannelId;
  lastRenderedChannelId = channel?.id ?? null;

  if (!channel) {
    contentEl.innerHTML = '';
    renderMembers(membersEl, false);
    return;
  }

  if (state.activeChannelType === 'voice') {
    stopVoiceAnimation();
    renderVoiceScreen(contentEl, channel.name);
    renderMembers(membersEl, false);
  } else {
    // Перерисовываем чат только при смене канала — иначе сбивали бы
    // локальный ввод/индикатор печати при каждом тике стора.
    if (channelChanged) {
      renderChat(contentEl);
    }
    renderMembers(membersEl, true);
  }
}

subscribe(() => renderAll());

// ---- Переключатель темы ----
const themeSwitcher = document.getElementById('theme-switcher');
const savedTheme = safeGetSavedTheme();
if (savedTheme) {
  setTheme(savedTheme);
}

function updateThemeButtons() {
  const current = getState().theme;
  themeSwitcher.querySelectorAll('.theme-switcher__btn').forEach((btn) => {
    btn.classList.toggle(
      'theme-switcher__btn--active',
      btn.dataset.themeValue === current
    );
  });
}

themeSwitcher.addEventListener('click', (e) => {
  const btn = e.target.closest('.theme-switcher__btn');
  if (!btn) return;
  setTheme(btn.dataset.themeValue);
});

subscribe(updateThemeButtons);

function safeGetSavedTheme() {
  try {
    return localStorage.getItem('voice-nexus-theme');
  } catch (e) {
    return null;
  }
}

// ---- Кастомные кнопки управления окном ----
document.getElementById('btn-minimize')?.addEventListener('click', () => {
  window.voiceNexus?.minimize();
});
document.getElementById('btn-maximize')?.addEventListener('click', () => {
  window.voiceNexus?.toggleMaximize();
});
document.getElementById('btn-close')?.addEventListener('click', () => {
  window.voiceNexus?.close();
});

// ---- Старт приложения: сперва экран входа, основной интерфейс — после ----
document.documentElement.setAttribute('data-theme', getState().theme);
updateThemeButtons();

function startMainApp() {
  authContainerEl.innerHTML = '';
  mainLayoutEl.hidden = false;
  renderAll();
}

function handleAuthSuccess({ username }) {
  setCurrentUsername(username);
  startMainApp();
}

renderAuthScreen(authContainerEl, handleAuthSuccess);
