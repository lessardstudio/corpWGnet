# Service Manager API Examples

## Base URL

```
http://localhost:3000
```

## Authentication

API не требует аутентификации для публичных эндпоинтов (download).
Для административных эндпоинтов можно добавить authentication middleware.

## Endpoints

### 1. Health Check

Проверка работоспособности сервиса.

**Request:**
```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-21T10:30:00.000Z",
  "service": "wg-service-manager"
}
```

---

### 2. Create Share Link

Создание ссылки для скачивания конфигурации.

**Request:**
```bash
curl -X POST http://localhost:3000/api/links \
  -H "Content-Type: application/json" \
  -d '{
    "peerId": "abc123def456",
    "expiryHours": 24,
    "maxUsage": 3,
    "userId": 123456789,
    "createdBy": "admin"
  }'
```

**Parameters:**
- `peerId` (required): ID пира из WGDashboard
- `expiryHours` (optional): Срок действия в часах (default: 24)
- `maxUsage` (optional): Максимальное количество использований (default: 1)
- `userId` (optional): Telegram user ID
- `createdBy` (optional): Кто создал ссылку

**Response:**
```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "peerId": "abc123def456",
  "url": "http://localhost:3000/download/f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "createdAt": 1705834200000,
  "expiresAt": 1705920600000,
  "usageCount": 0,
  "maxUsageCount": 3,
  "isActive": 1,
  "userId": 123456789,
  "createdBy": "admin"
}
```

---

### 3. Get Link Info

Получение информации о ссылке.

**Request:**
```bash
curl http://localhost:3000/api/links/f47ac10b-58cc-4372-a567-0e02b2c3d479
```

**Response (Success):**
```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "peerId": "abc123def456",
  "url": "http://localhost:3000/download/f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "createdAt": 1705834200000,
  "expiresAt": 1705920600000,
  "usageCount": 1,
  "maxUsageCount": 3,
  "isActive": 1,
  "userId": 123456789,
  "createdBy": "admin"
}
```

**Response (Not Found):**
```json
{
  "error": "Link not found"
}
```

**Response (Expired):**
```json
{
  "error": "Link expired"
}
```

**Response (Usage Limit):**
```json
{
  "error": "Usage limit exceeded"
}
```

---

### 4. List Active Links

Получение списка активных ссылок.

**Request (All links):**
```bash
curl http://localhost:3000/api/links
```

**Request (By user ID):**
```bash
curl http://localhost:3000/api/links?userId=123456789
```

**Response:**
```json
[
  {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "peerId": "abc123def456",
    "url": "http://localhost:3000/download/f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "createdAt": 1705834200000,
    "expiresAt": 1705920600000,
    "usageCount": 1,
    "maxUsageCount": 3,
    "isActive": 1,
    "userId": 123456789,
    "createdBy": "admin"
  },
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "peerId": "xyz789uvw012",
    "url": "http://localhost:3000/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "createdAt": 1705834300000,
    "expiresAt": 1705920700000,
    "usageCount": 0,
    "maxUsageCount": 1,
    "isActive": 1,
    "userId": 123456789,
    "createdBy": "telegram_bot"
  }
]
```

---

### 5. Deactivate Link

Деактивация ссылки (сделать недоступной).

**Request:**
```bash
curl -X DELETE http://localhost:3000/api/links/f47ac10b-58cc-4372-a567-0e02b2c3d479
```

**Response (Success):**
```json
{
  "success": true
}
```

**Response (Not Found):**
```json
{
  "error": "Link not found"
}
```

---

### 6. Download Configuration

Скачивание конфигурации по ссылке.

**Request (Browser):**
```
http://localhost:3000/download/f47ac10b-58cc-4372-a567-0e02b2c3d479
```

**Request (curl):**
```bash
curl http://localhost:3000/download/f47ac10b-58cc-4372-a567-0e02b2c3d479 \
  -o wireguard.conf
```

**Response (Success):**
```
Content-Type: text/plain
Content-Disposition: attachment; filename="wireguard-abc123de.conf"

[Interface]
PrivateKey = <private_key>
Address = 10.0.0.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = <public_key>
AllowedIPs = 0.0.0.0/0
Endpoint = YOUR_SERVER_IP:51820
PersistentKeepalive = 21
```

**Response (Not Found / Expired / Limit):**
HTML страница с соответствующим сообщением.

---

## Usage Examples

### Python

```python
import requests
import json

BASE_URL = "http://localhost:3000"

# Create share link
def create_link(peer_id, expiry_hours=24, max_usage=1):
    url = f"{BASE_URL}/api/links"
    payload = {
        "peerId": peer_id,
        "expiryHours": expiry_hours,
        "maxUsage": max_usage
    }
    
    response = requests.post(url, json=payload)
    return response.json()

# Get link info
def get_link(link_id):
    url = f"{BASE_URL}/api/links/{link_id}"
    response = requests.get(url)
    return response.json()

# Download config
def download_config(link_id, output_file):
    url = f"{BASE_URL}/download/{link_id}"
    response = requests.get(url)
    
    if response.status_code == 200:
        with open(output_file, 'wb') as f:
            f.write(response.content)
        return True
    return False

# Example usage
link = create_link("abc123def456", expiry_hours=48, max_usage=5)
print(f"Created link: {link['url']}")

# Download config
download_config(link['id'], "wireguard.conf")
```

