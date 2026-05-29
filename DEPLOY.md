# Инструкция по запуску на сервере (для новичка)

Сервер: **132.243.224.169** · Пользователь: **root** · ОС: **Ubuntu 24**
Тестовый бот: **testbotpod_bot**

> Делайте шаги строго по порядку. Команды просто копируйте и вставляйте.

---

## ШАГ 0. Что установить на свой компьютер (Windows)

Нужны 2 бесплатные программы:

1. **WinSCP** — чтобы перетаскивать файлы на сервер мышкой.
   Скачать: https://winscp.net/eng/download.php → кнопка «Download WinSCP».
2. **PowerShell** — уже встроен в Windows (значок есть в меню «Пуск»). В нём будем вводить команды на сервере. Отдельно ставить ничего не надо.

---

## ШАГ 1. Получить токен бота

1. Откройте Telegram, в поиске найдите **@BotFather**.
2. Отправьте ему команду `/mybots`.
3. Выберите бота **testbotpod_bot**.
4. Нажмите **API Token** → скопируйте длинную строку вида `8123456789:AAF...`.
5. Сохраните её в блокнот — пригодится в ШАГЕ 6.

---

## ШАГ 2. Подготовить файлы на компьютере

Чтобы загрузка прошла быстро и без ошибок, удалите тяжёлые служебные папки (они пересоздадутся на сервере сами):

1. Откройте проводник Windows, зайдите в папку проекта `windsurf-project`.
2. Удалите папку `backend\node_modules` (если есть).
3. Удалите папку `admin\node_modules` (если есть).
4. Удалите папку `admin\dist` (если есть).

> Эти папки удалять **безопасно** — это не ваш код, а скачанные библиотеки.

---

## ШАГ 3. Подключиться к серверу

1. Откройте **PowerShell** (меню Пуск → напишите «PowerShell» → Enter).
2. Введите команду и нажмите Enter:

   ```powershell
   ssh root@132.243.224.169
   ```

3. На вопрос «Are you sure...» напишите `yes` и Enter.
4. Введите пароль от сервера (при вводе пароль не виден — это нормально) и Enter.

Если увидели строку вида `root@...:~#` — вы на сервере. 👍

---

## ШАГ 4. Установить нужные программы на сервер

Скопируйте **весь блок целиком**, вставьте в PowerShell (правый клик мышью вставляет) и нажмите Enter. Установка займёт 3–5 минут.

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs nginx
npm install -g pm2
curl -fsSL https://get.docker.com | sh
```

Проверьте, что Node установился:

```bash
node -v
```

Должна появиться версия (например `v20.x.x`).

---

## ШАГ 5. Запустить базу данных

База данных будет работать через Docker (уже установлен в ШАГЕ 4). Папку с проектом мы зальём в ШАГЕ 6, но базу можно поднять одной командой позже. Пока просто переходите к ШАГУ 6.

---

## ШАГ 6. Загрузить файлы проекта на сервер (WinSCP)

1. Откройте программу **WinSCP**.
2. В окне входа заполните:
   - **File protocol**: `SFTP`
   - **Host name**: `132.243.224.169`
   - **Port number**: `22`
   - **User name**: `root`
   - **Password**: пароль от сервера
3. Нажмите **Login** (на предупреждение — **Yes**).
4. Откроется 2 панели: слева — ваш компьютер, справа — сервер.
5. Справа вверху в строке пути впишите `/root/` и нажмите Enter.
6. Слева найдите папку `windsurf-project` целиком.
7. **Перетащите** папку `windsurf-project` из левой панели в правую (в `/root/`).
8. Дождитесь окончания копирования.

После этого на сервере появится папка `/root/windsurf-project`.

---

## ШАГ 7. Настроить секретный файл (.env)

Вернитесь в **PowerShell** (где вы подключены к серверу) и выполните по очереди.

Перейти в папку backend:

```bash
cd /root/windsurf-project/backend
```

Поднять базу данных:

```bash
cd /root/windsurf-project && docker compose up -d && cd backend
```

Создать файл настроек. Скопируйте **весь блок**, но сначала замените `ВСТАВЬТЕ_ТОКЕН_БОТА` на токен из ШАГА 1:

```bash
cat > .env << 'EOF'
PORT=4000
NODE_ENV=production
PUBLIC_API_URL=http://132.243.224.169

