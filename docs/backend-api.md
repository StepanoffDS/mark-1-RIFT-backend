# Backend API

Base URL:

```text
/api/v1
```

API разделяется на HTTP API и Socket.IO events.

---

# Auth

Frontend flow, CSRF, refresh rotation и cookie attributes:
[auth.md](auth.md). OpenAPI JSON в development: `/api/v1/docs-json`.

## `POST /auth/register`

Регистрация.

```json
{
  "username": "dmitry",
  "email": "user@example.com",
  "password": "password"
}
```

Response:

```text
201 Created
```

---

## `POST /auth/login`

Авторизация.

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

Response:

```text
201 Created
```

Backend выставляет access и refresh credentials только через `HttpOnly`,
`Secure`, `SameSite=Strict` cookies. Credentials не возвращаются в JSON.
Небезопасные запросы требуют `X-CSRF-Token` и валидный `Origin`.

---

## `POST /auth/refresh`

Ротация refresh token и обновление access token. Refresh token одноразовый;
повторное предъявление отзывает сессию.

```text
204 No Content
```

---

## `POST /auth/logout`

Отзывает текущую PostgreSQL-сессию и очищает auth cookies.

```text
204 No Content
```

---

# Users

## `GET /users/me`

Текущий пользователь.

---

## `GET /users`

Получение пользователей для выбора assignee.

Query:

```text
?search=dmitry
```

---

## `GET /users/me/sessions`

Активные сессии пользователя.

---

## `DELETE /users/me/sessions/:id`

Завершение конкретной сессии.

---

# Incidents

## `GET /incidents`

Получение списка.

Query parameters:

```text
?status=INVESTIGATING
&severity=P1
&search=payment
&page=1
&limit=20
```

Response:

```json
{
  "items": [],
  "page": 1,
  "limit": 20,
  "total": 42
}
```

---

## `POST /incidents`

Создание.

```json
{
  "title": "Payment processing unavailable",
  "description": "Payments started failing...",
  "severity": "P1",
  "assignedTo": null
}
```

Response:

```text
201 Created
```

---

## `GET /incidents/:id`

Получение инцидента.

Включает основную информацию:

```text
title
description
status
severity
creator
assignee
createdAt
resolvedAt
```

---

## `PATCH /incidents/:id`

Редактирование основной информации.

Например:

```json
{
  "title": "Payment processing degraded",
  "severity": "P2"
}
```

---

## `PATCH /incidents/:id/status`

Изменение статуса.

```json
{
  "status": "INVESTIGATING"
}
```

После commit отправляется:

```text
incident:status_changed
```

---

## `PUT /incidents/:id/assignee`

Назначение пользователя.

```json
{
  "userId": "uuid"
}
```

---

## `DELETE /incidents/:id/assignee`

Удаление assignee.

---

# Participants

## `GET /incidents/:id/participants`

Постоянные участники инцидента.

---

## `POST /incidents/:id/participants`

Добавление участника.

```json
{
  "userId": "uuid"
}
```

---

## `DELETE /incidents/:id/participants/:userId`

Удаление участника.

---

# Comments

## `GET /incidents/:id/comments`

Получение комментариев.

Для большого количества комментариев используется cursor pagination.

```text
?cursor=...
&limit=50
```

---

## `POST /incidents/:id/comments`

Создание комментария.

```json
{
  "content": "Database connections appear to be exhausted."
}
```

После commit:

```text
comment:created
```

---

## `PATCH /incidents/:id/comments/:commentId`

Редактирование собственного комментария.

```json
{
  "content": "Updated comment"
}
```

---

## `DELETE /incidents/:id/comments/:commentId`

Soft delete комментария.

---

# Timeline

## `GET /incidents/:id/events`

История событий.

```text
?cursor=...
&limit=50
```

Пример:

```json
{
  "items": [
    {
      "type": "STATUS_CHANGED",
      "actor": {
        "id": "uuid",
        "username": "dmitry"
      },
      "payload": {
        "from": "OPEN",
        "to": "INVESTIGATING"
      },
      "createdAt": "2026-09-11T06:30:00Z"
    }
  ],
  "nextCursor": "..."
}
```

---

# Socket.IO

WebSocket используется для доставки real-time событий, а не как замена HTTP API.

## Connection

```text
/ws
```

При подключении сервер должен авторизовать пользователя.

---

## Client → Server

```text
incident:join
incident:leave

user:typing
user:stop_typing
```

Например:

```json
{
  "incidentId": "uuid"
}
```

При `incident:join` клиент подключается к Socket.IO room:

```text
incident:{incidentId}
```

---

# Server → Client

```text
incident:updated
incident:status_changed

comment:created
comment:updated
comment:deleted

participant:added
participant:removed

presence:joined
presence:left

user:typing
user:stop_typing
```

Все persistent-события отправляются только после успешного изменения данных в PostgreSQL.

```text
HTTP request
     ↓
validation
     ↓
SQL transaction
     ↓
COMMIT
     ↓
Socket.IO emit
```

Таким образом PostgreSQL остаётся source of truth, а Socket.IO отвечает за доставку изменений подключённым клиентам.

---

# HTTP Status Codes

Основные коды:

```text
200 OK
201 Created
204 No Content

400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity

500 Internal Server Error
```

Ошибки API имеют единый формат:

```json
{
  "statusCode": 409,
  "code": "INVALID_INCIDENT_TRANSITION",
  "message": "Cannot transition incident from RESOLVED to MONITORING"
}
```
