# GIVKOIN: безопасная база для SOLID-рефакторинга

Дата снимка: 2026-05-15.

Цель этого файла - зафиксировать текущее рабочее состояние проекта перед постепенным рефакторингом. Рефакторинг должен улучшать внутреннее устройство, но не менять поведение сайта, админки и сервера.

## Что нельзя менять без отдельного решения

- Публичные серверные маршруты: `/auth`, `/battles`, `/news`, `/referrals`, `/ads`, `/fortune`, `/night-shift`, `/tree`, а также все админские маршруты.
- Публичные страницы фронтенда: главная, бой, новости, дерево, кабинет, фортуна, чат, мосты, галактика, практики, Night Shift, магазин, правила, roadmap, about.
- Имена полей в ответах сервера и данных базы: `_id`, `createdAt`, `updatedAt`, `userId`, `battleId`, `syncSlot`, `syncSlotCount`, `attendanceCount`, `scenario`, `timeLeftMs` и уже используемые поля наград, K, Lumens, Stars.
- Таблицу документов Supabase: `app_documents` или значение из `SUPABASE_TABLE`.
- Переменные окружения, которые уже используются проектом.
- Внешний вид страниц и админки, если конкретная задача не просит менять интерфейс.

## Главные части проекта

- `backend` - сервер Express, маршруты, контроллеры, сервисы, работа с Supabase и сокетами.
- `frontend` - пользовательский сайт на Next.js.
- `admin-panel` - админка на Vite + React.
- `docs` - рабочие документы проекта.

## Серверные маршруты

Текущие файлы маршрутов лежат в `backend/src/routes`:

- `auth.js`, `admin.js`, `adminCmsV2.js`, `adminV2.js`
- `battles.js`, `battle` логика в контроллере и сервисах
- `news.js`, `ads.js`, `adBoosts.js`, `referrals.js`, `fortune.js`
- `activity.js`, `nightShiftRoutes.js`, `practice.js`, `meditation.js`
- `entity.js`, `wishes.js`, `bridges.js`, `tree.js`, `solar.js`
- `chats.js`, `match.js`, `appeals.js`, `feedback.js`
- `achievements.js`, `chronicle.js`, `crystal.js`, `dailyStreak.js`, `economy.js`, `evilRoot.js`, `meta.js`, `notifications.js`, `pages.js`, `quotes.js`, `radiance.js`, `shop.js`, `warehouse.js`

## Разделы админки

Главный список разделов сейчас находится в `admin-panel/src/App.tsx`:

- Обзор, Центр контроля, Системные операции
- Пользователи, Админы, Контент, Правила, О нас, Дорожная карта
- Апелляции, Желания, Мосты, Бои, ТНД, Рефералы
- Сущности, Реклама, Ночные Стражи, Кристалл, Фортуна
- Практика, Обратная связь, Настройки, Логи

При разделении админки ключи разделов менять нельзя: `dashboard`, `control`, `cms`, `users`, `admins`, `content`, `rules`, `about`, `roadmap`, `appeals`, `wishes`, `bridges`, `battles`, `tnd`, `referrals`, `entities`, `ads`, `night_guardians`, `crystal`, `fortune`, `practice`, `feedback`, `settings`, `logs`.

## Самые тяжёлые файлы на старте

- `admin-panel/src/App.tsx` - 6749 строк.
- `frontend/src/components/tree/TreeLayer.tsx` - 6120 строк.
- `backend/src/controllers/adminCmsV2Controller.js` - 4357 строк.
- `backend/src/controllers/authController.js` - 3961 строк.
- `backend/src/controllers/fortuneController.js` - 3410 строк.
- `frontend/src/app/[locale]/battle/page.tsx` - 3064 строки.
- `backend/src/controllers/adminController.js` - 3020 строк.
- `backend/src/services/battleService.js` - 3018 строк.
- `backend/src/controllers/battleController.js` - 2863 строки.
- `backend/src/services/multiAccountService.js` - 2829 строк.

Эти файлы нельзя переписывать одним куском. Их нужно уменьшать постепенно: сначала выносить чистые помощники и отдельные разделы, потом проверять сборку и только после этого идти дальше.

## Безопасный порядок рефакторинга

1. Добавить проверки, которые ничего не меняют в работе проекта.
2. Разделять админку по одному разделу за раз.
3. На сервере сначала выносить общие помощники, потом уже переносить бизнес-логику.
4. Бой переносить только после появления проверок на расчёты и форматы ответов.
5. Фронтенд-страницы делить после серверных проверок, чтобы не потерять связь клиент-сервер.
6. Удалять только код, который точно нигде не используется.

## Минимальные проверки после каждого шага

- `git status --short`
- `npm run check` в `backend`
- `npm run build` в `admin-panel`, если тронута админка
- `npm run lint -- --file <путь>` во `frontend`, если тронут фронтенд-файл
- `npm run build` во `frontend` после крупного фронтенд-блока

Локальные dev-серверы не запускать без прямой просьбы.
