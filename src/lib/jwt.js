import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// El payload del token lleva el id y el username del usuario. Una sola fuente
// de verdad de identidad, usada tanto en HTTP como en el handshake del socket.
export function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

// Devuelve el payload si el token es valido, o lanza si no lo es.
export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}
