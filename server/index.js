// ============================================================================
// Voice Nexus — токен-сервер.
//
// Единственная задача: по запросу клиента (Electron-приложения) выдать
// короткоживущий подписанный JWT-токен для подключения к конкретной
// LiveKit-комнате (голосовому каналу). API_SECRET используется здесь,
// на сервере, для подписи — и никогда не уходит клиенту.
//
// Этот процесс должен работать отдельно от Electron-приложения, в интернете,
// 24/7 (например, на Render/Railway/Fly.io) — не на компьютере пользователя.
// ============================================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { AccessToken } = require('livekit-server-sdk');

const {
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  PORT = 4000
} = process.env;

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error(
    '[voice-nexus-server] Не заданы LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET.\n' +
    'Создайте server/.env на основе server/.env.example.'
  );
  process.exit(1);
}

const app = express();
app.use(cors()); // в проде лучше сузить до origin приложения
app.use(express.json());

// Имя пользователя: буквы/цифры/подчёркивание, 3-16 символов —
// то же правило, что и в клиентской форме регистрации (auth.js).
const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

// Имя комнаты: id голосового канала из data.js, например "general-voice".
// Разрешаем буквы/цифры/дефис/подчёркивание, не длиннее 64 символов.
const ROOM_RE = /^[a-zA-Z0-9_-]{1,64}$/;

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'voice-nexus-token-server' });
});

// POST /token  { username, room }  →  { token, url }
app.post('/token', async (req, res) => {
  const { username, room } = req.body || {};

  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: 'invalid_username',
      message: 'username должен быть 3-16 символов: латиница, цифры, подчёркивание'
    });
  }

  if (typeof room !== 'string' || !ROOM_RE.test(room)) {
    return res.status(400).json({
      error: 'invalid_room',
      message: 'room должен быть непустой строкой (буквы/цифры/-/_), до 64 символов'
    });
  }

  try {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: username,
      // короткий TTL: это токен на один заход в канал, а не на сессию целиком
      ttl: '10m'
    });

    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    const token = await at.toJwt();

    res.json({ token, url: LIVEKIT_URL });
  } catch (err) {
    console.error('[voice-nexus-server] Ошибка генерации токена:', err);
    res.status(500).json({ error: 'token_generation_failed' });
  }
});

app.listen(PORT, () => {
  console.log(`[voice-nexus-server] Токен-сервер запущен на порту ${PORT}`);
  console.log(`[voice-nexus-server] LiveKit URL: ${LIVEKIT_URL}`);
});
