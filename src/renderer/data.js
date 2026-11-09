// ============================================================================
// Voice Nexus — демонстрационные данные.
// Это не настоящий бэкенд: локальный мок-стейт, на котором отрабатывает
// вся навигация и интерактив интерфейса (серверы → каналы → чат → голос).
// ============================================================================

const AVATAR_COLORS = ['#FF6B5E', '#5EC6FF', '#9B7EFF', '#4ADE80', '#FFB648', '#FF8FB1'];

function initials(name) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function makeUser(id, name, colorIndex) {
  return {
    id,
    name,
    initials: initials(name),
    color: AVATAR_COLORS[colorIndex % AVATAR_COLORS.length]
  };
}

// Единственный встроенный пользователь — это ты сам, под логином, который
// ввёл на экране входа (setCurrentUsername ниже). Раньше здесь были ещё
// пять придуманных людей (Аня/Макс/Ира/Ольга/Глеб) с собственной перепиской
// для демонстрации вёрстки — их убрали: они создавали впечатление, что в
// приложении кто-то есть, хотя кроме тебя никого не было. Когда к голосовому
// каналу через LiveKit подключится реальный человек под своим логином, его
// карточка соберётся на лету в voice.js (см. resolveUser), этот список
// расширять для этого не нужно.
export const USERS = {
  me: makeUser('me', 'Ты', 0)
};

// Вызывается после экрана регистрации/входа: подставляет введённый логин
// вместо заглушки "Ты", чтобы в user-card и подписи сообщений было видно
// то имя, которое человек сам ввёл в форме.
export function setCurrentUsername(username) {
  if (!username) return;
  USERS.me.name = username;
  USERS.me.initials = initials(username.length >= 2 ? username.slice(0, 2) : username);
}

export const SERVERS = [
  {
    id: 's1',
    name: 'Voice Nexus HQ',
    shortName: 'VN',
    unread: true,
    channelGroups: [
      {
        id: 'text',
        label: 'Текстовые',
        type: 'text',
        channels: [
          { id: 'general', name: 'general', unread: 2 },
          { id: 'memes', name: 'memes', unread: 0 },
          { id: 'feedback', name: 'feedback', unread: 0 }
        ]
      },
      {
        id: 'voice',
        label: 'Голосовые',
        type: 'voice',
        // "members" у голосовых каналов здесь не нужен: реальный список
        // участников звонка приходит из LiveKit (см. livekit.js
        // collectParticipants), а не из этих демо-данных.
        channels: [
          { id: 'lounge', name: 'lounge' },
          { id: 'studio', name: 'studio' }
        ]
      }
    ]
  },
  {
    id: 's2',
    name: 'Ночная студия',
    shortName: 'НС',
    unread: false,
    channelGroups: [
      {
        id: 'text',
        label: 'Текстовые',
        type: 'text',
        channels: [{ id: 'general-2', name: 'general', unread: 0 }]
      },
      {
        id: 'voice',
        label: 'Голосовые',
        type: 'voice',
        channels: [{ id: 'jam', name: 'jam-session' }]
      }
    ]
  },
  {
    id: 's3',
    name: 'Книжный клуб',
    shortName: 'КК',
    unread: false,
    channelGroups: [
      {
        id: 'text',
        label: 'Текстовые',
        type: 'text',
        channels: [{ id: 'general-3', name: 'general', unread: 0 }]
      }
    ]
  }
];

// Список участников (правая панель) — по той же причине, что и USERS выше,
// здесь больше нет придуманных людей. Единственный реальный участник
// приложения — USERS.me, но он не показывается в списке "соседей по
// серверу" (так и было в исходной вёрстке, см. renderMembers в
// components/members.js: цикл идёт по MEMBERS_BY_PRESENCE, а не по USERS).
export const MEMBERS_BY_PRESENCE = {
  online: [],
  idle: [],
  dnd: [],
  offline: []
};

// Сообщения по каналам: id канала → массив сообщений. Демо-переписка
// придуманных людей убрана вместе с ними — каналы просто пусты, пока
// реальный человек сам что-то не напишет (см. "Пока тихо" в chat.js).
export const MESSAGES = {
  general: [],
  memes: [],
  feedback: [],
  'general-2': [],
  'general-3': []
};
