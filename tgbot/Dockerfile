FROM node:20-alpine

WORKDIR /app

# Установка зависимостей для сборки
RUN apk add --no-cache python3 make g++

# Копируем package файлы
COPY package*.json ./
COPY tsconfig.json ./

# Устанавливаем зависимости
RUN npm ci --only=production && npm cache clean --force

# Копируем исходный код
COPY src ./src

# Компилируем TypeScript
RUN npm run build

# Создаем директорию для логов
RUN mkdir -p /app/logs && chmod 777 /app/logs

# Удаляем dev dependencies
RUN npm prune --production

# Запускаем приложение
CMD ["node", "dist/index.js"]
