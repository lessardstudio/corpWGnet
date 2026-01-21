FROM node:20-alpine

WORKDIR /app

# Установка зависимостей для сборки (нужны для better-sqlite3)
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

# Создаем директории для данных и логов
RUN mkdir -p /app/data /app/logs && chmod 777 /app/data /app/logs

# Удаляем dev dependencies после сборки
RUN npm prune --production

# Открываем порт
EXPOSE 3000

# Запускаем приложение
CMD ["node", "dist/index.js"]
