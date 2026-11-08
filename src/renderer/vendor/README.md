# vendor/

Сторонние ESM-бандлы, подключаемые renderer'ом напрямую через
`<script type="module">`, без бандлера (webpack/vite) и без require().

Electron-рендерер здесь запущен с `contextIsolation: true` и
`nodeIntegration: false` (см. `src/main/main.js`) — это намеренная настройка
безопасности, и её не меняли ради SDK. Поэтому голый `import 'livekit-client'`
(стиль Node.js resolution) в renderer не работает: браузерный ES-модуль не
умеет резолвить имена npm-пакетов, только относительные/абсолютные пути и URL.
Решение — класть готовый browser-ESM-дистрибутив пакета сюда и импортировать
по относительному пути.

## livekit-client.esm.mjs

Источник: `node_modules/livekit-client/dist/livekit-client.esm.mjs`
(пакет `livekit-client`, версия зафиксирована в корневом `package.json`).

Если обновляете версию `livekit-client` в `package.json`:

```bash
npm install
cp node_modules/livekit-client/dist/livekit-client.esm.mjs src/renderer/vendor/livekit-client.esm.mjs
cp node_modules/livekit-client/dist/livekit-client.esm.mjs.map src/renderer/vendor/livekit-client.esm.mjs.map
```

Файл не редактируется вручную — любые правки потеряются при следующем
обновлении.
