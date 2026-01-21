FROM node:20-alpine

WORKDIR /app

# Установка зависимостей для сборки
RUN apk add --no-cache python3 make g++

# Копируем package файлы
COPY package*.json ./
COPY tsconfig.json ./

# Устанавливаем все зависимости (включая devDependencies для сборки)
RUN npm install && npm cache clean --force

# Копируем исходный код
COPY src ./src

# Компилируем TypeScript
RUN npm run build

# Создаем директорию для логов и данных
RUN mkdir -p /app/logs /app/data && chmod 777 /app/logs /app/data

# Удаляем dev dependencies после сборки
RUN npm prune --production

# Запускаем приложение
CMD ["node", "dist/index.js"]
