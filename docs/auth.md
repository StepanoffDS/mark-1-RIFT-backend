# Авторизация для frontend

Backend использует cookie-first авторизацию. Frontend не получает и не хранит
access или refresh token: браузер отправляет `HttpOnly` cookies сам.

## Контракт и базовый URL

```text
API:     /api/v1
Swagger: /api/v1/docs                 # только development
OpenAPI: /api/v1/docs-json            # только development
```

OpenAPI JSON — источник типов и endpoint-контрактов для frontend. Эта страница
объясняет работу с cookies, CSRF и обновлением сессии.

## Cookies

| Среда | Access | Refresh | CSRF |
| --- | --- | --- | --- |
| Development | `rift_access` | `rift_refresh` | `rift_csrf` |
| Production | `__Host-rift_access` | `__Host-rift_refresh` | `__Host-rift_csrf` |

- access и refresh — `HttpOnly`: JavaScript не может их прочитать;
- CSRF cookie доступна через `document.cookie`;
- все cookies имеют `SameSite=Strict` и `Path=/`;
- в production cookies также имеют `Secure`.

Не сохраняйте токены в `localStorage`, `sessionStorage`, Zustand, Redux или
TanStack Query. В состоянии frontend хранится только модель пользователя.

## CSRF: первый запрос и mutation

Перед первым `POST`, `PUT`, `PATCH` или `DELETE` вызовите:

```http
GET /api/v1/auth/csrf
```

Ответ — `204 No Content` и `Set-Cookie` с CSRF token. Для каждого небезопасного
запроса передавайте значение этой cookie в заголовке `X-CSRF-Token`.

```ts
const API_URL = 'http://localhost:3000/api/v1';
const CSRF_COOKIE_NAME = import.meta.env.PROD
  ? '__Host-rift_csrf'
  : 'rift_csrf';

function readCookie(name: string) {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split('; ')
    .find((item) => item.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

export async function initCsrf() {
  await fetch(`${API_URL}/auth/csrf`, { credentials: 'include' });
}
```

После `register`, `login` и `refresh` backend выпускает новый CSRF token. Не
кешируйте его: читайте cookie непосредственно перед mutation.

## HTTP-клиент

Все запросы должны передавать `credentials: 'include'`. Браузер добавит
`Origin`; backend сверяет его со значением `CORS_ORIGIN`.

```ts
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function request(path: string, init: RequestInit = {}) {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  if (!SAFE_METHODS.has(method)) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);

    if (!csrfToken) {
      throw new Error('CSRF cookie is missing. Call initCsrf() first.');
    }

    headers.set('X-CSRF-Token', csrfToken);
  }

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
}
```

Рекомендуемая production-схема — frontend и API на одном host за reverse
proxy:

```text
https://rift.example.com        frontend
https://rift.example.com/api/v1 backend
```

`localhost:5173` и `localhost:3000` также совместимы: порт не входит в domain
cookie. Разные production subdomain, например `app.example.com` и
`api.example.com`, с текущими `__Host-` cookies не поддерживаются без изменения
deployment-схемы.

## Auth flow

### Инициализация приложения

1. Вызвать `GET /auth/csrf`.
2. Вызвать `GET /users/me`.
3. При `401` один раз вызвать `POST /auth/refresh`.
4. При успешном refresh повторить `GET /users/me`; при неуспехе показать
   неавторизованное состояние.

Не декодируйте JWT на клиенте для принятия решений об авторизации. Источник
истины — ответ `GET /users/me`.

### Регистрация

```http
POST /api/v1/auth/register
Content-Type: application/json
X-CSRF-Token: <csrf-cookie-value>

{
  "email": "user@example.com",
  "password": "strong-password"
}
```

Успех: `201 Created`, response body:

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "createdAt": "2026-09-16T12:00:00.000Z"
  }
}
```

Backend установит access, refresh и новый CSRF cookies. Сохраните `user` в
клиентском состоянии или запросите `GET /users/me` заново.

### Вход

```http
POST /api/v1/auth/login
Content-Type: application/json
X-CSRF-Token: <csrf-cookie-value>

{
  "email": "user@example.com",
  "password": "strong-password"
}
```

Успех: `201 Created` с тем же телом `{ "user": ... }` и новыми cookies.
Неверный email или пароль возвращает `401`; refresh в этом случае не нужен.

### Обновление сессии

При `401` от защищённого endpoint вызовите:

```http
POST /api/v1/auth/refresh
X-CSRF-Token: <csrf-cookie-value>
```

Успех: `204 No Content`. Backend ротирует refresh token, устанавливает новый
access cookie и новый CSRF cookie. Один refresh должен выполняться одновременно:

```ts
let refreshPromise: Promise<Response> | null = null;

export function refreshSession() {
  refreshPromise ??= request('/auth/refresh', { method: 'POST' })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}
```

Если refresh вернул `401`, очистите данные текущего пользователя и направьте
пользователя на вход. Не повторяйте refresh для самого `/auth/refresh`.

### Выход

```http
POST /api/v1/auth/logout
X-CSRF-Token: <csrf-cookie-value>
```

Успех: `204 No Content`. Backend отзывает текущую сессию и очищает auth cookies.
После ответа очистите пользовательские данные и кеш защищённых запросов.

## Текущий пользователь и устройства

```http
GET /api/v1/users/me
```

Успех: `200 OK` с объектом пользователя. Если access cookie истекла — `401`;
используйте описанный выше refresh flow.

```http
GET /api/v1/users/me/sessions
```

Возвращает активные сессии пользователя. Поле `userAgent` — строка браузера и
устройства, записанная при входе; она может быть `null` и служит только для
понятного списка устройств.

```http
DELETE /api/v1/users/me/sessions/:id
X-CSRF-Token: <csrf-cookie-value>
```

Отзывает другую сессию и возвращает `204`. Текущую сессию этим endpoint удалить
нельзя (`400`) — для неё используется `POST /auth/logout`.

## Обработка ошибок

| Статус | Значение для UI |
| --- | --- |
| `400` | Ошибка валидации, либо попытка удалить текущую сессию. Покажите сообщение из response body. |
| `401` | Нет или истёк access/refresh token. Для защищённого запроса один раз попробуйте refresh. |
| `403` | CSRF token отсутствует/не совпал либо не совпал `Origin`. Сначала получите CSRF cookie заново. |
| `409` | Email уже зарегистрирован. Покажите ошибку поля email. |
| `429` | Сработал rate limit. Покажите retry-later состояние. |

Не пытайтесь вручную удалять auth cookies: их важные cookies `HttpOnly`, а
окончательное завершение сессии всегда делает `POST /auth/logout`.

## Swagger

В development UI доступен по `/api/v1/docs`, а машинная спецификация — по
`/api/v1/docs-json`. Swagger описывает формы запросов и ответов, но не заменяет
реальный browser flow: `HttpOnly` cookies нельзя подставить вручную через
`Authorize`. Для ручной проверки сначала получите CSRF cookie через
`GET /auth/csrf`, затем отправляйте `X-CSRF-Token`.