DATABASE_URL=postgresql://vpn:vpn@localhost:5432/vpn_saas?schema=public

JWT_SECRET=ZAMENITE_NA_DLINNUYU_SLUCHAYNUYU_STROKU_12345
JWT_EXPIRES_IN=7d

TELEGRAM_BOT_TOKEN=8819187766:AAF4qj9nvCRJgud4fXwdAiU6L7fPHeIJUA8
TELEGRAM_BOT_USERNAME=testbotpod_bot
TELEGRAM_PAYMENT_PROVIDER_TOKEN=
MINI_APP_URL=http://132.243.224.169

TRIAL_DAYS=14
REFERRAL_REWARD_DAYS=7
REFERRAL_DAILY_LIMIT=10
DEVICE_LIMIT=1
GRACE_DAYS=2

PAYMENT_WEBHOOK_SECRET=
CORS_ORIGINS=
PROCESS_ROLE=all

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin12345
EOF
```

> ⚠️ **Обязательно вставьте реальный токен бота** вместо `ВСТАВЬТЕ_ТОКЕН_БОТА`.
> ⚠️ **`NODE_ENV=production` требует сильный `JWT_SECRET`** (минимум 16 символов) — иначе бэкенд не запустится.
> ⚠️ **`DEVICE_LIMIT=1`** ограничивает один VPN-ключ одним устройством (3x-ui `limitIp`).
> ⚠️ **`GRACE_DAYS=2`** — после истечения подписки ключ отключается (не удаляется) на 2 дня, чтобы продление восстановило доступ мгновенно.
> ⚠️ **`PROCESS_ROLE=all`** — для одного инстанса (API + бот + cron). Для масштабирования см. раздел ниже.
> Желательно также поменять `JWT_SECRET` на любой набор букв/цифр подлиннее.

---

## ШАГ 8. Установить и запустить backend (API + бот)

Выполняйте команды по очереди:

```bash
cd /root/windsurf-project/backend
npm install
npx prisma generate
npx prisma db push
npm run prisma:seed
npm run build
pm2 start dist/index.js --name vpn-backend
pm2 save
pm2 startup
```

После `pm2 startup` система выведет ещё одну команду — **скопируйте её, вставьте и нажмите Enter** (это нужно, чтобы всё само запускалось после перезагрузки сервера).

Проверка, что бот работает:

```bash
pm2 logs vpn-backend --lines 20
```

Если видите строки «API listening...» и «Telegram bot started» — backend и бот работают. ✅
Откройте Telegram, найдите **testbotpod_bot**, нажмите **/start** — бот должен ответить меню.

(Чтобы выйти из просмотра логов — нажмите `Ctrl + C`.)

---

## ШАГ 9. Собрать и опубликовать админ-панель

Собрать панель:

```bash
cd /root/windsurf-project/admin
npm install
npm run build
```

Скопировать готовую панель в веб-папку (nginx не имеет доступа к `/root`, поэтому используем `/var/www`):

```bash
mkdir -p /var/www/vpn-admin
cp -r /root/windsurf-project/admin/dist/* /var/www/vpn-admin/
```

> ⚠️ Если в будущем пересоберёте панель (`npm run build`) — обязательно повторите команду `cp` выше, иначе сайт покажет старую версию.

Настроить веб-сервер nginx (скопируйте весь блок):

```bash
cat > /etc/nginx/sites-available/vpn-admin << 'EOF'
server {
    listen 80;
    server_name 132.243.224.169;

    root /var/www/vpn-admin;
    index index.html;

    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri /index.html;
    }
}
EOF
ln -sf /etc/nginx/sites-available/vpn-admin /etc/nginx/sites-enabled/vpn-admin
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
```

---

## ШАГ 10. Открыть доступ и проверить

Открыть порты (если включён файрвол):

```bash
ufw allow 22
ufw allow 80
ufw --force enable
```

Теперь:

1. **Админ-панель**: откройте в браузере `http://132.243.224.169`
   - Логин: `admin@example.com`
   - Пароль: `admin12345`
2. **Бот**: в Telegram напишите **testbotpod_bot** команду `/start`.

Готово! 🎉

---

## Полезные команды (на будущее)

| Что нужно | Команда |
|-----------|---------|
| Посмотреть, работает ли backend | `pm2 status` |
| Посмотреть логи бота | `pm2 logs vpn-backend` |
| Перезапустить backend | `pm2 restart vpn-backend` |
| Остановить backend | `pm2 stop vpn-backend` |
| Перезапустить сайт-сервер | `systemctl restart nginx` |

## Если что-то пошло не так

- **Бот не отвечает** → проверьте токен в файле `.env` (ШАГ 7) и логи: `pm2 logs vpn-backend`. После правки `.env` выполните `pm2 restart vpn-backend`.
- **Сайт не открывается** → выполните `nginx -t` (покажет ошибку) и `systemctl restart nginx`.
- **Ошибка базы данных** → проверьте, что база поднята: `docker ps` (должна быть строка `vpn_saas_db`). Если нет — `cd /root/windsurf-project && docker compose up -d`.

> ⚠️ Это тестовая установка по IP без шифрования (http). Для реального запуска позже подключим домен и бесплатный SSL-сертификат — напишите, когда дойдёте до этого.

---

# ВЕРСИЯ 2.0 — реальный VPN через 3x-ui

В версии 2.0 бот создаёт **настоящих** пользователей на VPN-сервере с панелью **3x-ui** и выдаёт рабочие ключи. Ниже — как обновить проект и подключить VPN-сервер.

## ШАГ A. Обновить код на сервере до v2.0

1. Удалите на компьютере папки `backend\node_modules`, `admin\node_modules`, `admin\dist` (как в ШАГЕ 2).
2. Через WinSCP залейте обновлённую папку `windsurf-project` в `/root/` (с заменой файлов).
3. На сервере выполните по очереди:

```bash
cd /root/windsurf-project/backend
npm install
npx prisma generate
npx prisma db push
npm run build
pm2 restart vpn-backend
```

4. Пересоберите и обновите админку:

```bash
cd /root/windsurf-project/admin
npm install
npm run build
cp -r /root/windsurf-project/admin/dist/* /var/www/vpn-admin/
```

## ШАГ B. Что нужно на VPN-сервере

VPN-сервер — это **отдельный** сервер (не тот, где бот), на котором установлена панель **3x-ui** с настроенным inbound (рекомендуется **VLESS + Reality**).

Если 3x-ui ещё не настроен — в панели 3x-ui:

1. Создайте inbound: протокол **VLESS**, Security — **Reality**, Flow — **xtls-rprx-vision**.
2. Запомните **порт** этого inbound и его **ID** (число, видно в списке inbounds — обычно `1` для первого).
3. Убедитесь, что панель доступна по адресу вида `http://IP_VPN:2053/ВАШ_ПУТЬ/` и вы знаете **логин/пароль** входа.

> 💡 Адрес панели должен включать web base path, если он задан (3x-ui показывает его в настройках). Пример полного URL: `http://203.0.113.10:2053/abc123/`.

## ШАГ C. Подключить VPN-сервер в админке

1. Откройте админку → раздел **Серверы** → **Добавить**.
2. Заполните:
   - **Название** — любое (напр. `Netherlands-1`)
   - **IP сервера** — IP VPN-сервера (адрес, который попадёт в ключ)
   - **Регион** — напр. `NL`
   - **Лимит пользователей** — сколько клиентов держать на сервере
   - **URL панели** — полный адрес 3x-ui, напр. `http://203.0.113.10:2053/abc123/`
   - **Логин панели** / **Пароль панели** — данные входа в 3x-ui
   - **Inbound ID** — номер inbound (напр. `1`)
   - **Порт** — порт inbound (напр. `443`)
3. Нажмите **Создать сервер**. В списке у сервера появится зелёная пометка **«3x-ui подключён»**.

## ШАГ D. Проверка

1. В боте нажмите **Подписка** → купите тариф за ⭐ (или дождитесь триала).
2. Нажмите **Подключиться (AUTO)** — бот создаст клиента в 3x-ui и выдаст рабочую `vless://` ссылку.
3. Вставьте ссылку в приложение (v2rayNG / Hiddify / Streisand) — должно подключиться.
4. В панели 3x-ui в списке клиентов появится новый клиент с именем вида `tg<telegram_id>_xxxxxx`.

**Что происходит автоматически:**

- При покупке/продлении срок действия клиента в 3x-ui **продлевается**.
- При истечении подписки клиент **удаляется** из панели (раз в 15 мин).
- Если панель недоступна — сервер помечается **offline** и не выдаётся пользователям (проверка раз в 5 мин).
- В разделе **Мой статус** бот показывает израсходованный трафик.

## Если ключ не выдаётся

- В боте появляется «Не удалось создать ключ на сервере» → смотрите точную причину: `pm2 logs vpn-backend`. Частые причины:
  - неверный **URL панели** (должен быть с http:// и правильным путём),
  - неверный **логин/пароль** панели,
  - неверный **Inbound ID**,
  - VPN-сервер недоступен / порт панели закрыт файрволом.
- Проверить связь с панелью можно из админки: раздел серверов раз в 5 минут обновляет статус; если стоит **offline** — панель недоступна.

## Если оплата в звёздах не проходит

- Stars работают «из коробки» (валюта XTR, без платёжного провайдера). Если инвойс не появляется — смотрите `pm2 logs vpn-backend` (теперь там пишется точная ошибка `Invoice send failed`).
- Убедитесь, что бот не заблокирован и у пользователя есть звёзды для теста.

---

## Mini App (Telegram Web App)

Проект включает полнофункциональное **Mini App** (`miniapp/`) — веб-интерфейс для пользователей с авторизацией через Telegram, статусом подписки, выбором серверов, QR-кодами, инструкциями подключения, оплатой Stars и реферальной системой.

### Развёртывание Mini App

1. **Собрать Mini App**:
   ```bash
   cd /root/windsurf-project/miniapp
   npm install
   npm run build
   ```
   Результат в `miniapp/dist/`.

2. **Скопировать в Nginx**:
   ```bash
   mkdir -p /var/www/vpn-miniapp
   cp -r dist/* /var/www/vpn-miniapp/
   ```

3. **Настроить Nginx** (добавить виртуальный хост):
   ```nginx
   server {
       listen 80;
       server_name miniapp.yourdomain.com;  # или IP
       root /var/www/vpn-miniapp;
       index index.html;

       location /api/ {
           proxy_pass http://localhost:4000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }

       location / {
           try_files $uri /index.html;
       }
   }
   ```
   Затем: `nginx -t && systemctl reload nginx`.

4. **Обновить `MINI_APP_URL` в `.env`**:
   ```
   MINI_APP_URL=https://miniapp.yourdomain.com
   ```
   ⚠️ **Telegram требует HTTPS** для Web App кнопок. Используйте Let's Encrypt (`certbot`) для SSL.

5. **Перезапустить backend**:
   ```bash
   pm2 restart vpn-backend
   ```

Теперь бот при `/start` покажет кнопку **🌐 Открыть приложение**, которая откроет Mini App внутри Telegram.

---

## Горизонтальное масштабирование (несколько инстансов)

Для высоких нагрузок можно разделить API и воркеры (бот + cron) на разные процессы:

### Схема

- **API инстансы** (несколько): обрабатывают HTTP-запросы, за балансировщиком (nginx/HAProxy).
- **Worker инстанс** (ровно один): запускает Telegram бота (long polling) и cron-задачи.

### Настройка

1. **API инстанс** (можно запустить несколько на разных портах):
   ```env
   PROCESS_ROLE=api
   PORT=4000
   ```
   Запуск: `pm2 start dist/index.js --name vpn-api-1`

2. **Worker инстанс** (только один!):
   ```env
   PROCESS_ROLE=worker
   ```
   Запуск: `pm2 start dist/index.js --name vpn-worker`

3. **Балансировщик** (nginx upstream):
   ```nginx
   upstream vpn_backend {
       server 127.0.0.1:4000;
       server 127.0.0.1:4001;
       server 127.0.0.1:4002;
   }

   server {
       listen 80;
       location /api/ {
           proxy_pass http://vpn_backend;
       }
   }
   ```

⚠️ **Важно**: worker должен быть ровно один, иначе бот будет дублировать сообщения, а cron-задачи — выполняться многократно.

---

## Тесты

Проект включает минимальные тесты (vitest):

```bash
cd backend
npm test
```

Тесты проверяют:
- Генерацию VLESS-ссылок (`buildVlessLink`)
- Валидацию планов оплаты (`PLANS`)

Для непрерывной разработки: `npm run test:watch`.
