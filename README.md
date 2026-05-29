# VPN/Proxy SaaS — Telegram-native платформа

Подписочная SaaS-платформа доступа к распределённой VPN/Proxy инфраструктуре с Telegram-ботом, автоматической балансировкой серверов, реферальной системой, платежами Telegram и web админ-панелью.

Реализованы все 4 фазы ТЗ: trial-система, подписки, Server Manager + AUTO-балансировка, генератор конфигов (vless/xray), платежи (Telegram Stars), рефералы (+7 дней), уведомления (T-3 / T-1 / expired) и admin panel с аналитикой.

## Стек

- **Backend**: Node.js + TypeScript, Express, Prisma ORM, PostgreSQL
- **Bot**: Telegraf (long polling)
- **Jobs**: node-cron
- **Admin**: React + Vite + TailwindCSS + lucide-react
- **Auth**: JWT (user + admin), Telegram Mini App `initData` HMAC-валидация

## Структура

```
windsurf-project/
├── backend/              # API + Telegram bot + cron jobs
│   ├── prisma/           # schema.prisma + seed.ts
│   └── src/
│       ├── services/     # user, subscription, serverManager, loadBalancer,
│       │                 # referral, notification, accessGenerator, payment
│       ├── routes/       # auth, subscription, servers, access, referral, payments, admin
│       ├── middleware/   # auth (JWT), error handling
│       ├── bot/          # Telegraf main menu flow
│       ├── jobs/         # cron: reminders, expiry, health
│       └── index.ts      # entry point
├── admin/                # React admin panel (dashboard, servers, users)
└── docker-compose.yml    # PostgreSQL
```

## Быстрый старт

### 1. База данных

```bash
docker compose up -d        # поднимает PostgreSQL на :5432
```

### 2. Backend

```bash
cd backend
cp .env.example .env         # заполните TELEGRAM_BOT_TOKEN и пр.
npm install
npm run prisma:migrate -- --name init   # создаёт таблицы
npm run prisma:seed          # bootstrap-админ + демо-серверы
npm run dev                  # API на http://localhost:4000, бот стартует автоматически
```

> Бот запускается только если задан `TELEGRAM_BOT_TOKEN`. Без него API и админка работают, бот пропускается.

### 3. Admin panel

```bash
cd admin
npm install
npm run dev                  # http://localhost:5173 (проксирует /api -> :4000)
```

Логин по умолчанию: `admin@example.com` / `admin12345` (см. `.env`).

## API (основные эндпоинты)

| Метод | Путь | Доступ | Описание |
|-------|------|--------|----------|
| POST | `/api/auth/telegram` | public | Валидация initData, выдача JWT |
| POST | `/api/subscription/trial` | user | Старт trial (14 дней) |
| POST | `/api/subscription/create` | user | Создать инвойс на оплату |
| POST | `/api/subscription/renew` | user | Продление |
| GET  | `/api/subscription/status` | user | Статус подписки |
| POST | `/api/access/generate` | user | Выдать ключ (AUTO или конкретный сервер) |
| GET  | `/api/access/config` | user | Текущая конфигурация |
| GET  | `/api/servers/list` | user | Серверы для ручного выбора |
| POST | `/api/servers/add` | admin | Добавить сервер |
| POST | `/api/servers/remove` | admin | Удалить сервер |
| GET  | `/api/servers/health` | admin | Health-снимок |
| GET  | `/api/referral/code` | user | Реферальная ссылка |
| GET  | `/api/referral/stats` | user | Статистика рефералов |
| POST | `/api/payment/create` | user | Создать платёж |
| POST | `/api/payment/webhook` | provider | Подтверждение оплаты (webhook only) |
| POST | `/api/admin/login` | public | Вход в админку |
| GET  | `/api/admin/analytics` | admin | Метрики платформы |
| GET  | `/api/admin/users` | admin | Поиск/пагинация пользователей |
| POST | `/api/admin/users/:id/extend` | admin | Продлить подписку |
| POST | `/api/admin/users/:id/ban` | admin | Бан/разбан |

## Бизнес-логика

- **AUTO Select**: фильтр `active`/`warm` и `current_users < capacity` → сортировка по нагрузке и стабильности → лучший сервер. `full`/`offline` исключаются.
- **Server status**: пересчитывается автоматически — `full` при заполнении, `warm` при ≥80%, иначе `active`.
- **Trial**: 14 дней, один раз на пользователя.
- **Рефералы**: +7 дней инвайтеру, защита от само-реферала, дубликатов и спама (дневной лимит).
- **Device binding**: 1 пользователь = 1 активное устройство (hash-fingerprint).
- **Платежи**: активация подписки только через webhook / `successful_payment`.
- **Уведомления**: cron рассылает напоминания за 3 дня, 1 день и при истечении.

## Интеграция с VPN-нодами

`src/services/accessGenerator.ts` строит валидные `vless://` reality-ссылки и содержит хук `provisionOnNode()` для вызова API панели (Xray/Hiddify) — подставьте реальный HTTP-вызов к `server.apiUrl`. Поля ноды (`apiUrl`, `apiSecret`, `publicKey`, `sni`) хранятся в таблице `servers`.

## Production

- Замените bot long polling на webhook при деплое за reverse-proxy.
- Установите сильные `JWT_SECRET`, смените дефолтный пароль админа.
- Для Telegram Stars `TELEGRAM_PAYMENT_PROVIDER_TOKEN` оставьте пустым (валюта `XTR`); для фиатных платежей укажите токен провайдера из @BotFather.
