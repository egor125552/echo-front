# Запуск, проверка и изменение Echo Front

Это руководство относится к текущему репозиторию на MacBook; изменения в файлах сами по себе не означают, что опубликованный сайт уже обновлён.

## Локальный запуск

Нужны Node.js, npm и зависимости из `package.json`. В корне проекта выполните `npm install` (если зависимости не установлены), затем `npm run dev`. Команда запускает Wrangler и локальный Cloudflare Worker. Адрес берите из вывода Wrangler, не считайте порт постоянным. `npm run deploy` публикует Worker; выполнять его нужно отдельно и только после проверки нужной ветки и Cloudflare-окружения.

`src/index.js` отдаёт `/api/health`, `/api/runtime-probe`, `/api/play` (WebSocket), диагностические и ограниченные управляющие маршруты. Статика лежит в `public/`. Комнату, режим и признак обучения клиент передаёт при WebSocket-подключении. Для обычной игры используется комната `public`, для обучения — индивидуальная `tutorial-<идентификатор сессии>`.

Токены Engine Lab, приватные настройки среды и пользовательские журналы не сохраняйте в Git. В обычной публикации Engine Lab не должен быть открыт без отдельной авторизации.

## Куда вносить изменения

Игровые правила и авторитетные состояния — `src/plugins/` и серверные пресеты в `src/presets/`; состав комнаты — `src/server/`. Клавиатура и сенсорное управление — `public/client/plugins/input.js`, дополнительные жесты — `iphone-gestures.js`, поворот взгляда — `keyboard-camera-turn.js`. Меню и карта — `accessible-menus.js`; речь обучения — `tutorial-guide.js`. Встроенная текстовая справка — `public/index.html`.

При замене действия проверьте одновременно клавиатуру, телефон с VoiceOver и без него, геймпад, меню, подсказки, сетевые подтверждения, звук и повторное подключение. Не удаляйте непроверенные изменения других участников: перед работой посмотрите `git status` и различия текущей ветки.

## Как проверять

Основное правило проекта — [ENGINE_CONTROL_TESTING.md](ENGINE_CONTROL_TESTING.md): поведение механики подтверждается выполнением сценария через Engine Control над реальным игровым runtime. [ENGINE_LAB.md](ENGINE_LAB.md) описывает изолированный интерактивный сценарий через настоящий Worker, игровые модули и Rapier.

Команда `npm test` в текущем `package.json` запускает проверки клиентского ввода, парашюта и учебные сценарии Engine Lab. Название команды не означает, что она проверяет все механики, реальные наушники, VoiceOver, физическую игру пять минут или задержку Cloudflare. Сценарии, запускающие настоящий Engine Lab, дают серверные наблюдения только в охваченных ими условиях; проверки чистых функций подтверждают лишь их локальную логику.

Для изменения управления вручную пройдите игру с клавиатуры и на телефоне, включая VoiceOver и поворот/остановку; для звуков пройдите отдельный матч на слух. Для транспорта и ботов наблюдайте длинный матч в Engine Lab и отдельно реальный браузер. При плохом соединении проверьте, что устаревшее состояние или уведомление не воспроизводятся после восстановления сети.

`/api/health` говорит только о доступности Worker и включённых диагностических режимах. `/api/runtime-probe` проверяет создание настоящего игрового runtime, подключение пробного игрока и один игровой шаг; он не подтверждает, что сложные сценарии работают.

## Документация при изменении механики

После обновления игры синхронизируйте [руководство игрока](PLAYER_GUIDE.md), встроенную Справку по управлению в `public/index.html`, инструкции `tutorial-guide.js`, вступительную озвучку `announcer.js` и описание технических модулей. Если меняется путь звука или его назначение, обновите [AUDIO.md](AUDIO.md). Не оставляйте игроку инструкцию нажимать скрытую кнопку или клавишу на телефоне.


## Компактные сетевые снимки

Браузерный клиент запрашивает `snapshotProtocol=delta-v1` при подключении через
WebSocket. Приветствие `welcome` содержит полный снимок, затем сообщения
`snapshot-delta` передают только изменившиеся значения. Поля не округляются:
после восстановления клиент получает тот же JSON, что и при полной передаче.
При переподключении или потере базового состояния отправляется новый полный
снимок. Старые клиенты без этого параметра получают обычный `snapshot`.

Проверка формата: `npm run check:network-snapshot`. Сравнение объёма сети
и задержек необходимо проводить на настоящем Worker с живыми клиентами;
это не заменяет сценарии Engine Control и аудиопроверку на iPhone.


## Нагрузка CPU при большом матче

