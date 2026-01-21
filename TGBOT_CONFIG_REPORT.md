# Отчет: диагностика ошибки выдачи конфигурации в Telegram-боте

## Объем анализа

Источники:
- `logs/tgbot/combined.log`
- `logs/tgbot/error.log`
- `logs/getWireguardConfigurations.devtools`

Компоненты:
- tgbot: обработчик `/getconfig`, клиент WGDashboard API, клиент service-manager
- wgdashboard: REST API и состояние конфигурации `wg0`

## Хронология (по логам tgbot)

Повторяющийся сценарий `/getconfig`:
- `2026-01-21 12:56:54` — создание peer
- `2026-01-21 12:56:57` — серия попыток скачать конфиг (404/400)
- `2026-01-21 12:56:58` — ошибка: `Failed to download peer config`

Аналогично повторяется:
- `2026-01-21 13:07:20–13:07:24`
- `2026-01-21 13:23:36–13:23:40`

## Классификация проблем

### Critical (блокирует основной сценарий)
- `Failed to download peer config` — бот не может выдать .conf пользователю.

### High (корневая причина)
- Некорректное определение `peerId`: в логах `peerId` совпадал с `PublicKey` интерфейса `wg0`, а не peer.

## Корневая причина

В `WGDashboardService.getPeers()` в одном из fallback-эндпоинтов мог возвращаться список конфигураций интерфейсов (например, результат `getWireguardConfigurations`). Такой список по структуре содержит поля `Name/ListenPort/Protocol/PublicKey/TotalPeers`.

Из-за этого интерфейсный `PublicKey` ошибочно воспринимался как `peerId`, а затем `downloadPeerConfig(peerId)` выполнялся по неправильному идентификатору и закономерно получал 404/400.

Подтверждение:
- В `logs/getWireguardConfigurations.devtools` `PublicKey` для `wg0` совпадает с `peerId` в tgbot логах.

## Реализованные изменения

### 1) Исправление классификации ответов в getPeers

Файл: `tgbot/src/services/wgdashboard.service.ts`
- Добавлена детекция «список конфигураций интерфейсов ≠ список peers» и игнорирование таких ответов.
- Убраны кандидаты, заведомо возвращающие конфиги интерфейсов, из цепочки получения peers.

Код: `getPeers` и `extractPeersFromResponse` в [wgdashboard.service.ts](file:///c:/Users/User/Desktop/corpWG/tgbot/src/services/wgdashboard.service.ts)

### 2) Укрепление addPeer

Файл: `tgbot/src/services/wgdashboard.service.ts`
- Улучшено извлечение peer из ответа `addPeers` (учитываются варианты, когда `data` является массивом).
- Добавлено предупреждение при невозможности извлечь `peerId` из ответа и переходе на fallback по списку peers.
- Убрано подробное логирование полного ответа `addPeers` (чтобы не выводить чувствительные поля).

Код: [wgdashboard.service.ts](file:///c:/Users/User/Desktop/corpWG/tgbot/src/services/wgdashboard.service.ts)

### 3) Стабилизация получения .conf и повторные попытки

Файл: `tgbot/src/services/wgdashboard.service.ts`
- `downloadPeerConfig` выполняет повторные попытки и логирует список `attempts` (URL, HTTP статус, фрагмент тела).
- Для query-параметров используется только URI-encoded вариант `peerId` (исключены 400 из-за `+` и `/`).
- Добавлен fallback: если download-эндпоинты недоступны, берется `peer.config` из списка peers.

Код: [wgdashboard.service.ts](file:///c:/Users/User/Desktop/corpWG/tgbot/src/services/wgdashboard.service.ts)

Файл: `tgbot/src/handlers/config.handler.ts`
- Если `peer.config` уже присутствует и содержит `[Interface]`, используется напрямую без скачивания.
- Добавлено логирование источника конфига (`peer` или `api`) и длины строки.

Код: [config.handler.ts](file:///c:/Users/User/Desktop/corpWG/tgbot/src/handlers/config.handler.ts)

### 4) Улучшение логирования

Файл: `tgbot/src/handlers/config.handler.ts`
- Добавлено логирование этапов: начало скачивания, источник результата, length.

Файл: `tgbot/src/services/wgdashboard.service.ts`
- Добавлено debug-логирование успешного кандидата `getPeers`.

## Результаты тестирования

Локально в `tgbot`:
- `npm test` — успешно
- `npm run build` — успешно

Добавлены/обновлены тесты:
- `tgbot/src/services/wgdashboard.service.test.ts` — покрытие: игнорирование конфигов интерфейсов, fallback по peers, базовые сценарии.
- `tgbot/src/handlers/config.handler.test.ts` — покрытие: использование `peer.config` без запроса download.

## Рекомендации по эксплуатации и профилактике

1) Не использовать эндпоинты «update configuration» без понимания merge/replace семантики: есть риск перезаписать `wg0.conf` без `[Peer]`.
2) Для peerId всегда применять `encodeURIComponent` при формировании URL, особенно для base64 ключей (наличие `+` и `/`).
3) Для диагностики окружения держать быстрый smoke-check:
   - `GET /api/getWireguardConfigurations` (с API key) — проверка `ListenPort/Status/TotalPeers`.
4) Если download-эндпоинты WGDashboard недоступны (404), опираться на `peer_config` из peer-list или из ответа `addPeers`.

## Деплой и проверка после обновления

На сервере:
- `docker-compose build --no-cache tgbot`
- `docker-compose up -d tgbot`

Проверка:
- вызвать `/getconfig`
- убедиться, что в `logs/tgbot/error.log` отсутствует `Failed to download peer config`
- убедиться, что `peerId` в `combined.log` не совпадает с `wg0` `PublicKey`

