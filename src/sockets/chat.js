import { randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import {
  GLOBAL_ROOM_NAME,
  MESSAGE_HISTORY_LIMIT,
  MAX_MESSAGE_LENGTH,
  ROOM_NAME_MIN_LENGTH,
  ROOM_NAME_MAX_LENGTH,
  REACTION_EMOJIS,
  MESSAGE_BURST,
  MESSAGE_REFILL_PER_SEC,
} from '../config/constants.js';

// Presencia en memoria: userId -> { username, count, status }. count cuenta
// sockets del mismo usuario (varias pestañas), asi solo aparece/desaparece de
// "online" cuando abre la primera o cierra la ultima. status es manual
// (online/dnd/invisible), elegido por el usuario via 'presence:set'; arranca
// en 'online' y NO se persiste entre reconexiones (si cierra todas las
// pestañas y vuelve, arranca en 'online' de nuevo).
// ponytail: estado en memoria, no sobrevive reinicio ni escala a multi-instancia.
// Techo: un solo proceso. Upgrade: @socket.io/redis-adapter + presencia en Redis.
const online = new Map();
const PRESENCE_STATUSES = ['online', 'dnd', 'invisible'];

function addPresence(user) {
  const entry = online.get(user.id);
  if (entry) entry.count += 1;
  else {
    online.set(user.id, {
      username: user.username,
      alias: user.alias,
      avatarUrl: user.avatarUrl,
      count: 1,
      status: 'online',
    });
  }
}

function removePresence(userId) {
  const entry = online.get(userId);
  if (!entry) return;
  entry.count -= 1;
  if (entry.count <= 0) online.delete(userId);
}

function onlineList() {
  return [...online.entries()].map(([id, { username, alias, avatarUrl, status }]) => ({
    id,
    username,
    alias,
    avatarUrl,
    status,
  }));
}

// Un usuario invisible sigue "presente" pero solo se muestra a si mismo (para
// que su propio selector de estado refleje la eleccion real); para cualquier
// otro viewer cuenta como si no estuviera.
export function isVisibleTo(entry, viewerId) {
  return entry.status !== 'invisible' || entry.userId === viewerId;
}

// Status de un usuario tal como lo veria `viewerId` (usado por
// GET /api/users/:id para mostrar el estado en el perfil ajeno).
export function getPresenceStatus(targetId, viewerId) {
  const entry = online.get(targetId);
  if (!entry) return 'offline';
  return isVisibleTo({ ...entry, userId: targetId }, viewerId) ? entry.status : 'offline';
}

// Emite 'users:online' a todos con la lista publica (sin invisibles), y ademas
// manda la lista completa (incluyendose a si mismo) solo a la room personal de
// cada usuario invisible, para que su propio cliente sepa que sigue "online".
function broadcastPresence(io) {
  const list = onlineList();
  const publicList = list.filter((u) => u.status !== 'invisible');
  io.emit('users:online', publicList);
  for (const u of list) {
    if (u.status === 'invisible') {
      io.to(`user:${u.id}`).emit('users:online', [...publicList, u]);
    }
  }
}

// Asegura que la sala global exista (idempotente). Cachea su id tras el primer
// upsert para no pegarle a la DB en cada conexion.
let globalRoomId = null;
async function getGlobalRoomId() {
  if (!globalRoomId) {
    const room = await prisma.room.upsert({
      where: { name: GLOBAL_ROOM_NAME },
      create: { name: GLOBAL_ROOM_NAME },
      update: {},
    });
    globalRoomId = room.id;
  }
  return globalRoomId;
}

// include reutilizable: remitente, destinatario (solo DM) y el mensaje citado
// (con su autor) si lo hay.
const SENDER_SELECT = { id: true, username: true, alias: true, avatarUrl: true };
const MESSAGE_INCLUDE = {
  sender: { select: SENDER_SELECT },
  recipient: { select: SENDER_SELECT },
  replyTo: { include: { sender: { select: SENDER_SELECT } } },
  reactions: { select: { userId: true, emoji: true } },
};

function toClientSender(sender) {
  return { id: sender.id, username: sender.username, alias: sender.alias, avatarUrl: sender.avatarUrl };
}

// Da forma al mensaje que viaja al cliente: plano, con el remitente embebido y,
// si es una respuesta, una cita liviana del mensaje original.
// Solo se aceptan imagenes de NUESTRO Cloudinary: el socket es input no
// confiable y podria mandar cualquier URL como "imagen".
function isOwnImageUrl(url) {
  return (
    Boolean(env.cloudinary.cloudName) &&
    url.startsWith(`https://res.cloudinary.com/${env.cloudinary.cloudName}/`)
  );
}

// Agrupa las filas de Reaction en [{ emoji, userIds }] respetando el orden
// de la paleta. Pura para poder testearla.
export function summarizeReactions(rows) {
  const byEmoji = new Map();
  for (const r of rows) {
    if (!byEmoji.has(r.emoji)) byEmoji.set(r.emoji, []);
    byEmoji.get(r.emoji).push(r.userId);
  }
  return REACTION_EMOJIS.filter((e) => byEmoji.has(e)).map((emoji) => ({
    emoji,
    userIds: byEmoji.get(emoji),
  }));
}

function toClientMessage(msg) {
  return {
    id: msg.id,
    content: msg.content,
    imageUrl: msg.imageUrl ?? null,
    editedAt: msg.editedAt ?? null,
    roomId: msg.roomId,
    recipientId: msg.recipientId ?? null,
    createdAt: msg.createdAt,
    reactions: summarizeReactions(msg.reactions ?? []),
    sender: toClientSender(msg.sender),
    // Solo en DMs: el otro extremo completo, para que cualquier pestaña del
    // remitente pueda pintar la conversacion aunque no la tuviera abierta.
    recipient: msg.recipient ? toClientSender(msg.recipient) : null,
    replyTo: msg.replyTo
      ? {
          id: msg.replyTo.id,
          content: msg.replyTo.content,
          sender: toClientSender(msg.replyTo.sender),
        }
      : null,
  };
}

// Une los dos groupBy de DMs (enviados por destinatario, recibidos por
// remitente) en un mapa partnerId -> fecha del ultimo mensaje, quedandose con
// la mas reciente por partner. Pura para poder testearla.
export function mergeDmPartners(sent, received) {
  const lastByPartner = new Map();
  for (const row of sent) {
    lastByPartner.set(row.recipientId, row._max.createdAt);
  }
  for (const row of received) {
    const prev = lastByPartner.get(row.senderId);
    if (!prev || row._max.createdAt > prev) {
      lastByPartner.set(row.senderId, row._max.createdAt);
    }
  }
  return lastByPartner;
}

// Conversaciones DM de un usuario: cada partner con el que intercambio
// mensajes, con la fecha del ultimo, ordenadas de mas reciente a mas vieja.
async function dmConversations(userId) {
  const [sent, received] = await Promise.all([
    prisma.message.groupBy({
      by: ['recipientId'],
      where: { senderId: userId, recipientId: { not: null } },
      _max: { createdAt: true },
    }),
    prisma.message.groupBy({
      by: ['senderId'],
      where: { recipientId: userId },
      _max: { createdAt: true },
    }),
  ]);
  const lastByPartner = mergeDmPartners(sent, received);
  if (lastByPartner.size === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: [...lastByPartner.keys()] } },
    select: SENDER_SELECT,
  });
  return users
    .map((u) => ({ user: toClientSender(u), lastMessageAt: lastByPartner.get(u.id) }))
    .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
}

