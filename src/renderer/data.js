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
        channels: [
          {
            id: 'lounge',
            name: 'lounge',
            members: ['anya', 'max', 'ira']
          },
          { id: 'studio', name: 'studio', members: [] }
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
        channels: [{ id: 'jam', name: 'jam-session', members: [] }]
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

export const MEMBERS_BY_PRESENCE = {
  online: ['anya', 'max', 'ira'],
  idle: [],
  dnd: [],
  offline: ['olga', 'gleb']
};

// Сообщения по каналам: id канала → массив сообщений
export const MESSAGES = {
  general: [
    {
      id: 'm1',
      authorId: 'anya',
      time: '14:02',
      text: 'Го сегодня в lounge в 8? 🎮',
      reactions: [
        { emoji: '😂', count: 3 },
        { emoji: '🔥', count: 1 }
      ]
    },
    {
      id: 'm2',
      authorId: 'max',
      time: '14:05',
      text: 'да го! закину пресет для стрима',
      attachment: { name: 'preset_stream_v3.zip', size: '2.4 MB' }
    },
    {
      id: 'm3',
      authorId: 'ira',
      time: '14:11',
      text: 'о красиво, кину потом фидбек по звуку',
      reactions: [{ emoji: '👍', count: 2 }]
    }
  ],
  memes: [
    {
      id: 'm4',
      authorId: 'max',
      time: '11:20',
      text: 'нашёл идеальный мем для нашего чата'
    }
  ],
  feedback: [],
  'general-2': [
    {
      id: 'm5',
      authorId: 'olga',
      time: 'вчера',
      text: 'как прошла джем-сессия?'
    }
  ],
  'general-3': []
};
