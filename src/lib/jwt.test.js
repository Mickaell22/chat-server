// Self-check sin framework: node src/lib/jwt.test.js
// Verifica el round-trip de firma/verificacion de JWT y que un token invalido falle.
import assert from 'node:assert/strict';

// env.js exige estas variables al importarse; las seteamos antes del import dinamico.
process.env.DATABASE_URL = 'postgresql://test';
process.env.JWT_SECRET = 'secreto-de-prueba';

const {
  signToken,
  verifyToken,
  signEmailVerifyToken,
  signPasswordResetToken,
  verifyPurposeToken,
} = await import('./jwt.js');

const token = signToken({ id: 'u1', username: 'mickaell' });
const payload = verifyToken(token);
assert.equal(payload.sub, 'u1');
assert.equal(payload.username, 'mickaell');

assert.throws(() => verifyToken('token.basura.invalido'));

// Tokens de proposito: cada uno solo valida con su propio purpose.
const verifyTok = signEmailVerifyToken({ id: 'u2' });
assert.equal(verifyPurposeToken(verifyTok, 'verify-email').sub, 'u2');
assert.throws(() => verifyPurposeToken(verifyTok, 'reset-password'));

const resetTok = signPasswordResetToken({ id: 'u3' });
assert.equal(verifyPurposeToken(resetTok, 'reset-password').sub, 'u3');
assert.throws(() => verifyPurposeToken(resetTok, 'verify-email'));

// Un token de sesion normal no pasa como token de proposito.
assert.throws(() => verifyPurposeToken(token, 'verify-email'));

console.log('jwt.test OK');
