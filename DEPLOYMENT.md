# Руководство по развертыванию WireGuard Automation

## 📋 Содержание

1. [Требования](#требования)
2. [Подготовка сервера](#подготовка-сервера)
3. [Установка](#установка)
4. [Настройка Telegram бота](#настройка-telegram-бота)
5. [Настройка WGDashboard](#настройка-wgdashboard)
6. [Production развертывание](#production-развертывание)
7. [Обслуживание](#обслуживание)

## Требования

### Минимальные требования к серверу

- **OS**: Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- **CPU**: 1 vCPU
- **RAM**: 1 GB
- **Disk**: 10 GB
- **Network**: Публичный IPv4 адрес
- **Ports**: 51820/UDP (WireGuard), опционально 80/443 (веб-интерфейс)

### Программное обеспечение

- Docker 20.10+
- Docker Compose 2.0+
- Git (опционально)

## Подготовка сервера

### 1. Обновление системы

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS/RHEL
sudo yum update -y
```

### 2. Установка Docker

#### Ubuntu/Debian

```bash
# Установка зависимостей
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

# Добавление GPG ключа Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Добавление репозитория
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Установка Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Добавление пользователя в группу docker
sudo usermod -aG docker $USER
```

#### CentOS/RHEL

```bash
# Установка зависимостей
sudo yum install -y yum-utils

# Добавление репозитория
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# Установка Docker
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Запуск Docker
sudo systemctl start docker
sudo systemctl enable docker

# Добавление пользователя в группу docker
sudo usermod -aG docker $USER
```

### 3. Настройка firewall

#### UFW (Ubuntu/Debian)

```bash
# Разрешить SSH
sudo ufw allow 22/tcp

# Разрешить WireGuard
sudo ufw allow 51820/udp

# Опционально: веб-интерфейс (только если нужен публичный доступ)
# sudo ufw allow 80/tcp
# sudo ufw allow 443/tcp

# Включить firewall
sudo ufw enable
```

#### Firewalld (CentOS/RHEL)

```bash
# Разрешить WireGuard
sudo firewall-cmd --permanent --add-port=51820/udp

# Перезагрузить firewall
sudo firewall-cmd --reload
```

### 4. Включение IP forwarding

```bash
# Временно
sudo sysctl -w net.ipv4.ip_forward=1
sudo sysctl -w net.ipv6.conf.all.forwarding=1

# Постоянно
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
echo "net.ipv6.conf.all.forwarding=1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

## Установка

### 1. Загрузка проекта

```bash
# Создание директории
mkdir -p ~/wireguard-automation
cd ~/wireguard-automation

# Если используете Git
git clone <repository-url> .

# Или скопируйте файлы вручную
```

### 2. Настройка переменных окружения

```bash
# Копирование примера
cp .env.example .env

# Редактирование
nano .env
```

Минимальная конфигурация `.env`:

```env
# === ОБЯЗАТЕЛЬНО ===
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234...        # От @BotFather
TELEGRAM_ADMIN_IDS=123456789                    # Ваш Telegram ID
WG_ENDPOINT=YOUR_SERVER_IP:51820                # Публичный IP

# === ПОЛУЧИТЬ ПОСЛЕ ПЕРВОГО ЗАПУСКА ===
WGDASHBOARD_API_KEY=                            # Из WGDashboard UI

# === ОПЦИОНАЛЬНО ===
WG_DNS=1.1.1.1
LINK_DOMAIN=http://YOUR_SERVER_IP:3000
```

### 3. Автоматическая установка

```bash
# Запуск скрипта установки
./setup.sh
```

Или вручную:

```bash
# Запуск WGDashboard
docker-compose up -d wgdashboard

# Получение API ключа (см. следующий раздел)
# Добавление ключа в .env

# Запуск всех сервисов
docker-compose build
docker-compose up -d
```

## Настройка Telegram бота

### 1. Создание бота

1. Откройте Telegram и найдите [@BotFather](https://t.me/botfather)
2. Отправьте `/newbot`
3. Следуйте инструкциям:
   - Введите имя бота (например: "My WireGuard Bot")
   - Введите username бота (должен заканчиваться на "bot", например: "my_wireguard_bot")
4. Скопируйте полученный токен в `.env` файл

### 2. Получение вашего Telegram ID

Несколько способов:

**Способ 1: Через @userinfobot**
1. Откройте [@userinfobot](https://t.me/userinfobot)
2. Отправьте `/start`
3. Скопируйте ваш ID

**Способ 2: Через @raw_data_bot**
1. Откройте [@raw_data_bot](https://t.me/raw_data_bot)
2. Отправьте любое сообщение
3. Найдите `"from": {"id": 123456789}`

### 3. Настройка команд бота

1. Откройте [@BotFather](https://t.me/botfather)
2. Отправьте `/mybots`
3. Выберите вашего бота
4. Нажмите "Edit Bot" → "Edit Commands"
5. Вставьте:

```
start - Начало работы
getconfig - Получить конфигурацию VPN
help - Помощь
stats - Статистика (только админы)
list - Список пиров (только админы)
admin - Команды администратора
```

## Настройка WGDashboard

### 1. Первый вход

```bash
# Откройте в браузере
http://YOUR_SERVER_IP:10086

# Логин по умолчанию
Username: admin
Password: admin
```

**⚠️ ВАЖНО**: Сразу смените пароль!

### 2. Создание конфигурации (если нужно)

Проект использует конфигурацию `wg0`, которая обычно создается автоматически. Если её нет:

1. В WGDashboard нажмите "Add Configuration"
2. Name: `wg0`
3. Address: `10.0.0.1/24`
4. Listen Port: `51820`
5. Сохраните

### 3. Получение API ключа

1. Перейдите в "Settings" (иконка шестеренки)
2. Прокрутите вниз до раздела "API Access"
3. Включите переключатель "Enable API"
4. Нажмите кнопку "Create"
5. Установите срок действия (рекомендуется "Never expire" для production)
6. Нажмите "Done"
7. Скопируйте ключ (он показывается только один раз!)
8. Добавьте ключ в `.env`:
   ```env
   WGDASHBOARD_API_KEY=your-copied-api-key
   ```

### 4. Перезапуск сервисов

```bash
# Перезапуск с новым API ключом
docker-compose restart tgbot service-manager
```

## Production развертывание

### 1. Использование Nginx как reverse proxy

#### Установка Nginx

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

#### Конфигурация

Создайте файл `/etc/nginx/sites-available/wireguard`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Service Manager
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WGDashboard (опционально, для админов)
    location /admin {
        proxy_pass http://localhost:10086;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # Ограничение доступа по IP
        allow YOUR_ADMIN_IP;
        deny all;
    }
}
```

Активация:

```bash
sudo ln -s /etc/nginx/sites-available/wireguard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### Настройка SSL

```bash
sudo certbot --nginx -d your-domain.com
```

Обновите `.env`:

```env
LINK_DOMAIN=https://your-domain.com
```

### 2. Автозапуск при загрузке

```bash
# Docker настроен на автозапуск по умолчанию
# Проверка
docker-compose config | grep restart
```

Все сервисы должны иметь `restart: unless-stopped`

### 3. Ограничение доступа к WGDashboard

В `docker-compose.yml` измените:

```yaml
wgdashboard:
  ports:
    - "127.0.0.1:10086:10086/tcp"  # Только локальный доступ
    - "51820:51820/udp"
```

### 4. Резервное копирование

Создайте скрипт backup:

```bash
#!/bin/bash
BACKUP_DIR="/backup/wireguard"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
docker-compose exec -T service-manager \
  sqlite3 /app/data/database.sqlite ".backup '/app/data/backup.sqlite'"

# Copy to backup dir
docker cp wg-service-manager:/app/data/backup.sqlite \
  $BACKUP_DIR/database_$DATE.sqlite

# Backup configs
docker-compose exec -T wgdashboard tar czf /tmp/wg-backup.tar.gz /etc/wireguard
docker cp wgdashboard:/tmp/wg-backup.tar.gz \
  $BACKUP_DIR/configs_$DATE.tar.gz

# Cleanup old backups (keep last 30 days)
find $BACKUP_DIR -mtime +30 -delete

echo "Backup completed: $DATE"
```

Добавьте в cron:

```bash
# Backup каждый день в 3:00
0 3 * * * /path/to/backup.sh >> /var/log/wireguard-backup.log 2>&1
```

## Обслуживание

### Просмотр логов

```bash
# Все сервисы
docker-compose logs -f

# Конкретный сервис
docker-compose logs -f tgbot
docker-compose logs -f service-manager

# Последние N строк
docker-compose logs --tail=100 tgbot
```

### Перезапуск сервисов

```bash
# Все сервисы
docker-compose restart

# Конкретный сервис
docker-compose restart tgbot
```

### Обновление

```bash
# Pull новых образов
docker-compose pull

# Пересборка
docker-compose build

# Перезапуск
docker-compose up -d
```

### Очистка

```bash
# Удаление старых образов
docker image prune -a

# Удаление неиспользуемых volumes
docker volume prune

# Полная очистка
docker system prune -a --volumes
```

### Мониторинг

```bash
# Использование ресурсов
docker stats

# Статус контейнеров
docker-compose ps

# Проверка health
curl http://localhost:3000/health
```

## Устранение неполадок

### Проблема: Бот не отвечает

```bash
# 1. Проверка логов
docker-compose logs tgbot | tail -50

# 2. Проверка подключения к WGDashboard
docker-compose exec tgbot sh -c \
  'curl -H "wg-dashboard-apikey: $WGDASHBOARD_API_KEY" \
   http://wgdashboard:10086/api/handshake'

# 3. Перезапуск
docker-compose restart tgbot
```

### Проблема: Ошибка создания пира

```bash
# 1. Проверка доступных IP
docker-compose exec wgdashboard wg show wg0

# 2. Проверка конфигурации
docker-compose exec wgdashboard cat /etc/wireguard/wg0.conf

# 3. Проверка логов WGDashboard
docker-compose logs wgdashboard | tail -50
```

### Проблема: Ссылки не работают

```bash
# 1. Проверка базы данных
docker-compose exec service-manager ls -la /app/data/

# 2. Проверка Service Manager
curl http://localhost:3000/health

# 3. Проверка логов
docker-compose logs service-manager | tail -50
```

## Безопасность

### Checklist перед production

- [ ] Сменен пароль WGDashboard
- [ ] Настроен firewall
- [ ] WGDashboard доступен только локально
- [ ] Используется SSL для веб-интерфейса
- [ ] Настроено регулярное резервное копирование
- [ ] Логи ротируются
- [ ] Мониторинг настроен
- [ ] Admin IDs правильно настроены в боте

## Дополнительные ресурсы

- [WireGuard Documentation](https://www.wireguard.com/)
- [WGDashboard Repository](https://github.com/donaldzou/WGDashboard)
- [Docker Documentation](https://docs.docker.com/)
- [Grammy Bot Framework](https://grammy.dev/)
