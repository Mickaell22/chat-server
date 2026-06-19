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

// --- Tokens de un solo proposito (verificacion de email y reset de password) ---
// Llevan un claim `purpose` para que un token de verificacion no sirva como
// token de reset ni como sesion. Expiran rapido.
// ponytail: no son single-use (un token de reset vale hasta que expira aunque ya
// se haya usado). Techo aceptable con exp de 1h. Upgrade: firmar con
// `jwtSecret + passwordHash` para invalidarlo al cambiar la contraseña.

export function signEmailVerifyToken(user) {
  return jwt.sign({ sub: user.id, purpose: 'verify-email' }, env.jwtSecret, {
    expiresIn: '1d',
  });
}

export function signPasswordResetToken(user) {
  return jwt.sign({ sub: user.id, purpose: 'reset-password' }, env.jwtSecret, {
    expiresIn: '1h',
  });
}

// Verifica y exige el purpose esperado; lanza si no coincide o el token es invalido.
export function verifyPurposeToken(token, purpose) {
  const payload = jwt.verify(token, env.jwtSecret);
  if (payload.purpose !== purpose) {
    throw new Error('Token con proposito invalido.');
  }
  return payload;
}