### JavaScript/Node.js

```javascript
const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';

// Create share link
async function createLink(peerId, expiryHours = 24, maxUsage = 1) {
  const response = await axios.post(`${BASE_URL}/api/links`, {
    peerId,
    expiryHours,
    maxUsage
  });
  return response.data;
}

// Get link info
async function getLink(linkId) {
  const response = await axios.get(`${BASE_URL}/api/links/${linkId}`);
  return response.data;
}

// Download config
async function downloadConfig(linkId, outputFile) {
  const response = await axios.get(`${BASE_URL}/download/${linkId}`, {
    responseType: 'arraybuffer'
  });
  
  fs.writeFileSync(outputFile, response.data);
  return true;
}

// Example usage
(async () => {
  const link = await createLink('abc123def456', 48, 5);
  console.log(`Created link: ${link.url}`);
  
  await downloadConfig(link.id, 'wireguard.conf');
  console.log('Config downloaded!');
})();
```

### Bash/curl

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"

# Create share link
create_link() {
  local peer_id=$1
  local expiry_hours=${2:-24}
  local max_usage=${3:-1}
  
  curl -s -X POST "$BASE_URL/api/links" \
    -H "Content-Type: application/json" \
    -d "{
      \"peerId\": \"$peer_id\",
      \"expiryHours\": $expiry_hours,
      \"maxUsage\": $max_usage
    }"
}

# Get link info
get_link() {
  local link_id=$1
  curl -s "$BASE_URL/api/links/$link_id"
}

# Download config
download_config() {
  local link_id=$1
  local output_file=${2:-wireguard.conf}
  
  curl -s "$BASE_URL/download/$link_id" -o "$output_file"
}

# Example usage
LINK_JSON=$(create_link "abc123def456" 48 5)
LINK_ID=$(echo $LINK_JSON | jq -r '.id')
LINK_URL=$(echo $LINK_JSON | jq -r '.url')

echo "Created link: $LINK_URL"
download_config "$LINK_ID" "wireguard.conf"
echo "Config downloaded!"
```

---

## Integration with Telegram Bot

Пример интеграции в Telegram боте:

```typescript
import { Bot } from 'grammy';
import axios from 'axios';

const SERVICE_MANAGER_URL = 'http://service-manager:3000';

async function createAndSendConfig(ctx: any, peerId: string) {
  try {
    // Create share link
    const { data: link } = await axios.post(`${SERVICE_MANAGER_URL}/api/links`, {
      peerId,
      expiryHours: 24,
      maxUsage: 3,
      userId: ctx.from.id,
      createdBy: 'telegram_bot'
    });
    
    // Send message with link
    await ctx.reply(
      `✅ Configuration created!\n\n` +
      `Download link (valid for 24 hours, max 3 uses):\n` +
      `${link.url}`,
      { parse_mode: 'HTML' }
    );
    
    return link;
  } catch (error) {
    console.error('Error creating link:', error);
    throw error;
  }
}
```

---

## Error Handling

### Common Error Responses

**400 Bad Request:**
```json
{
  "error": "peerId is required"
}
```

**404 Not Found:**
```json
{
  "error": "Link not found"
}
```

**410 Gone:**
```json
{
  "error": "Link expired"
}
```
или
```json
{
  "error": "Usage limit exceeded"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal server error"
}
```

### HTTP Status Codes

- `200 OK` - Запрос выполнен успешно
- `201 Created` - Ресурс создан
- `400 Bad Request` - Неверные параметры запроса
- `404 Not Found` - Ресурс не найден
- `410 Gone` - Ресурс больше недоступен (истек/использован)
- `429 Too Many Requests` - Превышен лимит запросов
- `500 Internal Server Error` - Внутренняя ошибка сервера

---

## Rate Limiting

API использует rate limiting для защиты от abuse:

- **Лимит**: 100 запросов на 15 минут на IP
- **Header**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

При превышении лимита:
```json
{
  "error": "Too many requests from this IP, please try again later."
}
```

---

## Best Practices

1. **Обработка ошибок**: Всегда проверяйте статус код ответа
2. **Retry logic**: Реализуйте повторные попытки для временных сбоев
3. **Timeouts**: Устанавливайте разумные таймауты для запросов
4. **Logging**: Логируйте все API вызовы для отладки
5. **Validation**: Валидируйте входные данные перед отправкой
6. **Security**: Используйте HTTPS в production
7. **Cleanup**: Регулярно очищайте устаревшие ссылки

---

## Monitoring

Проверка здоровья сервиса:

```bash
# Simple check
curl http://localhost:3000/health

# With monitoring tool (Prometheus format можно добавить)
# GET /metrics
```

Метрики для мониторинга:
- Количество созданных ссылок
- Количество скачиваний
- Количество истекших ссылок
- Среднее время ответа API
- Rate limit violations
