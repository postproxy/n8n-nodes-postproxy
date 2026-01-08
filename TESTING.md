# Локальное тестирование n8n ноды

## Способ 1: npm link (рекомендуется для разработки)

Этот способ создает симлинк, поэтому изменения в коде будут сразу видны после пересборки.

### Шаги:

1. **В директории проекта PostProxy:**
   ```bash
   cd /Users/dmitry/Yandex.Disk.localized/dev/code/64bitlabs/postproxy/n8n-nodes-postproxy
   npm run build
   npm link
   ```

2. **В директории вашего локального n8n:**
   ```bash
   cd /path/to/your/n8n
   npm link n8n-nodes-postproxy
   ```

3. **Перезапустите n8n:**
   ```bash
   # Если используете n8n через npm
   npm start
   
   # Или если используете Docker
   docker-compose restart
   ```

4. **Проверьте, что нода появилась:**
   - Откройте n8n в браузере
   - Создайте новый workflow
   - В поиске нод введите "PostProxy"
   - Нода должна появиться в списке

## Способ 2: Установка через локальный путь

Если npm link не работает, можно установить напрямую из локальной директории.

### Шаги:

1. **Убедитесь, что проект собран:**
   ```bash
   cd /Users/dmitry/Yandex.Disk.localized/dev/code/64bitlabs/postproxy/n8n-nodes-postproxy
   npm run build
   ```

2. **В директории вашего локального n8n:**
   ```bash
   cd /path/to/your/n8n
   npm install /Users/dmitry/Yandex.Disk.localized/dev/code/64bitlabs/postproxy/n8n-nodes-postproxy
   ```

3. **Перезапустите n8n**

## Способ 3: Для n8n Desktop

Если используете n8n Desktop:

1. Откройте n8n Desktop
2. Перейдите в Settings → Community Nodes
3. Нажмите "Install a community node"
4. Введите путь к локальной директории:
   ```
   /Users/dmitry/Yandex.Disk.localized/dev/code/64bitlabs/postproxy/n8n-nodes-postproxy
   ```
5. Нажмите "Install"
6. Перезапустите n8n Desktop

## Тестирование ноды

### 1. Тест Credentials

1. Создайте новый workflow
2. Добавьте PostProxy ноду
3. Нажмите на "Credential to connect with" → "Create New Credential"
4. Выберите "PostProxy API"
5. Введите ваш API key
6. Сохраните credential

**Ожидаемый результат:** Credential должен сохраниться без ошибок

### 2. Тест Accounts List

1. Добавьте PostProxy ноду в workflow
2. Выберите:
   - **Resource:** Account
   - **Operation:** List
3. Выполните ноду (Execute Workflow)

**Ожидаемый результат:**
- Нода должна вернуть список аккаунтов
- Каждый элемент должен содержать: `id`, `name`, `type`, `username`

**Тест с неверным API key:**
- Измените API key на неверный
- Выполните ноду
- Должна появиться понятная ошибка с request_id (если доступен)

### 3. Тест Posts Create (без media)

1. Добавьте PostProxy ноду
2. Выберите:
   - **Resource:** Post
   - **Operation:** Create
   - **Content:** "Test post from n8n"
   - **Account IDs:** Выберите один или несколько аккаунтов из списка
   - **Media URLs:** Оставьте пустым
   - **Publish At:** Оставьте пустым (для немедленной публикации)
3. Выполните ноду

**Ожидаемый результат:**
- Нода должна вернуть ответ API с информацией о созданном посте
- Должны быть видны статусы для каждого аккаунта

### 4. Тест Posts Create (с media)

1. Повторите шаги из теста 3
2. В поле **Media URLs** добавьте URL изображения:
   ```
   https://example.com/image.jpg
   ```
3. Выполните ноду

**Ожидаемый результат:**
- Пост должен быть создан с прикрепленным медиа

### 5. Тест Posts Create (scheduled)

1. Повторите шаги из теста 3
2. В поле **Publish At** выберите дату и время в будущем (например, через 1 час)
3. Выполните ноду

**Ожидаемый результат:**
- Пост должен быть создан со статусом "scheduled"
- В ответе должно быть указано время публикации

### 6. Тест валидации

1. Создайте PostProxy ноду с операцией Create
2. Оставьте **Content** пустым
3. Попробуйте выполнить ноду

**Ожидаемый результат:**
- Должна появиться ошибка: "Content cannot be empty"

4. Заполните Content, но не выберите **Account IDs**
5. Попробуйте выполнить ноду

**Ожидаемый результат:**
- Должна появиться ошибка: "At least one account must be selected"

## Отладка

### Проверка логов

Если нода не работает, проверьте логи n8n:

```bash
# Для n8n через npm
# Логи обычно выводятся в консоль

# Для n8n через Docker
docker-compose logs -f n8n

# Для n8n Desktop
# Логи доступны через меню Help → View Logs
```

### Проверка установки

Убедитесь, что нода правильно установлена:

```bash
# В директории n8n
ls -la node_modules/n8n-nodes-postproxy/

# Должны быть видны:
# - dist/
# - package.json
# - README.md
```

### Проверка сборки

Если изменения не применяются:

```bash
cd /Users/dmitry/Yandex.Disk.localized/dev/code/64bitlabs/postproxy/n8n-nodes-postproxy
npm run build

# Проверьте, что файлы обновились
ls -la dist/nodes/PostProxy/
ls -la dist/credentials/
```

## Быстрая проверка работоспособности

Минимальный тест для проверки, что все работает:

1. **Accounts List** - должен вернуть список аккаунтов
2. **Posts Create** (простой пост) - должен создать пост и вернуть ответ

Если оба теста проходят успешно, нода работает корректно!

## Troubleshooting

### Нода не появляется в списке

- Убедитесь, что проект собран (`npm run build`)
- Проверьте, что файлы в `dist/` существуют
- Перезапустите n8n
- Проверьте логи n8n на наличие ошибок

### Ошибка "Cannot find module"

- Убедитесь, что зависимости установлены в проекте PostProxy:
  ```bash
  cd /Users/dmitry/Yandex.Disk.localized/dev/code/64bitlabs/postproxy/n8n-nodes-postproxy
  npm install
  ```

### Credentials не сохраняются

- Проверьте, что `dist/credentials/PostProxyApi.credentials.js` существует
- Проверьте логи n8n на наличие ошибок

### Нода не загружает accounts в dropdown

- Проверьте, что API key правильный
- Проверьте логи n8n - там должна быть ошибка, если запрос не прошел
- Убедитесь, что метод `getAccounts` правильно реализован

