#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  WireGuard Automation - Setup        ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""

# Проверка Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker не установлен. Установите Docker и попробуйте снова.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose не установлен. Установите Docker Compose и попробуйте снова.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker установлен${NC}"
echo -e "${GREEN}✓ Docker Compose установлен${NC}"
echo ""

# Проверка .env файла
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  Файл .env не найден. Создаю из .env.example...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✓ Файл .env создан${NC}"
    echo -e "${YELLOW}⚠️  ВАЖНО: Отредактируйте .env файл перед запуском!${NC}"
    echo ""
    echo "Необходимо настроить:"
    echo "  - TELEGRAM_BOT_TOKEN (получить от @BotFather)"
    echo "  - TELEGRAM_ADMIN_IDS (ваш Telegram ID)"
    echo "  - WG_ENDPOINT (публичный IP вашего сервера)"
    echo "  - WGDASHBOARD_API_KEY (после первого запуска WGDashboard)"
    echo ""
    read -p "Нажмите Enter для продолжения после редактирования .env..."
fi

echo -e "${GREEN}✓ Файл .env найден${NC}"
echo ""

# Загрузка переменных из .env
source .env

# Проверка обязательных переменных
REQUIRED_VARS=("TELEGRAM_BOT_TOKEN" "TELEGRAM_ADMIN_IDS" "WG_ENDPOINT")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ] || [ "${!var}" = "your_"* ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo -e "${RED}❌ Не настроены следующие переменные в .env:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo -e "${RED}   - $var${NC}"
    done
    echo ""
    echo "Отредактируйте .env файл и запустите скрипт снова."
    exit 1
fi

echo -e "${GREEN}✓ Все обязательные переменные настроены${NC}"
echo ""

# Создание необходимых директорий
echo "📁 Создание директорий..."
mkdir -p tgbot/logs
mkdir -p tgbot/data
mkdir -p service-manager/data
mkdir -p service-manager/logs

echo -e "${GREEN}✓ Директории созданы${NC}"
echo ""

# Запуск WGDashboard для получения API ключа
if [ -z "$WGDASHBOARD_API_KEY" ] || [ "$WGDASHBOARD_API_KEY" = "your_api_key_here" ]; then
    echo -e "${YELLOW}⚠️  API ключ WGDashboard не настроен${NC}"
    echo ""
    echo "Запускаю WGDashboard для получения API ключа..."
    docker-compose up -d wgdashboard
    
    echo ""
    echo -e "${GREEN}✓ WGDashboard запущен${NC}"
    echo ""
    echo "Для получения API ключа:"
    echo "1. Откройте в браузере: http://$(hostname -I | awk '{print $1}'):10086"
    echo "2. Войдите (по умолчанию: admin / admin)"
    echo "3. Перейдите в Settings"
    echo "4. Прокрутите вниз до раздела API"
    echo "5. Включите API и создайте ключ"
    echo "6. Скопируйте ключ в .env файл (WGDASHBOARD_API_KEY)"
    echo ""
    read -p "Нажмите Enter после настройки API ключа..."
    
    # Перезагрузка переменных
    source .env
    
    if [ -z "$WGDASHBOARD_API_KEY" ] || [ "$WGDASHBOARD_API_KEY" = "your_api_key_here" ]; then
        echo -e "${RED}❌ API ключ все еще не настроен. Завершаю.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✓ API ключ WGDashboard настроен${NC}"
echo ""

# Сборка и запуск всех сервисов
echo "🔨 Сборка Docker образов..."
docker-compose build

echo ""
echo "🚀 Запуск всех сервисов..."
docker-compose up -d

echo ""
echo -e "${GREEN}✓ Все сервисы запущены${NC}"
echo ""

# Ожидание запуска сервисов
echo "⏳ Ожидание запуска сервисов (10 секунд)..."
sleep 10

# Проверка статуса
echo ""
echo "📊 Статус сервисов:"
docker-compose ps

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Установка завершена успешно! 🎉     ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""
echo "Доступ к сервисам:"
echo "  WGDashboard:      http://$(hostname -I | awk '{print $1}'):10086"
echo "  Service Manager:  http://$(hostname -I | awk '{print $1}'):3000"
echo "  Telegram Bot:     @$(grep TELEGRAM_BOT_TOKEN .env | cut -d'=' -f2 | cut -d':' -f1)"
echo ""
echo "Полезные команды:"
echo "  docker-compose logs -f           # Просмотр логов"
echo "  docker-compose ps                # Статус контейнеров"
echo "  docker-compose restart tgbot     # Перезапуск бота"
echo "  docker-compose down              # Остановка всех сервисов"
echo ""
echo "Отправьте /start вашему боту в Telegram для проверки!"
