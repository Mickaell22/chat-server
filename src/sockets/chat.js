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

// Da forma al mensaje que viaja al cliente: plano, con el remitente embebido.
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
        include: { sender: { select: { id: true, username: true, avatarUrl: true } } },
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
      try {
        const roomId = await getGlobalRoomId();
        const msg = await prisma.message.create({
          data: { content, senderId: user.id, roomId },
          include: { sender: { select: { id: true, username: true, avatarUrl: true } } },
        });
        io.to(GLOBAL_ROOM_NAME).emit('room:message', toClientMessage(msg));
        ack?.({ ok: true });
      } catch (err) {
        console.error('Error guardando mensaje:', err.message);
        ack?.({ error: 'No se pudo enviar el mensaje.' });
      }
    });

    socket.on('disconnect', (reason) => {
      removePresence(user.id);
      io.emit('users:online', onlineList());
      console.log(`[chat] desconectado ${user.username} (${reason}, online: ${online.size})`);
    });
  });
}
