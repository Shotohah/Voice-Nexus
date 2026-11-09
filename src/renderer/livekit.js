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
let currentRoomName = null;

// Колбэки живут отдельно от room.on(...) — не в замыкании, а в переменной
// модуля, которую можно перепривязать через setHandlers(). Это нужно,
// чтобы при возврате на голосовой экран (новый DOM, новый container в
// components/voice.js) можно было подключить свежие обработчики к уже
// идущему звонку, не разрывая и не пересоздавая реальное WebRTC-соединение.
let activeHandlers = {};

function callHandler(name, ...args) {
  activeHandlers[name]?.(...args);
}

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
//
// Если уже идёт звонок в ТОЙ ЖЕ комнате — не переподключается по сети,
// просто перепривязывает handlers к новому DOM (см. setHandlers) и сразу
// отдаёт текущее состояние через onConnectionStateChanged/onParticipantsChanged,
// чтобы voice.js сразу увидел актуальную картину. Это то, что происходит
// при возврате на голосовой экран звонка, который всё это время шёл в фоне.
export async function joinVoiceChannel(username, roomName, handlers) {
  if (room && currentRoomName === roomName) {
    activeHandlers = handlers;
    callHandler('onConnectionStateChanged', mapConnectionState(room.state));
    callHandler('onParticipantsChanged', collectParticipants(room));
    return room;
  }

  if (room) {
    await leaveVoiceChannel();
  }

  activeHandlers = handlers;
  callHandler('onConnectionStateChanged', 'connecting');

  let token, url;
  try {
    ({ token, url } = await fetchToken(username, roomName));
  } catch (err) {
    callHandler('onConnectionStateChanged', 'disconnected');
    callHandler('onError', err);
    return null;
  }

  const newRoom = new Room({
    adaptiveStream: true,
    dynacast: true
  });

  const emitParticipants = () => {
    callHandler('onParticipantsChanged', collectParticipants(newRoom));
  };

  // LiveKit SDK эмитит RoomEvent.Disconnected не только при разрыве УЖЕ
  // установленного соединения, но и внутренне — как часть собственной
  // очистки состояния — когда connect() вообще не смог подключиться (сеть
  // недоступна, токен отклонён и т.п.), причём ДО того, как промис
  // newRoom.connect() ниже успевает реджектиться в catch. Без этого флага
  // такой неудачный ПЕРВЫЙ коннект приводил к двойной реакции: onError
  // (из catch) и onRoomDisconnected → store.leaveVoice() (из этого
  // обработчика) — то есть пользователя откатывало с голосового экрана
  // обратно на текстовый канал при первой же сетевой ошибке, хотя реального
  // звонка, который можно было бы "потерять", ещё не было.
  let hasConnectedOnce = false;

  newRoom
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
      callHandler('onConnectionStateChanged', mapConnectionState(state));
    })
    .on(RoomEvent.Disconnected, () => {
      room = null;
      currentRoomName = null;
      callHandler('onConnectionStateChanged', 'disconnected');
      if (hasConnectedOnce) {
        // Тут звонок был реально установлен и теперь по-настоящему
        // разорван сервером/сетью (не нашим явным leave) — стор должен об
        // этом узнать, чтобы убрать плашку активного звонка, иначе она
        // будет показывать "висящий" звонок, которого уже нет.
        callHandler('onRoomDisconnected');
      }
      // Если hasConnectedOnce ещё false — это неудачная попытка ПЕРВОГО
      // подключения; onError из catch-блока ниже уже сообщит об ошибке,
      // а store трогать не нужно: activeVoiceChannelId был выставлен самим
      // кликом по каналу (см. store.selectChannel) и должен остаться —
      // человек всё ещё "смотрит" на этот голосовой экран, просто пока
      // не подключился, и имеет право увидеть баннер ошибки и повторить.
    });

  try {
    await newRoom.connect(url, token);
  } catch (err) {
    callHandler('onConnectionStateChanged', 'disconnected');
    callHandler(
      'onError',
      new VoiceConnectionError('room_connect_failed', describeConnectError(err))
    );
    return null;
  }

  hasConnectedOnce = true;
  room = newRoom;
  currentRoomName = roomName;

  try {
    await room.localParticipant.setMicrophoneEnabled(true);
  } catch (err) {
    // Не разрываем звонок из-за отказа в доступе к микрофону — человек
    // может слушать без права говорить (например, запретил доступ ОС).
    callHandler(
      'onError',
      new VoiceConnectionError(
        'microphone_unavailable',
        'Не удалось включить микрофон. Проверьте разрешения приложения на доступ к микрофону в настройках системы.'
      )
    );
  }

  callHandler('onConnectionStateChanged', 'connected');
  emitParticipants();

  return room;
}

// Перепривязывает обработчики к уже идущему звонку без переподключения —
// используется, когда DOM голосового экрана пересоздался (вернулись на
// него из фона), но сам LiveKit Room не трогаем.
export function setHandlers(handlers) {
  activeHandlers = handlers;
}

// Отписывает текущие обработчики, ничего не меняя в самом соединении —
// используется, когда уходим с голосового экрана, но звонок остаётся идти
// в фоне: DOM-колбэки больше не нужны (экрана, который их слушал, нет),
// но Room и публикация микрофона должны продолжаться как есть.
export function clearHandlers() {
  activeHandlers = {};
}

export async function leaveVoiceChannel() {
  if (!room) return;
  const r = room;
  room = null;
  currentRoomName = null;
  activeHandlers = {};
  try {
    await r.disconnect();
  } catch (e) {
    // игнорируем — мы и так уходим из комнаты
  }
}

export function getCurrentRoom() {
  return room;
}

export function getCurrentRoomName() {
  return currentRoomName;
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
    case ConnectionState.SignalReconnecting:
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
