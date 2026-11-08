// ============================================================================
// Voice Nexus — тонкая обёртка над LiveKit SDK.
//
// Отвечает за сетевую часть голосового звонка: получить токен у токен-сервера,
// подключиться к комнате LiveKit, опубликовать микрофон, подписаться на треки
// остальных участников. Ничего не знает о DOM — рендерингом карточек участников
// занимается components/voice.js, который слушает события отсюда через колбэки.
// ============================================================================

import { Room, RoomEvent, Track, ConnectionState } from './vendor/livekit-client.esm.mjs';

// Адрес токен-сервера. В разработке — локальный процесс (server/index.js на
// порту 4000, см. server/.env). Для реального деплоя (когда токен-сервер
// работает не на localhost, а в интернете 24/7) это нужно заменить на его
// публичный https-адрес — и добавить этот адрес в connect-src в index.html.
const TOKEN_SERVER_URL = 'http://localhost:4000';

let room = null;

// Запрашивает у токен-сервера подписанный JWT для входа в конкретную комнату
// под конкретным именем пользователя. Секрет LiveKit здесь не фигурирует —
// только короткоживущий токен, который сервер подписал сам.
async function fetchToken(username, roomName) {
  let response;
  try {
    response = await fetch(`${TOKEN_SERVER_URL}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, room: roomName })
    });
  } catch (err) {
    throw new VoiceConnectionError(
      'server_unreachable',
      'Не удалось связаться с токен-сервером. Проверьте, что он запущен.'
    );
  }

  if (!response.ok) {
    let body = null;
    try {
      body = await response.json();
    } catch (e) {
      // тело могло быть не-JSON — не критично, сообщим общей фразой
    }
    throw new VoiceConnectionError(
      body?.error || 'token_request_failed',
      body?.message || `Токен-сервер ответил ошибкой (${response.status}).`
    );
  }

  return response.json(); // { token, url }
}

export class VoiceConnectionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'VoiceConnectionError';
    this.code = code;
  }
}

// Подключается к голосовому каналу. handlers — объект колбэков:
//   onParticipantsChanged(participants) — вызывается при любом изменении
//     состава/состояния участников; participants — массив вида
//     { identity, isLocal, speaking, muted, screenShareTrack, audioTrack }
//   onConnectionStateChanged(state) — 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
//   onError(VoiceConnectionError)
export async function joinVoiceChannel(username, roomName, handlers) {
  if (room) {
    await leaveVoiceChannel();
  }

  handlers.onConnectionStateChanged?.('connecting');

  let token, url;
  try {
    ({ token, url } = await fetchToken(username, roomName));
  } catch (err) {
    handlers.onConnectionStateChanged?.('disconnected');
    handlers.onError?.(err);
    return null;
  }

  room = new Room({
    adaptiveStream: true,
    dynacast: true
  });

  const emitParticipants = () => {
    handlers.onParticipantsChanged?.(collectParticipants(room));
  };

  room
    .on(RoomEvent.ParticipantConnected, emitParticipants)
    .on(RoomEvent.ParticipantDisconnected, emitParticipants)
    .on(RoomEvent.TrackSubscribed, emitParticipants)
    .on(RoomEvent.TrackUnsubscribed, emitParticipants)
    .on(RoomEvent.TrackMuted, emitParticipants)
    .on(RoomEvent.TrackUnmuted, emitParticipants)
    .on(RoomEvent.LocalTrackPublished, emitParticipants)
    .on(RoomEvent.LocalTrackUnpublished, emitParticipants)
    .on(RoomEvent.ActiveSpeakersChanged, emitParticipants)
    .on(RoomEvent.ConnectionStateChanged, (state) => {
      handlers.onConnectionStateChanged?.(mapConnectionState(state));
    })
    .on(RoomEvent.Disconnected, () => {
      handlers.onConnectionStateChanged?.('disconnected');
    });

  try {
    await room.connect(url, token);
  } catch (err) {
    room = null;
    handlers.onConnectionStateChanged?.('disconnected');
    handlers.onError?.(
      new VoiceConnectionError(
        'room_connect_failed',
        describeConnectError(err)
      )
    );
    return null;
  }

  try {
    await room.localParticipant.setMicrophoneEnabled(true);
  } catch (err) {
    // Не разрываем звонок из-за отказа в доступе к микрофону — человек
    // может слушать без права говорить (например, запретил доступ ОС).
    handlers.onError?.(
      new VoiceConnectionError(
        'microphone_unavailable',
        'Не удалось включить микрофон. Проверьте разрешения приложения на доступ к микрофону в настройках системы.'
      )
    );
  }

  handlers.onConnectionStateChanged?.('connected');
  emitParticipants();

  return room;
}

export async function leaveVoiceChannel() {
  if (!room) return;
  const r = room;
  room = null;
  try {
    await r.disconnect();
  } catch (e) {
    // игнорируем — мы и так уходим из комнаты
  }
}

export function getCurrentRoom() {
  return room;
}

export async function setMicrophoneEnabled(enabled) {
  if (!room) return;
  await room.localParticipant.setMicrophoneEnabled(enabled);
}

export async function setScreenShareEnabled(enabled) {
  if (!room) return;
  await room.localParticipant.setScreenShareEnabled(enabled);
}

// Возвращает MediaStreamTrack (настоящий, браузерный) микрофона локального
// участника — он нужен voice.js, чтобы подключить AnalyserNode и рисовать
// осциллограмму по реальной громкости, а не по Math.sin.
export function getLocalAudioMediaStreamTrack() {
  if (!room) return null;
  const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
  return pub?.track?.mediaStreamTrack ?? null;
}

// То же самое для удалённого участника по его identity.
export function getRemoteAudioMediaStreamTrack(identity) {
  if (!room) return null;
  const participant = room.remoteParticipants.get(identity);
  const pub = participant?.getTrackPublication(Track.Source.Microphone);
  return pub?.track?.mediaStreamTrack ?? null;
}

function collectParticipants(r) {
  const activeSpeakerIds = new Set(r.activeSpeakers.map((p) => p.identity));

  const local = r.localParticipant;
  const localMicPub = local.getTrackPublication(Track.Source.Microphone);
  const localScreenPub = local.getTrackPublication(Track.Source.ScreenShare);

  const list = [
    {
      identity: local.identity,
      isLocal: true,
      speaking: activeSpeakerIds.has(local.identity),
      muted: !localMicPub || localMicPub.isMuted || !localMicPub.track,
      screenshare: Boolean(localScreenPub && !localScreenPub.isMuted)
    }
  ];

  r.remoteParticipants.forEach((participant) => {
    const micPub = participant.getTrackPublication(Track.Source.Microphone);
    const screenPub = participant.getTrackPublication(Track.Source.ScreenShare);
    list.push({
      identity: participant.identity,
      isLocal: false,
      speaking: activeSpeakerIds.has(participant.identity),
      muted: !micPub || micPub.isMuted || !micPub.isSubscribed,
      screenshare: Boolean(screenPub && screenPub.isSubscribed && !screenPub.isMuted)
    });
  });

  return list;
}

function mapConnectionState(state) {
  switch (state) {
    case ConnectionState.Connecting:
      return 'connecting';
    case ConnectionState.Connected:
      return 'connected';
    case ConnectionState.Reconnecting:
      return 'reconnecting';
    case ConnectionState.Disconnected:
    default:
      return 'disconnected';
  }
}

function describeConnectError(err) {
  const msg = String(err?.message || err || '');
  if (/token/i.test(msg)) {
    return 'LiveKit отклонил токен подключения. Возможно, он истёк — попробуйте зайти в канал ещё раз.';
  }
  return 'Не удалось подключиться к голосовому серверу. Проверьте интернет-соединение.';
}
