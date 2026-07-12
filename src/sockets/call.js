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
  });
}
