// Self-check sin framework: node src/controllers/authController.test.js
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgresql://test';
process.env.JWT_SECRET = 'secreto-de-prueba';

const { msUntilCooldownEnds } = await import('./authController.js');
const COOLDOWN_MS = 60_000;

// Nunca se envio: sin cooldown.
assert.equal(msUntilCooldownEnds(undefined), 0);

// Recien enviado: cooldown casi completo.
const now = 1_000_000;
const remaining = msUntilCooldownEnds(now, now);
assert.equal(remaining, COOLDOWN_MS);

// A mitad de camino.
assert.equal(msUntilCooldownEnds(now, now + COOLDOWN_MS / 2), COOLDOWN_MS / 2);

// Ya paso el cooldown.
assert.equal(msUntilCooldownEnds(now, now + COOLDOWN_MS + 1), 0);

console.log('authController.test OK');