// true si el mensaje es un DM entre exactamente estos dos usuarios (en
// cualquier direccion). Usado para validar replyToId dentro de un DM.
function isSameDmPair(msg, a, b) {
  return (
    Boolean(msg.recipientId) &&
    ((msg.senderId === a && msg.recipientId === b) ||
      (msg.senderId === b && msg.recipientId === a))
  );
}

// Token bucket puro: devuelve si hay token y el estado nuevo del bucket.
// Los tokens se recargan de forma continua con el tiempo transcurrido.
export function takeToken(bucket, now, burst = MESSAGE_BURST, refillPerSec = MESSAGE_REFILL_PER_SEC) {
  const tokens = Math.min(burst, bucket.tokens + ((now - bucket.last) / 1000) * refillPerSec);
  if (tokens < 1) return { ok: false, bucket: { tokens, last: now } };
  return { ok: true, bucket: { tokens: tokens - 1, last: now } };
}

// Rate limit de mensajes por usuario. En memoria, un proceso (como la
// presencia). Limite de confianza: evita que un cliente hostil inunde las
// salas por el socket.
const messageBuckets = new Map();
function allowMessage(userId) {
  const now = Date.now();
  const cur = messageBuckets.get(userId) ?? { tokens: MESSAGE_BURST, last: now };
  const { ok, bucket } = takeToken(cur, now);
  messageBuckets.set(userId, bucket);
  return ok;
}

