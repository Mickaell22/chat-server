<div align="center">

# chat-server

### Backend de pub, un sistema de chat en tiempo real con WebSockets

Servidor de **pub**, un chat en tiempo real desarrollado como proyecto de **Aplicaciones Distribuidas**.
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
- **Verificación de correo** y **recuperación de contraseña** (Resend).
- Comunicación en **tiempo real** mediante **WebSockets** (Socket.IO).
- **Validación del JWT en el handshake** del socket: nadie entra al chat sin autenticarse.
- **Lista de usuarios conectados** en tiempo real, con presencia manual
  (conectado / no molestar / invisible).
- **Salas de chat múltiples** (crear, unirse, salir), con salas **privadas**
  por código de invitación.
- **Mensajes privados** (DM) entre usuarios.
- Mensajes con **respuestas**, **edición**, **borrado**, **reacciones** con
  emoji e **imágenes** (Cloudinary, con recompresión server-side).
- **Mensajes fijados** por sala (cualquier miembro fija/desfija) y
  **búsqueda de mensajes** en la conversación abierta (sala o DM).
- **Moderación**: el creador de una sala puede borrar mensajes ajenos y
  expulsar miembros.
- **Historial paginado** (cursor `before`) y **no leídos persistentes** por
  conversación (marcas de lectura).
- **Amistades** (solicitudes, aceptar/rechazar) y perfil público con estado
  de amistad, salas y amigos en común.
- **Señalización WebRTC** para llamadas de voz/video 1-a-1 y canales de voz
  grupales por sala (mesh con tope de participantes); el audio/video nunca
  pasa por el servidor.
