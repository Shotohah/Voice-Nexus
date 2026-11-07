// ============================================================================
// Vybe — минимальный стор состояния приложения (без фреймворков).
// Подписчики получают колбэк при каждом изменении; рендер-функции сами
// решают, что перерисовать.
// ============================================================================

import { SERVERS } from './data.js';

const firstServer = SERVERS[0];
const firstTextChannel = firstServer.channelGroups.find((g) => g.type === 'text')
  .channels[0];

const state = {
  theme: 'dark',
  activeServerId: firstServer.id,
  activeChannelId: firstTextChannel.id,
  // 'text' | 'voice' — определяет, что рисуем в контентной области
  activeChannelType: 'text',
  // для голосового канала: кто сейчас "говорит" (симуляция)
  voiceChannelId: null
};

const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn(state));
}

export function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('vybe-theme', theme);
  } catch (e) {
    // localStorage может быть недоступен — не критично, просто не запомним выбор
  }
  notify();
}

export function selectServer(serverId) {
  if (state.activeServerId === serverId) return;
  const server = SERVERS.find((s) => s.id === serverId);
  if (!server) return;
  const firstText = server.channelGroups.find((g) => g.type === 'text');
  state.activeServerId = serverId;
  if (firstText && firstText.channels.length) {
    state.activeChannelId = firstText.channels[0].id;
    state.activeChannelType = 'text';
  }
  notify();
}

export function selectChannel(channelId, type) {
  state.activeChannelId = channelId;
  state.activeChannelType = type;
  if (type === 'voice') {
    state.voiceChannelId = channelId;
  }
  notify();
}

export function leaveVoice() {
  state.voiceChannelId = null;
  // возвращаемся на первый текстовый канал текущего сервера
  const server = SERVERS.find((s) => s.id === state.activeServerId);
  const firstText = server?.channelGroups.find((g) => g.type === 'text');
  if (firstText) {
    state.activeChannelId = firstText.channels[0].id;
    state.activeChannelType = 'text';
  }
  notify();
}

export function getActiveServer() {
  return SERVERS.find((s) => s.id === state.activeServerId);
}

export function getActiveChannel() {
  const server = getActiveServer();
  if (!server) return null;
  for (const group of server.channelGroups) {
    const found = group.channels.find((c) => c.id === state.activeChannelId);
    if (found) return { ...found, groupType: group.type };
  }
  return null;
}