// chatKey valido para marcas de lectura (input no confiable): 'room:<id>' o
// 'dm:<id>' con ids uuid-ish. Pura para poder testearla.
export function isValidChatKey(key) {
  return typeof key === 'string' && /^(room|dm):[0-9a-f-]{36}$/.test(key);
}

// No leidos por conversacion segun las marcas de lectura del usuario. Solo
// cuentan conversaciones CON marca (se crea al abrirla por primera vez) y
// nunca los mensajes propios.
async function unreadState(userId, roomIds) {
  const marks = await prisma.readMark.findMany({ where: { userId } });
  const byKey = new Map(marks.map((m) => [m.chatKey, m.lastReadAt]));
  const state = {};
  await Promise.all(
    [...byKey.entries()].map(async ([chatKey, since]) => {
      const [kind, id] = chatKey.split(':');
      let count = 0;
      if (kind === 'room') {
        if (!roomIds.has(id)) return; // ya no es miembro
        count = await prisma.message.count({
          where: { roomId: id, createdAt: { gt: since }, senderId: { not: userId } },
        });
      } else {
        count = await prisma.message.count({
          where: { senderId: id, recipientId: userId, createdAt: { gt: since } },
        });
      }
      if (count > 0) state[chatKey] = count;
    }),
  );
  return state;
}