Рассылка персональных снимков для десятков участников выполняется синхронно.
При одном тике для всех слушателей совпадают базовые сведения о других
персонажах и состояние автопарка. В `MatchRoom.broadcastSnapshot` они
переиспользуются только во время этой рассылки и сбрасываются в `finally`.
Обычная игровая симуляция, команды и Engine Control не кэшируются.

Список ориентиров навигации вычисляет состояние безопасной зоны один раз
на список целей, а не отдельно для каждой точки.

`npm run check:network-snapshot` проверяет побитово точное восстановление
изменений и соответствие снимков с временным кэшем и без него, включая
сброс кэша после ошибки. При изменении поведения снимков, навигации или
транспорта прогоняйте эти проверки и реальные Engine Lab сценарии.

Замеры на Linux с 50 подключениями и 30 сгруппированными машинами
показали экономию CPU, но не гарантируют 20 обновлений в секунду
под предельной нагрузкой. Не уменьшайте физический тик и не пропускайте
пространственные звуки ради увеличения этого числа без проверки игровых
последствий.


## CPU performance: one human, 95 bots, clustered vehicles

Run `npm run profile:bot-car-pileup` on an isolated Linux clone to
reproduce one human, 95 live bots, 35 real Rapier cars gathered at a single
location, and up to 28 AI drivers. The fixture initially boards bots at
their original car spawn points so nearby combat does not cancel the
approach phase, then moves the real physical chassis into a deliberate
traffic pileup. It measures game-step time, actual Rapier collision and
query calls, and how many bots continue to drive. This is an intentionally
extreme fixture, not an artificially simplified collision model or a
production admin endpoint.

`CPU_BASELINE_TRAFFIC=1 npm run profile:bot-car-pileup` forces the former
full-vehicle-state path for an A/B comparison on the same build, without
changing physics or the bot decisions.

Optimization rules:
- The warehouse doorway override does **not** need a visibility scan for
  bots outside the warehouse; these bots cannot enter that override.
- Battle-royale awareness orders candidates by the same exact score,
  performs real Rapier sight tests, and stops only when enough visible
  candidates have been obtained.
- The raycast character broad-phase skips a collider only when a
  conservative capsule-enclosing sphere mathematically cannot touch the
  ray. Actual intersections still use the same Rapier collider cast.
- Vehicle traffic AI uses exactly the same positions, velocities, angles,
  speeds and driver occupancy as full snapshots; it no longer reads each
  wheel's telemetry for all cars. Full vehicle snapshots and physical
  wheel controllers remain intact.
- Driver-limit counting reads existing chassis IDs directly instead of
  producing full wheel states.

Run `npm run check:bot-car-cpu` to compare the traffic fields and bot
target priority/occlusion against the old complete implementations and
verify broad-phase rejection against native Rapier intersections.
Never interpret a single fast timing as guaranteed 20 Hz under all loads.

## Cloudflare Engine Lab car-pileup load test

Engine Lab now supports `scenario.pileup` for isolated, authenticated Battle
Royale rooms. It uses the **real** game engine and Rapier world. It connects
one human (leaving 95 bots), assigns 28 bots to cars, simulates their entry
(typically 27 actual drivers), then clusters 35 of 76 real car chassis.
`scenario.pileup-summary` reports live nearby chassis, current bot drivers,
traffic events and release reasons after each experiment.

Call `scenario.create`, `scenario.pileup` with `oldTraffic: false` or `true`,
`scenario.start`, `scenario.advance` in chunks, and finally
`scenario.pileup-summary`. The `oldTraffic: true` A/B branch disables *only*
the two car-traffic CPU optimizations in that test room. Physics frequency,
Rapier collision shapes, driver AI and live wheel controllers remain the same.
`scenario.pileup` rejects non-Battle-Royale modes and rooms whose scenario
has already started. The existing `/api/engine-lab` token gate and isolated
Durable Object room selection still apply. Do not enable the lab without its
strong private token, and do not use the public game room for stress testing.

Run `npm run check:engine-lab-car-pileup` to verify both test variants locally.
For actual Cloudflare measurements, use a dedicated Worker deployment with
`ENGINE_LAB_TOKEN` configured privately, then run:

`node scripts/cloud-pileup-engine-lab.mjs https://YOUR-LAB.workers.dev /path/to/private-token-file 30`

Every round performs 10 game steps at the existing 50 ms simulation delta.
The script alternates cases and reports observed vehicle counts, driver
release reasons, failures, and end-to-end request time. For actual CPU time
on Cloudflare, inspect Durable Object invocation `cpuTime` through Wrangler
real-time logs or Workers observability; network response time is **not**
a substitute for CPU time and Worker JS wall-clock timers are frozen during
synchronous execution.
