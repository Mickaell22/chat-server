<div align="center">

# chat-server

### Backend de un sistema de chat en tiempo real con WebSockets

Servidor de chat en tiempo real desarrollado como proyecto de **Aplicaciones Distribuidas**.
Expone una API de autenticación con JWT y un servidor WebSocket (Socket.IO) para
mensajería instantánea con salas múltiples y mensajes privados.

![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?style=for-the-badge&logo=express&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?style=for-the-badge&logo=socket.io&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-Auth-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![Railway](https://img.shields.io/badge/Railway-Deploy-0B0D0E?style=for-the-badge&logo=railway&logoColor=white)

</div>

---

## Tabla de contenido

- [Características](#características)
- [Arquitectura](#arquitectura)
- [Stack tecnológico](#stack-tecnológico)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Requisitos previos](#requisitos-previos)
- [Instalación](#instalación)
- [Variables de entorno](#variables-de-entorno)
- [Base de datos (Prisma)](#base-de-datos-prisma)
- [Ejecución](#ejecución)
- [Modelo de datos](#modelo-de-datos)
- [API HTTP](#api-http)
- [Eventos de WebSocket](#eventos-de-websocket)
- [Despliegue en Railway](#despliegue-en-railway)
- [Cliente](#cliente)

---

## Características

- Autenticación de usuarios: **registro** e **inicio de sesión** con **JWT**.
- Contraseñas almacenadas de forma segura con **bcrypt** (nunca en texto plano).
- Comunicación en **tiempo real** mediante **WebSockets** (Socket.IO).
- **Validación del JWT en el handshake** del socket: nadie entra al chat sin autenticarse.
- **Lista de usuarios conectados** en tiempo real.
- **Salas de chat múltiples** (crear, unirse, salir).
- **Mensajes privados** (DM) entre usuarios.
- **Persistencia** de usuarios, salas e historial de mensajes en PostgreSQL.

---

## Arquitectura

```
┌─────────────────┐   HTTP (login / registro · JWT)   ┌──────────────────────┐
│  chat-client    │ ────────────────────────────────► │   Express (API)      │
│  (React + Vite) │                                    │                      │
│                 │   WebSocket (Socket.IO · JWT)      │   Socket.IO server   │
│                 │ ◄────────────────────────────────► │                      │
└─────────────────┘                                    └──────────┬───────────┘
                                                                  │ Prisma
                                                                  ▼
                                                        ┌──────────────────────┐
                                                        │     PostgreSQL       │
                                                        └──────────────────────┘
```

- **Auth por HTTP:** el registro/login devuelven un JWT.
- **Chat por WebSocket:** el cliente abre el socket enviando el JWT en el handshake;
  el servidor lo valida antes de aceptar la conexión.

---

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Runtime | Node.js 22 (ESM) |
| API HTTP | Express 4 |
| Tiempo real | Socket.IO 4 |
| ORM | Prisma 6 |
| Base de datos | PostgreSQL |
| Seguridad | jsonwebtoken (JWT) + bcrypt |
| CORS | cors |
| Configuración | dotenv |

---

## Estructura del proyecto

```
chat-server/
├── prisma/
│   └── schema.prisma        # Modelo de datos (User, Room, RoomMember, Message)
├── src/
│   ├── index.js             # Entry point: levanta Express + Socket.IO
│   ├── lib/prisma.js        # Cliente único de Prisma
│   ├── config/              # Carga y validación de variables de entorno
│   ├── controllers/         # Lógica de las rutas (auth, etc.)
│   ├── routes/              # Routers de Express
│   ├── middleware/          # Auth JWT (HTTP y socket)
│   └── sockets/             # Handlers de eventos de Socket.IO
├── .env.example
└── package.json
```

---

## Requisitos previos

- **Node.js** >= 20 (probado en 22) y **npm**.
- Una instancia de **PostgreSQL** (local o en Railway).

---

## Instalación

```bash
git clone <url-del-repo>
cd chat-server
npm install
```

---

## Variables de entorno

Copiá `.env.example` a `.env` y completá los valores:

```bash
cp .env.example .env
```

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `PORT` | Puerto del servidor HTTP/WebSocket | `4000` |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL | `postgresql://user:pass@localhost:5432/chat` |
| `JWT_SECRET` | Secreto para firmar los JWT (largo y aleatorio) | `xxxxxxxx...` |
| `JWT_EXPIRES_IN` | Expiración del token | `7d` |
| `CLIENT_ORIGIN` | Origen permitido para CORS (URL del cliente) | `http://localhost:5173` |
| `SMTP_HOST` | Host del servidor SMTP (correos) | `smtp.gmail.com` |
| `SMTP_PORT` | Puerto SMTP (587 STARTTLS / 465 TLS) | `587` |
| `SMTP_SECURE` | `true` si el puerto es 465, si no `false` | `false` |
| `SMTP_USER` | Usuario/cuenta SMTP | `tucuenta@gmail.com` |
| `SMTP_PASS` | Contraseña o app password SMTP | `xxxx xxxx xxxx xxxx` |
| `MAIL_FROM` | Remitente visible | `Chat en tiempo real <tucuenta@gmail.com>` |

> Las variables `SMTP_*` son para la verificación de email y la recuperación de
> contraseña. Con Gmail, usá un **app password** y poné en `MAIL_FROM` la misma
> dirección de `SMTP_USER` (Gmail fuerza el remitente a la cuenta autenticada).

---

## Base de datos (Prisma)

Generar el cliente de Prisma y aplicar las migraciones:

```bash
npm run prisma:generate   # genera el cliente
npm run prisma:migrate    # crea/aplica migraciones en desarrollo
npm run prisma:studio     # (opcional) explora la base de datos en el navegador
```

---

## Ejecución

```bash
npm run dev     # desarrollo (recarga automática con --watch)
npm start       # producción
```

El servidor levanta en `http://localhost:4000` y expone `GET /health` para verificar
que está vivo.

---

## Modelo de datos

| Entidad | Descripción |
|---------|-------------|
| **User** | Usuarios registrados (username, email, passwordHash). |
| **Room** | Salas de chat. |
| **RoomMember** | Relación usuario ↔ sala (quién está en qué sala). |
| **Message** | Mensaje de sala (`roomId`) o privado (`recipientId`). |

> Un `Message` es de sala si tiene `roomId`, o un mensaje privado (DM) si tiene `recipientId`.

---

## API HTTP

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| `GET` | `/health` | Estado del servidor | No |
| `POST` | `/api/auth/register` | Registrar un usuario (envía correo de verificación) | No |
| `POST` | `/api/auth/login` | Iniciar sesión y obtener JWT | No |
| `POST` | `/api/auth/verify-email` | Verificar el correo con el token recibido | No |
| `POST` | `/api/auth/request-password-reset` | Solicitar enlace de recuperación por correo | No |
| `POST` | `/api/auth/reset-password` | Establecer nueva contraseña con el token | No |

> Las rutas de chat se manejan por WebSocket, no por HTTP. _(Endpoints en construcción)._

---

## Eventos de WebSocket

| Evento | Dirección | Descripción |
|--------|-----------|-------------|
| `users:online` | server → cliente | Lista de usuarios conectados |
| `room:join` | cliente → server | Unirse a una sala |
| `room:leave` | cliente → server | Salir de una sala |
| `room:message` | bidireccional | Mensaje dentro de una sala |
| `dm:message` | bidireccional | Mensaje privado entre dos usuarios |

> El JWT se envía en `auth: { token }` durante el handshake y se valida con un
> middleware `io.use(...)` antes de aceptar la conexión.

---

## Despliegue en Railway

1. Crear un proyecto en [Railway](https://railway.app) y agregar el plugin **PostgreSQL**.
2. Crear un servicio desde este repositorio.
3. Configurar las variables de entorno (`DATABASE_URL` la provee Railway; setear
   `JWT_SECRET` y `CLIENT_ORIGIN` con la URL del frontend desplegado).
4. Comando de inicio: `npm start` (las migraciones se aplican con `npm run prisma:deploy`).

---

## Cliente

El frontend que consume este servidor está en el repositorio **[chat-client](#)**
(React + Vite + socket.io-client).

---

<div align="center">
Proyecto académico — Aplicaciones Distribuidas · Segundo parcial
</div>
