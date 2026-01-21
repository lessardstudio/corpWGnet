# Исправление ошибки сборки Docker

## Проблема
При сборке Docker образов возникала ошибка:
```
npm ci can only install with an existing package-lock.json
```

## Причина
Команда `npm ci` требует наличие `package-lock.json` файла, который не был включен в проект.

## Решение
Изменены Dockerfile'ы для использования `npm install` вместо `npm ci`.

### Что изменилось:

**Было:**
```dockerfile
RUN npm ci --only=production && npm cache clean --force
```

**Стало:**
```dockerfile
# Устанавливаем все зависимости (включая devDependencies для сборки)
RUN npm install && npm cache clean --force

# ... компиляция TypeScript ...

# Удаляем dev dependencies после сборки
RUN npm prune --production
```

## Что делать, если у вас уже скачан старый архив

### Вариант 1: Скачать новый архив (рекомендуется)
Скачайте обновленный `wireguard-automation.tar.gz` из outputs.

### Вариант 2: Исправить вручную

#### Для tgbot/Dockerfile:
```bash
nano tgbot/Dockerfile
```

Замените строку 13:
```dockerfile
# Было:
RUN npm ci --only=production && npm cache clean --force

# На:
RUN npm install && npm cache clean --force
```

#### Для service-manager/Dockerfile:
```bash
nano service-manager/Dockerfile
```

Замените строку 12:
```dockerfile
# Было:
RUN npm ci --only=production && npm cache clean --force

# На:
RUN npm install && npm cache clean --force
```

### Вариант 3: Создать package-lock.json (альтернатива)

Если вы предпочитаете использовать `npm ci`:

```bash
# В директории tgbot
cd tgbot
npm install  # Создаст package-lock.json
cd ..

# В директории service-manager
cd service-manager
npm install  # Создаст package-lock.json
cd ..

# Теперь npm ci будет работать
docker-compose build
```

## После исправления

Запустите сборку заново:
```bash
docker-compose build
docker-compose up -d
```

## Проверка

Убедитесь, что контейнеры запустились успешно:
```bash
docker-compose ps

# Должно показать все контейнеры в статусе "Up"
```

Проверьте логи:
```bash
docker-compose logs tgbot
docker-compose logs service-manager
```

## Дополнительные замечания

Использование `npm install` вместо `npm ci`:
- ✅ Работает без package-lock.json
- ✅ Создает lock-файл автоматически
- ⚠️ Немного медленнее, чем npm ci
- ⚠️ Может установить разные версии зависимостей при повторных сборках

Для production рекомендуется:
1. Один раз создать package-lock.json локально
2. Добавить его в проект
3. Вернуться к использованию npm ci

Но для быстрого старта текущее решение работает отлично!
