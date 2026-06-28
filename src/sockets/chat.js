import { prisma } from '../lib/prisma.js';
import {
  GLOBAL_ROOM_NAME,
  MESSAGE_HISTORY_LIMIT,
  MAX_MESSAGE_LENGTH,
} from '../config/constants.js';

// Presencia en memoria: userId -> { username, count }. count cuenta sockets
// del mismo usuario (varias pestañas), asi solo aparece/desaparece de "online"
// cuando abre la primera o cierra la ultima.
// ponytail: estado en memoria, no sobrevive reinicio ni escala a multi-instancia.
// Techo: un solo proceso. Upgrade: @socket.io/redis-adapter + presencia en Redis.
const online = new Map();

function addPresence(user) {
  const entry = online.get(user.id);
  if (entry) entry.count += 1;
  else online.set(user.id, { username: user.username, avatarUrl: user.avatarUrl, count: 1 });
}

function removePresence(userId) {
  const entry = online.get(userId);
  if (!entry) return;
  entry.count -= 1;
  if (entry.count <= 0) online.delete(userId);
}

function onlineList() {
  return [...online.entries()].map(([id, { username, avatarUrl }]) => ({
    id,
    username,
    avatarUrl,
  }));
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

// include reutilizable: remitente + el mensaje citado (con su autor) si lo hay.
const MESSAGE_INCLUDE = {
  sender: { select: { id: true, username: true, avatarUrl: true } },
  replyTo: {
    include: { sender: { select: { id: true, username: true, avatarUrl: true } } },
  },
};

// Da forma al mensaje que viaja al cliente: plano, con el remitente embebido y,
// si es una respuesta, una cita liviana del mensaje original.
function toClientMessage(msg) {
  return {
    id: msg.id,
    content: msg.content,
    roomId: msg.roomId,
    createdAt: msg.createdAt,
    sender: {
      id: msg.sender.id,
      username: msg.sender.username,
      avatarUrl: msg.sender.avatarUrl,
    },
    replyTo: msg.replyTo
      ? {
          id: msg.replyTo.id,
          content: msg.replyTo.content,
          sender: {
            id: msg.replyTo.sender.id,
            username: msg.replyTo.sender.username,
            avatarUrl: msg.replyTo.sender.avatarUrl,
          },
        }
      : null,
  };
}

export function registerChatHandlers(io) {
  io.on('connection', async (socket) => {
    const { user } = socket.data;

    // El JWT solo trae id/username; el avatar puede haber cambiado, asi que lo
    // leemos de la DB para mostrarlo en la lista de online.
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true },
    });
    addPresence({ ...user, avatarUrl: dbUser?.avatarUrl ?? null });
    socket.join(GLOBAL_ROOM_NAME);
    io.emit('users:online', onlineList());
    console.log(`[chat] conectado ${user.username} (online: ${online.size})`);

    // Historia de la sala global: ultimos N, en orden cronologico ascendente.
    try {
      const roomId = await getGlobalRoomId();
      const history = await prisma.message.findMany({
        where: { roomId },
        orderBy: { createdAt: 'desc' },
        take: MESSAGE_HISTORY_LIMIT,
        include: MESSAGE_INCLUDE,
      });
      socket.emit('room:history', {
        room: GLOBAL_ROOM_NAME,
        messages: history.reverse().map(toClientMessage),
      });
    } catch (err) {
      console.error('Error cargando historia global:', err.message);
    }

    // Mensaje a la sala global. El payload del socket es input no confiable:
    // se valida y recorta antes de tocar la DB.
    socket.on('room:message', async (payload, ack) => {
      const content = typeof payload?.content === 'string' ? payload.content.trim() : '';
      if (!content) return ack?.({ error: 'Mensaje vacio.' });
      if (content.length > MAX_MESSAGE_LENGTH) {
        return ack?.({ error: 'Mensaje demasiado largo.' });
      }
      const replyToId = typeof payload?.replyToId === 'string' ? payload.replyToId : null;
      try {
        const roomId = await getGlobalRoomId();
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
          data: { content, senderId: user.id, roomId, replyToId: validReplyToId },
          include: MESSAGE_INCLUDE,
        });
        io.to(GLOBAL_ROOM_NAME).emit('room:message', toClientMessage(msg));
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
          select: { id: true, senderId: true },
        });
        if (!msg) return ack?.({ error: 'El mensaje no existe.' });
        if (msg.senderId !== user.id) {
          return ack?.({ error: 'No podes borrar este mensaje.' });
        }
        await prisma.message.delete({ where: { id } });
        io.to(GLOBAL_ROOM_NAME).emit('room:message:deleted', { id });
        ack?.({ ok: true });
      } catch (err) {
        console.error('Error borrando mensaje:', err.message);
        ack?.({ error: 'No se pudo borrar el mensaje.' });
      }
    });

    socket.on('disconnect', (reason) => {
      removePresence(user.id);
      io.emit('users:online', onlineList());
      console.log(`[chat] desconectado ${user.username} (${reason}, online: ${online.size})`);
    });
  });
}
