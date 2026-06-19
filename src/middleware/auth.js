import { verifyToken } from '../lib/jwt.js';

// Middleware HTTP: exige un JWT valido en el header Authorization: Bearer <token>.
// Deja el usuario en req.user.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token no provisto.' });
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalido o expirado.' });
  }
}

// Middleware de Socket.IO (io.use): valida el JWT del handshake ANTES de
// aceptar la conexion. El cliente lo manda en socket.handshake.auth.token.
// Deja el usuario en socket.data.user.
export function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Token no provisto.'));
  }

  try {
    const payload = verifyToken(token);
    socket.data.user = { id: payload.sub, username: payload.username };
    next();
  } catch {
    next(new Error('Token invalido o expirado.'));
  }
}
