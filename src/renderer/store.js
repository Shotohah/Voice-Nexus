// ============================================================================
// Voice Nexus — минимальный стор состояния приложения (без фреймворков).
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
  // 'text' | 'voice' — что рисуем в контентной области ПРЯМО СЕЙЧАС
  // (то, на что ты смотришь). Это не то же самое, что активный звонок —
  // навигация по текстовым каналам/серверам не должна его обрывать.
  activeChannelType: 'text',

  // Голосовой канал, к которому реально подключено LiveKit-соединение —
  // живёт независимо от activeChannelId/activeServerId, как в Discord:
  // ушёл на другой сервер читать чат — звонок продолжается в фоне.
  // null, если сейчас ни в одном голосовом канале нет активного звонка.
  activeVoiceChannelId: null,
  activeVoiceServerId: null
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
    localStorage.setItem('voice-nexus-theme', theme);
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
  // Переключает только то, что ОТОБРАЖАЕТСЯ — переходим на текстовый канал
  // нового сервера для чтения. Если в этот момент идёт звонок в голосовом
  // канале (activeVoiceChannelId), он НЕ трогается: тот же принцип, что в
  // Discord — ушёл почитать другой сервер, но из разговора не вышел.
  if (firstText && firstText.channels.length) {
    state.activeChannelId = firstText.channels[0].id;
    state.activeChannelType = 'text';
  }
  notify();
}

// type: 'text' | 'voice'. Для voice — это переход в голосовой канал ГЛАЗАМИ
// (показать его сетку участников) И физическое присоединение к звонку:
// на этом масштабе проекта один клик делает оба действия сразу, так же
// как в Discord клик по голосовому каналу одновременно заходит в него.
export function selectChannel(channelId, type) {
  state.activeChannelId = channelId;
  state.activeChannelType = type;
  if (type === 'voice') {
    state.activeVoiceChannelId = channelId;
    state.activeVoiceServerId = state.activeServerId;
  }
  notify();
}

// Возвращает к экрану голосового канала, в котором уже идёт звонок —
// используется плашкой активного звонка ("вернуться"), без повторного
// подключения к LiveKit (joinVoiceChannel сам не переподключается, если
// room уже существует для того же канала — см. voice.js).
export function returnToActiveVoiceChannel() {
  if (!state.activeVoiceChannelId || !state.activeVoiceServerId) return;
  state.activeServerId = state.activeVoiceServerId;
  state.activeChannelId = state.activeVoiceChannelId;
  state.activeChannelType = 'voice';
  notify();
}

// Настоящий выход из звонка (кнопка "Выйти" на голосовом экране, или
// "Отключиться" на плашке активного звонка) — в отличие от простой
// навигации, тут нужно закрыть LiveKit-соединение по-настоящему.
export function leaveVoice() {
  state.activeVoiceChannelId = null;
  state.activeVoiceServerId = null;
  // Если сейчас смотрим именно на этот голосовой экран — возвращаемся на
  // первый текстовый канал текущего сервера. Если звонок шёл в фоне, а
  // смотрим мы на другой сервер/канал — ничего менять не нужно, то что
  // отображается, никак не связано с этим звонком.
  if (state.activeChannelType === 'voice') {
    const server = SERVERS.find((s) => s.id === state.activeServerId);
    const firstText = server?.channelGroups.find((g) => g.type === 'text');
    if (firstText && firstText.channels.length) {
      state.activeChannelId = firstText.channels[0].id;
      state.activeChannelType = 'text';
    }
  }
  notify();
}

// Для плашки активного звонка: имя канала/сервера, где реально идёт
// LiveKit-соединение (может отличаться от того, что сейчас отображается).
// null, если звонка сейчас нет вообще.
export function getActiveVoiceCallInfo() {
  if (!state.activeVoiceChannelId || !state.activeVoiceServerId) return null;
  const server = SERVERS.find((s) => s.id === state.activeVoiceServerId);
  if (!server) return null;
  for (const group of server.channelGroups) {
    const channel = group.channels.find((c) => c.id === state.activeVoiceChannelId);
    if (channel) {
      return {
        channelId: channel.id,
        channelName: channel.name,
        serverId: server.id,
        serverName: server.name,
        // смотрим ли мы СЕЙЧАС на экран этого звонка, или он идёт в фоне
        isCurrentlyViewing:
          state.activeChannelType === 'voice' && state.activeChannelId === channel.id
      };
    }
  }
  return null;
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
