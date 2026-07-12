// Señalizacion de llamadas de voz 1-a-1 (experimento, feat/voice-call).
//
// IMPORTANTE: el audio NO pasa por aca. Este handler solo RELAYA los mensajes
// de señalizacion WebRTC (oferta/respuesta SDP + ICE candidates) entre los dos
// pares; una vez conectados, el audio viaja P2P por WebRTC (DTLS-SRTP), directo
// entre los navegadores, sin tocar el server. El server es la "central
// telefonica" que los presenta, no el cable de la voz.
//
// Reutiliza las rooms personales `user:${id}` que ya crea chat.js en cada
// conexion, asi que un mensaje se dirige a un usuario concreto (a todas sus
// pestañas) con io.to(`user:${to}`).
//
// ponytail: mesh P2P sin SFU ni TURN. Techos conocidos:
//   - 1-a-1 unicamente (un solo par). Para salas de voz haria falta N pares por
//     persona (mesh, tope ~4) o un SFU (mediasoup/LiveKit).
//   - Solo STUN (lo pone el cliente). Sin TURN, dos redes con NAT restrictivo
//     no conectan. Upgrade: coturn self-host o TURN pago.
//   - No hay registro de "ocupado" en el server: si A llama a B y B ya esta en
//     llamada, el cliente de B responde 'busy'. El server no lleva ese estado.

// --- Voz grupal por sala (mesh P2P) ---
//
// Mismo principio que las llamadas 1-a-1: el server solo presenta y relaya
// señalizacion; el audio va P2P entre TODOS los pares (mesh). ponytail: tope
// de participantes bajo porque cada uno mantiene N-1 conexiones; para salas
// grandes el upgrade es un SFU (mediasoup/LiveKit).
export const MAX_VOICE_PEERS = 5;

// roomId -> Map<userId, { id, username, alias }>. En memoria (un proceso).
const voiceRooms = new Map();
// userId -> roomId: una sola sala de voz por usuario a la vez.
const voiceByUser = new Map();

// Puede unirse si no esta ya en un canal de voz y hay lugar. Pura para test.
export function canJoinVoice({ alreadyIn, membersCount, max = MAX_VOICE_PEERS }) {
  if (alreadyIn) return 'Ya estas en un canal de voz.';
  if (membersCount >= max) return `El canal esta lleno (maximo ${max}).`;
  return null;
}

function voiceMembersList(roomId) {
  return [...(voiceRooms.get(roomId)?.values() ?? [])];
}

function leaveVoice(io, userId) {
  const roomId = voiceByUser.get(userId);
  if (!roomId) return;
  voiceByUser.delete(userId);
  const members = voiceRooms.get(roomId);
  members?.delete(userId);
  if (members && members.size === 0) voiceRooms.delete(roomId);
  // Los pares cierran su conexion con quien se fue; el resto de la sala
  // actualiza la lista de "en voz".
  io.to(`room:${roomId}`).emit('voice:members', {
    roomId,
    members: voiceMembersList(roomId),
  });
  io.to(`room:${roomId}`).emit('voice:peer-left', { roomId, userId });
}

// Extrae un id de destino valido del payload (input no confiable) y evita que
// alguien se "llame a si mismo".
export function targetId(payload, selfId) {
  const to = typeof payload?.to === 'string' ? payload.to : '';
  if (!to || to === selfId) return null;
  return to;
}

export function registerCallHandlers(io) {
  io.on('connection', (socket) => {
    const { user } = socket.data;

    // A invita a B. Se le manda a B quien llama (id + username) para que su
    // cliente muestre "X te esta llamando" aunque X no este en su lista online.
    socket.on('call:invite', (payload) => {
      const to = targetId(payload, user.id);
      if (!to) return;
      io.to(`user:${to}`).emit('call:incoming', {
        from: user.id,
        username: user.username,
        // Llamada con camara o solo voz: ambos lados abren el mismo tipo.
        video: Boolean(payload?.video),
      });
    });

    // B acepta: se avisa a A para que arranque la negociacion (cree la oferta).
    socket.on('call:accept', (payload) => {
      const to = targetId(payload, user.id);
      if (!to) return;
      io.to(`user:${to}`).emit('call:accepted', { from: user.id });
    });

    // B rechaza (o esta ocupado): A vuelve a idle.
    socket.on('call:reject', (payload) => {
      const to = targetId(payload, user.id);
      if (!to) return;
      io.to(`user:${to}`).emit('call:rejected', { from: user.id });
    });

    // Relay opaco de señalizacion WebRTC: SDP (oferta/respuesta) o un ICE
    // candidate. El server no interpreta `data`, solo lo reenvia al otro par.
    socket.on('call:signal', (payload) => {
      const to = targetId(payload, user.id);
      if (!to || payload?.data == null) return;
      io.to(`user:${to}`).emit('call:signal', {
        from: user.id,
        data: payload.data,
      });
    });

    // Cualquiera cuelga: el otro par cierra su conexion.
    socket.on('call:hangup', (payload) => {
      const to = targetId(payload, user.id);
      if (!to) return;
      io.to(`user:${to}`).emit('call:ended', { from: user.id });
    });

    // Unirse al canal de voz de una sala. La pertenencia a la sala se valida
    // contra las rooms del socket (chat.js lo mete a room:<id> al conectar).
    // El ack devuelve los miembros EXISTENTES: el que entra les crea la
    // oferta a cada uno (el nuevo siempre inicia).
    socket.on('voice:join', (payload, ack) => {
      const roomId = typeof payload?.roomId === 'string' ? payload.roomId : '';
      if (!roomId || !socket.rooms.has(`room:${roomId}`)) {
        return ack?.({ error: 'No eres miembro de esta sala.' });
      }
      const error = canJoinVoice({
        alreadyIn: voiceByUser.has(user.id),
        membersCount: voiceRooms.get(roomId)?.size ?? 0,
      });
      if (error) return ack?.({ error });
      const existing = voiceMembersList(roomId);
      const entry = { id: user.id, username: user.username };
      if (!voiceRooms.has(roomId)) voiceRooms.set(roomId, new Map());
      voiceRooms.get(roomId).set(user.id, entry);
      voiceByUser.set(user.id, roomId);
      socket.data.voiceRoomId = roomId;
      io.to(`room:${roomId}`).emit('voice:members', {
        roomId,
        members: voiceMembersList(roomId),
      });
      ack?.({ members: existing });
    });

    socket.on('voice:leave', () => leaveVoice(io, user.id));

    // Relay opaco de señalizacion del mesh (SDP/ICE dirigidos a un par).
    socket.on('voice:signal', (payload) => {
      const to = targetId(payload, user.id);
      const roomId = typeof payload?.roomId === 'string' ? payload.roomId : '';
      if (!to || !roomId || payload?.data == null) return;
      // Solo entre miembros del mismo canal de voz.
      const members = voiceRooms.get(roomId);
      if (!members?.has(user.id) || !members?.has(to)) return;
      io.to(`user:${to}`).emit('voice:signal', {
        roomId,
        from: user.id,
        data: payload.data,
      });
    });

    // Al desconectar el socket que estaba en voz, se lo saca del canal.
    socket.on('disconnect', () => {
      if (socket.data.voiceRoomId && voiceByUser.get(user.id) === socket.data.voiceRoomId) {
        leaveVoice(io, user.id);
      }
    });
  });
}