// Cursor de paginacion de historial: fecha limite superior (exclusiva) que
// manda el cliente para pedir mensajes mas viejos. Input no confiable.
function parseBefore(payload) {
  if (typeof payload?.before !== 'string') return null;
  const d = new Date(payload.before);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Nombre de la room de Socket.IO para una sala de la DB.
function socketRoom(roomId) {
  return `room:${roomId}`;
}

// Normaliza el nombre de sala que manda el usuario (input no confiable):
// minusculas, espacios a guiones, solo [a-z0-9-]. Pura para poder testearla.
export function normalizeRoomName(raw) {
  const name =
    typeof raw === 'string'
      ? raw.trim().toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-')
      : '';
  if (!/^[a-z0-9-]*$/.test(name)) {
    return { error: 'Solo letras, numeros, espacios y guiones.' };
  }
  if (name.length < ROOM_NAME_MIN_LENGTH || name.length > ROOM_NAME_MAX_LENGTH) {
    return {
      error: `El nombre debe tener entre ${ROOM_NAME_MIN_LENGTH} y ${ROOM_NAME_MAX_LENGTH} caracteres.`,
    };
  }
  if (name === GLOBAL_ROOM_NAME) return { error: 'Ese nombre esta reservado.' };
  return { name };
}

// Vista de una sala para el cliente. El codigo de invitacion SOLO viaja a
// miembros: un no-miembro no debe poder invitarse solo a una sala privada.
function toClientRoom(room, joined) {
  return {
    id: room.id,
    name: room.name,
    isPrivate: room.isPrivate,
    joined,
    inviteCode: joined ? room.inviteCode : null,
  };
}

// ponytail: 8 hex al azar, un solo intento; si chocara con el unique (P2002,
// probabilidad ~nula) el usuario simplemente reintenta crear la sala.
function newInviteCode() {
  return randomBytes(4).toString('hex');
}

export function registerChatHandlers(io) {
  io.on('connection', async (socket) => {
    const { user } = socket.data;

    // El JWT solo trae id/username; avatar y alias pueden haber cambiado desde
    // que se firmo, asi que se leen de la DB para la lista de online.
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true, alias: true },
    });
    addPresence({ ...user, avatarUrl: dbUser?.avatarUrl ?? null, alias: dbUser?.alias ?? null });
    socket.join(`user:${user.id}`);
    broadcastPresence(io);
    console.log(`[chat] conectado ${user.username} (online: ${online.size})`);

    // Al conectar: el socket entra a la global y a TODAS las salas donde es
    // miembro (asi recibe mensajes en vivo, y el cliente cuenta no leidos,
    // aunque no tenga esa sala abierta). Ademas manda la lista de salas y la
    // historia de la global.
    try {
      const globalId = await getGlobalRoomId();
      socket.join(socketRoom(globalId));

      const memberships = await prisma.roomMember.findMany({
        where: { userId: user.id },
        include: { room: true },
      });
      for (const m of memberships) socket.join(socketRoom(m.roomId));

      // Lista para el sidebar: todas las publicas + las privadas propias.
      const joinedIds = new Set(memberships.map((m) => m.roomId));
      const publicRooms = await prisma.room.findMany({
        where: { isPrivate: false, name: { not: GLOBAL_ROOM_NAME } },
        orderBy: { createdAt: 'asc' },
      });
      const rooms = publicRooms.map((r) => toClientRoom(r, joinedIds.has(r.id)));
      for (const m of memberships) {
        if (m.room.isPrivate) rooms.push(toClientRoom(m.room, true));
      }
      socket.emit('rooms:list', rooms);

      // Historia de la sala global: ultimos N, en orden cronologico ascendente.
      const history = await prisma.message.findMany({
        where: { roomId: globalId },
        orderBy: { createdAt: 'desc' },
        take: MESSAGE_HISTORY_LIMIT,
        include: MESSAGE_INCLUDE,
      });
      socket.emit('room:history', {
        room: GLOBAL_ROOM_NAME,
        roomId: globalId,
        messages: history.reverse().map(toClientMessage),
      });

      // No leidos acumulados desde la ultima vez (persisten entre sesiones).
      const roomIds = new Set([globalId, ...memberships.map((m) => m.roomId)]);
      socket.emit('unread:state', await unreadState(user.id, roomIds));
    } catch (err) {
      console.error('Error inicializando salas:', err.message);
    }

    // Conversaciones DM existentes, para pintar el sidebar al entrar.
    try {
      socket.emit('dm:conversations', await dmConversations(user.id));
    } catch (err) {
      console.error('Error cargando conversaciones DM:', err.message);
    }

    // Mensaje a una sala (global si no viene roomId). El payload del socket
    // es input no confiable: se valida y recorta antes de tocar la DB.
    socket.on('room:message', async (payload, ack) => {
      if (!allowMessage(user.id)) {
        return ack?.({ error: 'Estas enviando muy rapido; espera un momento.' });
      }
      const content = typeof payload?.content === 'string' ? payload.content.trim() : '';
      const imageUrl = typeof payload?.imageUrl === 'string' ? payload.imageUrl : null;
      if (imageUrl && !isOwnImageUrl(imageUrl)) return ack?.({ error: 'Imagen invalida.' });
      // Un mensaje puede ser solo texto, solo imagen, o imagen con caption.
      if (!content && !imageUrl) return ack?.({ error: 'Mensaje vacio.' });
      if (content.length > MAX_MESSAGE_LENGTH) {
        return ack?.({ error: 'Mensaje demasiado largo.' });
      }
      const requestedRoomId = typeof payload?.roomId === 'string' ? payload.roomId : null;
      const replyToId = typeof payload?.replyToId === 'string' ? payload.replyToId : null;
      try {
        const globalId = await getGlobalRoomId();
        const roomId = requestedRoomId ?? globalId;
        // Limite de confianza: en cualquier sala que no sea la global hay
        // que ser miembro para escribir.
        if (roomId !== globalId) {
          const member = await prisma.roomMember.findUnique({
            where: { userId_roomId: { userId: user.id, roomId } },
          });
          if (!member) return ack?.({ error: 'No eres miembro de esta sala.' });
        }
        // El replyToId es input no confiable: solo se acepta si el mensaje
        // citado existe y pertenece a esta misma sala.
        let validReplyToId = null;
        if (replyToId) {
          const parent = await prisma.message.findUnique({
            where: { id: replyToId },
            select: { id: true, roomId: true },
          });
          if (parent && parent.roomId === roomId) validReplyToId = parent.id;
        }
        const msg = await prisma.message.create({
          data: { content, imageUrl, senderId: user.id, roomId, replyToId: validReplyToId },
          include: MESSAGE_INCLUDE,
        });
        io.to(socketRoom(roomId)).emit('room:message', toClientMessage(msg));
        ack?.({ ok: true });
      } catch (err) {
        console.error('Error guardando mensaje:', err.message);
        ack?.({ error: 'No se pudo enviar el mensaje.' });
      }
    });

    // Borrar un mensaje propio. Solo el autor puede (limite de confianza: se
    // valida en el server, no se confia en que el cliente oculte el boton).
    socket.on('room:message:delete', async (payload, ack) => {
      const id = typeof payload?.id === 'string' ? payload.id : '';
      if (!id) return ack?.({ error: 'Falta el id del mensaje.' });
      try {
        const msg = await prisma.message.findUnique({
          where: { id },
          select: { id: true, senderId: true, roomId: true },
        });
        // Debe ser un mensaje de sala (los DM se borran por su propio evento).
        if (!msg || !msg.roomId) return ack?.({ error: 'El mensaje no existe.' });
        if (msg.senderId !== user.id) {
          return ack?.({ error: 'No podes borrar este mensaje.' });
        }
        await prisma.message.delete({ where: { id } });
        io.to(socketRoom(msg.roomId)).emit('room:message:deleted', { id });
        ack?.({ ok: true });
      } catch (err) {
        console.error('Error borrando mensaje:', err.message);
        ack?.({ error: 'No se pudo borrar el mensaje.' });
      }
    });

    // Editar un mensaje propio de sala. Mismas reglas de contenido que al
    // enviar; solo el autor (limite de confianza, validado aca).
    socket.on('room:message:edit', async (payload, ack) => {
      const id = typeof payload?.id === 'string' ? payload.id : '';
      const content = typeof payload?.content === 'string' ? payload.content.trim() : '';
      if (!id) return ack?.({ error: 'Falta el id del mensaje.' });
      if (!content) return ack?.({ error: 'Mensaje vacio.' });
      if (content.length > MAX_MESSAGE_LENGTH) {
        return ack?.({ error: 'Mensaje demasiado largo.' });
      }
      try {
        const msg = await prisma.message.findUnique({
          where: { id },
          select: { id: true, senderId: true, roomId: true },
        });
        if (!msg || !msg.roomId) return ack?.({ error: 'El mensaje no existe.' });
        if (msg.senderId !== user.id) {
          return ack?.({ error: 'No puedes editar este mensaje.' });
        }
        const updated = await prisma.message.update({
          where: { id },
          data: { content, editedAt: new Date() },
          select: { id: true, content: true, editedAt: true },
        });
        io.to(socketRoom(msg.roomId)).emit('room:message:edited', updated);
        ack?.({ ok: true });
      } catch (err) {
        console.error('Error editando mensaje:', err.message);
        ack?.({ error: 'No se pudo editar el mensaje.' });
      }
    });

    // Crear una sala. El creador queda como miembro y entra de una. Toda
    // sala nueva recibe codigo de invitacion (publicas y privadas).
    socket.on('room:create', async (payload, ack) => {
      const res = normalizeRoomName(payload?.name);
      if (res.error) return ack?.({ error: res.error });
      const isPrivate = Boolean(payload?.isPrivate);
      try {
        const room = await prisma.room.create({
          data: {
            name: res.name,
            createdBy: user.id,
            isPrivate,
            inviteCode: newInviteCode(),
            members: { create: { userId: user.id } },
          },
        });
        io.in(`user:${user.id}`).socketsJoin(socketRoom(room.id));
        // Las publicas se anuncian a todos (salen en "explorar salas"); las
        // privadas solo existen para sus miembros.
        if (!room.isPrivate) {
          socket.broadcast.emit('room:created', toClientRoom(room, false));
        }
        ack?.({ room: toClientRoom(room, true) });
      } catch (err) {
        if (err.code === 'P2002') {
          return ack?.({ error: 'Ya existe una sala con ese nombre.' });
        }
        console.error('Error creando sala:', err.message);
        ack?.({ error: 'No se pudo crear la sala.' });
      }
    });

    // Unirse a una sala: por id (solo publicas) o por codigo de invitacion
    // (cualquiera; es la unica puerta de entrada a una privada).
    socket.on('room:join', async (payload, ack) => {
      const roomId = typeof payload?.roomId === 'string' ? payload.roomId : null;
      const code = typeof payload?.code === 'string' ? payload.code.trim() : null;
      try {
        let room = null;
        if (code) {
          room = await prisma.room.findUnique({ where: { inviteCode: code } });
        } else if (roomId) {
          room = await prisma.room.findUnique({ where: { id: roomId } });
          if (room?.isPrivate) room = null;
        }
        if (!room || room.name === GLOBAL_ROOM_NAME) {
          return ack?.({ error: code ? 'Codigo invalido.' : 'La sala no existe.' });
        }
        // Idempotente: unirse dos veces no duplica la membresia.
        await prisma.roomMember.upsert({
          where: { userId_roomId: { userId: user.id, roomId: room.id } },
          create: { userId: user.id, roomId: room.id },
          update: {},
        });
        // Todas las pestañas del usuario empiezan a recibir la sala en vivo.
        io.in(`user:${user.id}`).socketsJoin(socketRoom(room.id));
        ack?.({ room: toClientRoom(room, true) });
      } catch (err) {
        console.error('Error uniendose a sala:', err.message);
        ack?.({ error: 'No se pudo unir a la sala.' });
      }
    });

    // Salir de una sala. La sala sigue existiendo (sin dueño efectivo).
    socket.on('room:leave', async (payload, ack) => {
      const roomId = typeof payload?.roomId === 'string' ? payload.roomId : '';
      if (!roomId) return ack?.({ error: 'Falta la sala.' });
      try {
        await prisma.roomMember.deleteMany({ where: { userId: user.id, roomId } });
        io.in(`user:${user.id}`).socketsLeave(socketRoom(roomId));
        ack?.({ ok: true });
      } catch (err) {
        console.error('Error saliendo de sala:', err.message);
        ack?.({ error: 'No se pudo salir de la sala.' });
      }
    });

    // Historial de una sala (lo pide el cliente al abrirla). Solo miembros;
    // la global no pasa por aca (llega sola al conectar).
    socket.on('room:history', async (payload, ack) => {
      const roomId = typeof payload?.roomId === 'string' ? payload.roomId : '';
      if (!roomId) return ack?.({ error: 'Falta la sala.' });
      const before = parseBefore(payload);
      try {
        // La global es de todos; el resto exige membresia.
        if (roomId !== (await getGlobalRoomId())) {
          const member = await prisma.roomMember.findUnique({
            where: { userId_roomId: { userId: user.id, roomId } },
          });
          if (!member) return ack?.({ error: 'No eres miembro de esta sala.' });
        }
        const history = await prisma.message.findMany({
          where: { roomId, ...(before ? { createdAt: { lt: before } } : {}) },
          orderBy: { createdAt: 'desc' },
          take: MESSAGE_HISTORY_LIMIT,
          include: MESSAGE_INCLUDE,
        });
        ack?.({ messages: history.reverse().map(toClientMessage) });
      } catch (err) {
        console.error('Error cargando historia de sala:', err.message);
        ack?.({ error: 'No se pudo cargar la sala.' });
      }
    });

    // Historial de un DM: ultimos N mensajes entre este usuario y otro, en
    // orden cronologico. Se responde por ack (solo lo pide quien abre el DM).
    socket.on('dm:history', async (payload, ack) => {
      const withUserId = typeof payload?.withUserId === 'string' ? payload.withUserId : '';
      if (!withUserId) return ack?.({ error: 'Falta el usuario.' });
      const before = parseBefore(payload);
      try {
        const history = await prisma.message.findMany({
          where: {
            OR: [
              { senderId: user.id, recipientId: withUserId },
              { senderId: withUserId, recipientId: user.id },
            ],
            ...(before ? { createdAt: { lt: before } } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: MESSAGE_HISTORY_LIMIT,
          include: MESSAGE_INCLUDE,
        });
        ack?.({ messages: history.reverse().map(toClientMessage) });
      } catch (err) {
        console.error('Error cargando historia DM:', err.message);
        ack?.({ error: 'No se pudo cargar la conversacion.' });
      }
    });

    // Mensaje privado. Mismas validaciones de contenido que la sala; ademas el
    // destinatario debe existir (input no confiable) y no ser uno mismo.
    socket.on('dm:message', async (payload, ack) => {
      if (!allowMessage(user.id)) {
        return ack?.({ error: 'Estas enviando muy rapido; espera un momento.' });
      }
      const content = typeof payload?.content === 'string' ? payload.content.trim() : '';
      const imageUrl = typeof payload?.imageUrl === 'string' ? payload.imageUrl : null;
      if (imageUrl && !isOwnImageUrl(imageUrl)) return ack?.({ error: 'Imagen invalida.' });
      if (!content && !imageUrl) return ack?.({ error: 'Mensaje vacio.' });
      if (content.length > MAX_MESSAGE_LENGTH) {
        return ack?.({ error: 'Mensaje demasiado largo.' });
      }
      const toUserId = typeof payload?.toUserId === 'string' ? payload.toUserId : '';
      if (!toUserId) return ack?.({ error: 'Falta el destinatario.' });
      if (toUserId === user.id) {
        return ack?.({ error: 'No puedes enviarte mensajes a ti mismo.' });
      }
      const replyToId = typeof payload?.replyToId === 'string' ? payload.replyToId : null;
      try {
        const recipient = await prisma.user.findUnique({
          where: { id: toUserId },
          select: { id: true },
        });
        if (!recipient) return ack?.({ error: 'El destinatario no existe.' });
        // Solo se puede citar un mensaje de ESTA misma conversacion.
        let validReplyToId = null;
        if (replyToId) {
          const parent = await prisma.message.findUnique({
            where: { id: replyToId },
            select: { id: true, senderId: true, recipientId: true },
          });
          if (parent && isSameDmPair(parent, user.id, toUserId)) {
            validReplyToId = parent.id;
          }
        }
        const msg = await prisma.message.create({
          data: {
            content,
            imageUrl,
            senderId: user.id,
            recipientId: toUserId,
            replyToId: validReplyToId,
          },
          include: MESSAGE_INCLUDE,
        });
        // A las rooms personales de ambos extremos: cubre todas las pestañas
        // del destinatario Y las del remitente (incluida la que envio).
        io.to(`user:${toUserId}`).to(`user:${user.id}`).emit('dm:message', toClientMessage(msg));
        ack?.({ ok: true });
      } catch (err) {
        console.error('Error guardando DM:', err.message);
        ack?.({ error: 'No se pudo enviar el mensaje.' });
      }
    });

    // Borrar un DM propio. Igual que en la sala: solo el autor (limite de
    // confianza, validado server-side).
    socket.on('dm:message:delete', async (payload, ack) => {
      const id = typeof payload?.id === 'string' ? payload.id : '';
      if (!id) return ack?.({ error: 'Falta el id del mensaje.' });
      try {
        const msg = await prisma.message.findUnique({
          where: { id },
          select: { id: true, senderId: true, recipientId: true },
        });
        if (!msg || !msg.recipientId) return ack?.({ error: 'El mensaje no existe.' });
        if (msg.senderId !== user.id) {
          return ack?.({ error: 'No puedes borrar este mensaje.' });
        }
        await prisma.message.delete({ where: { id } });
        io.to(`user:${msg.senderId}`)
          .to(`user:${msg.recipientId}`)
          .emit('dm:message:deleted', { id });
        ack?.({ ok: true });
      } catch (err) {
        console.error('Error borrando DM:', err.message);
        ack?.({ error: 'No se pudo borrar el mensaje.' });
      }
    });

    // Editar un DM propio. Igual que en salas, hacia ambos extremos.
    socket.on('dm:message:edit', async (payload, ack) => {
      const id = typeof payload?.id === 'string' ? payload.id : '';
      const content = typeof payload?.content === 'string' ? payload.content.trim() : '';
      if (!id) return ack?.({ error: 'Falta el id del mensaje.' });
      if (!content) return ack?.({ error: 'Mensaje vacio.' });
      if (content.length > MAX_MESSAGE_LENGTH) {
        return ack?.({ error: 'Mensaje demasiado largo.' });
      }
      try {
        const msg = await prisma.message.findUnique({
          where: { id },
          select: { id: true, senderId: true, recipientId: true },
        });
        if (!msg || !msg.recipientId) return ack?.({ error: 'El mensaje no existe.' });
        if (msg.senderId !== user.id) {
          return ack?.({ error: 'No puedes editar este mensaje.' });
        }
        const updated = await prisma.message.update({
          where: { id },
          data: { content, editedAt: new Date() },
          select: { id: true, content: true, editedAt: true },
        });
        io.to(`user:${msg.senderId}`)
          .to(`user:${msg.recipientId}`)
          .emit('dm:message:edited', updated);
        ack?.({ ok: true });
      } catch (err) {
        console.error('Error editando DM:', err.message);
        ack?.({ error: 'No se pudo editar el mensaje.' });
      }
    });

    // Reaccionar a un mensaje (toggle). El emoji se valida contra la paleta
    // cerrada y hay que poder VER el mensaje (miembro de la sala o extremo
    // del DM) para reaccionar: limite de confianza.
    socket.on('message:react', async (payload, ack) => {
      const id = typeof payload?.id === 'string' ? payload.id : '';
      const emoji = typeof payload?.emoji === 'string' ? payload.emoji : '';
      if (!id || !REACTION_EMOJIS.includes(emoji)) {
        return ack?.({ error: 'Reaccion invalida.' });
      }
      try {
        const msg = await prisma.message.findUnique({
          where: { id },
          select: { id: true, senderId: true, roomId: true, recipientId: true },
        });
        if (!msg) return ack?.({ error: 'El mensaje no existe.' });
        const globalId = await getGlobalRoomId();
        if (msg.roomId) {
          if (msg.roomId !== globalId && !socket.rooms.has(socketRoom(msg.roomId))) {
            return ack?.({ error: 'No eres miembro de esta sala.' });
          }
        } else if (msg.senderId !== user.id && msg.recipientId !== user.id) {
          return ack?.({ error: 'No puedes reaccionar a este mensaje.' });
        }
        // Toggle contra la PK compuesta: si ya existia, se quita.
        const key = { messageId: id, userId: user.id, emoji };
        const existing = await prisma.reaction.findUnique({
          where: { messageId_userId_emoji: key },
        });
        if (existing) await prisma.reaction.delete({ where: { messageId_userId_emoji: key } });
        else await prisma.reaction.create({ data: key });
        const rows = await prisma.reaction.findMany({
          where: { messageId: id },
          select: { userId: true, emoji: true },
        });
        const event = { id, reactions: summarizeReactions(rows) };
        if (msg.roomId) {
          io.to(socketRoom(msg.roomId)).emit('message:reactions', event);
        } else {
          io.to(`user:${msg.senderId}`)
            .to(`user:${msg.recipientId}`)
            .emit('message:reactions', event);
        }
        ack?.({ ok: true });
      } catch (err) {
        console.error('Error reaccionando:', err.message);
        ack?.({ error: 'No se pudo reaccionar.' });
      }
    });

    // Marca "leido hasta ahora" de una conversacion. Se upsertea al abrirla
    // y mientras llegan mensajes con la conversacion a la vista.
    socket.on('read:mark', async (payload) => {
      const chatKey = payload?.chatKey;
      if (!isValidChatKey(chatKey)) return;
      try {
        await prisma.readMark.upsert({
          where: { userId_chatKey: { userId: user.id, chatKey } },
          create: { userId: user.id, chatKey },
          update: { lastReadAt: new Date() },
        });
      } catch (err) {
        console.error('Error marcando lectura:', err.message);
      }
    });

    // Indicador de "escribiendo": relay efimero, no toca la DB. Para salas,
    // la pertenencia se valida contra las rooms del propio socket (memoria);
    // para DM se relaya a la room personal del destinatario. El cliente
    // descarta por timeout si el stop se pierde.
    const relayTyping = (event) => async (payload) => {
      const toUserId = typeof payload?.toUserId === 'string' ? payload.toUserId : null;
      const roomId = typeof payload?.roomId === 'string' ? payload.roomId : null;
      const entry = online.get(user.id);
      const typer = { id: user.id, username: user.username, alias: entry?.alias ?? null };
      try {
        if (toUserId) {
          io.to(`user:${toUserId}`).emit(event, { user: typer, roomId: null });
          return;
        }
        const globalId = await getGlobalRoomId();
        const target = roomId ?? globalId;
        if (!socket.rooms.has(socketRoom(target))) return;
        socket.to(socketRoom(target)).emit(event, { user: typer, roomId: target });
      } catch (err) {
        console.error('Error relayando typing:', err.message);
      }
    };
    socket.on('typing:start', relayTyping('typing:start'));
    socket.on('typing:stop', relayTyping('typing:stop'));

    // Cambio manual de estado (online/dnd/invisible). Input no confiable: se
    // valida contra el enum antes de aplicar.
    socket.on('presence:set', (payload) => {
      const status = typeof payload?.status === 'string' ? payload.status : '';
      if (!PRESENCE_STATUSES.includes(status)) return;
      const entry = online.get(user.id);
      if (!entry) return;
      entry.status = status;
      broadcastPresence(io);
    });

    socket.on('disconnect', (reason) => {
      removePresence(user.id);
      broadcastPresence(io);
      console.log(`[chat] desconectado ${user.username} (${reason}, online: ${online.size})`);
    });
  });
}