- **Rate limiting** de mensajes por usuario (token bucket).
- **Persistencia** de usuarios, salas, amistades, reacciones e historial de
  mensajes en PostgreSQL.

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
│   └── schema.prisma        # Modelo de datos (User, Room, Message, Reaction, ReadMark, Friendship...)
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
| `RESEND_API_KEY` | API key de [Resend](https://resend.com) (correos) | `re_xxxxxxxxxxxx` |
| `MAIL_FROM` | Remitente visible | `pub <no-reply@pub.novamicktools.com>` |
| `CLOUDINARY_CLOUD_NAME` | Cloud name de Cloudinary (avatares) | `dxxxxxxxx` |
| `CLOUDINARY_API_KEY` | API key de Cloudinary | `581448341657859` |
| `CLOUDINARY_API_SECRET` | API secret de Cloudinary (solo server) | `xxxxxxxxxxxxxxx` |

> `RESEND_API_KEY` es para la verificación de email y la recuperación de
> contraseña. Se usa la API HTTP de Resend (no SMTP): Railway bloquea/filtra
> los puertos salientes que usa SMTP, por eso el cambio. El dominio
> `pub.novamicktools.com` está verificado en Resend (registros DNS en
> Cloudflare), así que se puede enviar desde `no-reply@pub.novamicktools.com`
> a cualquier destinatario. Sin un dominio propio verificado, `MAIL_FROM`
> tendría que ser `onboarding@resend.dev` (solo permite enviar a la casilla
> con la que te registraste en Resend).

> Las variables `CLOUDINARY_*` son para la subida de avatares de perfil. Son
> **opcionales**: si faltan, el endpoint de avatar responde `503` y el resto del
> server funciona igual. El **API secret vive solo en el server**, nunca se expone
> al cliente (la subida es firmada del lado del servidor).

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
| **User** | Usuarios registrados (username, email, passwordHash, emailVerified, avatarUrl, alias, bio, profileColor). |
| **Room** | Salas de chat. La sala global es "del sistema" (`createdBy` opcional). Las privadas llevan `isPrivate` + `inviteCode`. |
| **RoomMember** | Relación usuario ↔ sala (quién está en qué sala). |
| **Message** | Mensaje de sala (`roomId`) o privado (`recipientId`), con `imageUrl`, `replyToId` y `editedAt` opcionales. |
| **Reaction** | Reacción de un usuario a un mensaje con un emoji de la paleta cerrada (PK compuesta: toggle). |
| **ReadMark** | Hasta cuándo leyó cada usuario cada conversación (base de los no leídos persistentes). |
| **Friendship** | Solicitudes y vínculos de amistad (PENDING / ACCEPTED / REJECTED / BLOCKED). |

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
| `POST` | `/api/auth/resend-verification` | Reenviar el correo de verificación (cooldown 60s) | Sí |
| `POST` | `/api/users/me/avatar` | Subir/actualizar la foto de perfil (multipart, campo `avatar`) | Sí |
| `PATCH` | `/api/users/me` | Actualizar alias, bio y/o color de perfil | Sí |
| `GET` | `/api/users/:id` | Ver el perfil público de un usuario (con su presencia) | Sí |
| `POST` | `/api/uploads/image` | Subir una imagen de chat (multipart, campo `image`, máx 5 MB); devuelve `{ url }` para enviarla como `imageUrl` por socket | Sí |

> Las rutas de chat se manejan por WebSocket, no por HTTP.

---

## Eventos de WebSocket

| Evento | Dirección | Descripción |
|--------|-----------|-------------|
| `users:online` | server → cliente | Lista de usuarios conectados (avatar, alias, status) |
| `presence:set` | cliente → server | Cambiar el estado propio (`online`/`dnd`/`invisible`) |
| `rooms:list` | server → cliente | Salas visibles al conectar: públicas + privadas propias (con `joined` e `inviteCode` si es miembro) |
| `room:history` | server → cliente (al conectar) / cliente → server (ack) | Historia de la global al conectar; historial de otra sala bajo demanda |
| `room:message` | bidireccional | Mensaje a una sala (`roomId` opcional, null = global). Acepta `replyToId` e `imageUrl` |
| `room:message:delete` / `room:message:deleted` | cliente → server / server → sala | Borrar un mensaje de sala (el autor siempre; el creador de la sala puede borrar ajenos) |
| `room:create` | cliente → server (ack) | Crear sala (`name`, `isPrivate`); el creador queda como miembro |
| `room:created` | server → todos | Anuncio de sala pública nueva (las privadas no se anuncian) |
| `room:join` | cliente → server (ack) | Unirse por `roomId` (solo públicas) o por `code` de invitación (cualquiera) |
| `room:leave` | cliente → server (ack) | Salir de una sala |
| `dm:conversations` | server → cliente | Conversaciones DM existentes al conectar (partner + fecha del último mensaje) |
| `dm:history` | cliente → server (ack) | Últimos N mensajes con un usuario |
| `dm:message` | bidireccional | Mensaje privado. Acepta `replyToId` e `imageUrl` |
| `dm:message:delete` / `dm:message:deleted` | cliente → server / server → ambos extremos | Borrar un DM propio |
| `typing:start` / `typing:stop` | bidireccional | Indicador de "escribiendo" (relay efímero, no persiste) |
| `room:message:edit` / `room:message:edited` | cliente → server / server → sala | Editar un mensaje propio (marca `editedAt`) |
| `dm:message:edit` / `dm:message:edited` | cliente → server / server → ambos extremos | Editar un DM propio |
| `message:react` / `message:reactions` | cliente → server (ack) / server → conversación | Reaccionar con un emoji de la paleta cerrada (toggle) |
| `message:pin` / `message:pinned` | cliente → server (ack) / server → sala | Fijar/desfijar un mensaje de sala (toggle; cualquier miembro) |
| `room:pins` | cliente → server (ack) | Mensajes fijados de una sala (solo miembros) |
| `messages:search` | cliente → server (ack) | Buscar texto en la conversación abierta (sala o DM); `ILIKE`, máx. 20 resultados |
| `room:kick` / `room:kicked` | cliente → server (ack) / server → expulsado | El creador de la sala expulsa a un miembro; el expulsado recibe el aviso y sale de la sala |
| `read:mark` | cliente → server | Marcar una conversación como leída hasta ahora (persistente) |
| `unread:state` | server → cliente (al conectar) | No leídos acumulados por conversación desde la última lectura |
| `voice:join` / `voice:leave` | cliente → server (ack) | Entrar/salir del canal de voz de una sala (mesh P2P con tope de participantes) |
| `voice:members` | server → sala | Quiénes están en el canal de voz de la sala |
| `voice:signal` / `voice:peer-left` | relay dirigido / server → sala | Señalización WebRTC del mesh y salida de un par |
| `call:invite` / `call:incoming` | cliente → server / server → destinatario | Invitar a una llamada de voz 1-a-1 (desde un DM) |
| `call:accept` / `call:accepted` | cliente → server / server → quien llama | Aceptar la llamada (dispara la negociación WebRTC) |
| `call:reject` / `call:rejected` | cliente → server / server → quien llama | Rechazar (o responder "ocupado") |
| `call:signal` | bidireccional | Relay opaco de señalización WebRTC (SDP e ICE); el audio va P2P, no pasa por el server |
| `call:hangup` / `call:ended` | cliente → server / server → el otro par | Colgar la llamada |

> El JWT se envía en `auth: { token }` durante el handshake y se valida con un
> middleware `io.use(...)` antes de aceptar la conexión.
>
> Las invitaciones a salas viajan como un DM cuyo contenido es
> `pub:invite/<código>/<nombre>`; el cliente lo renderiza como una tarjeta con
> botón "Unirse".
>
> Los envíos de mensajes tienen **rate limit** por usuario (ráfaga de 5,
> recarga de 1 por segundo); el exceso responde error por el ack del socket.
>
> `room:history` y `dm:history` aceptan un cursor `before` (fecha) para
> paginar el historial hacia atrás (scroll infinito).

---

## Despliegue en Railway

Desplegado en el proyecto **chat-tiempo-real**, servicio **chat-server**
(linkeado al repo de GitHub: cada push a `main` dispara redeploy automático):

**https://chat-server-production-fcc5.up.railway.app**

Pasos seguidos:

1. Proyecto Railway con el plugin **PostgreSQL** (servicio `Postgres`).
2. Servicio `chat-server` creado con `railway add --repo <owner>/chat-server`.
3. Variables de entorno cargadas desde `.env` local; `DATABASE_URL` referencia
   la interna del servicio Postgres: `${{Postgres.DATABASE_URL}}`.
4. Migraciones aplicadas una sola vez de forma manual usando la URL **pública**
   del Postgres (`DATABASE_PUBLIC_URL`, no la interna `postgres.railway.internal`,
   que no es alcanzable desde fuera de la red de Railway):
   ```bash
   DATABASE_URL=<DATABASE_PUBLIC_URL de Railway> npx prisma migrate deploy
   ```
5. Comando de inicio: `npm start` (definido en `package.json`).
6. Dominio público generado con `railway domain`.

---

## Cliente

El frontend que consume este servidor está en el repositorio **[chat-client](#)**
(React + Vite + socket.io-client).

---

<div align="center">
Proyecto académico — Aplicaciones Distribuidas · Segundo parcial
</div>
