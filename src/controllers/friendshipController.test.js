// Self-check sin framework: node src/controllers/friendshipController.test.js
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgresql://test';

const { sendDecision } = await import('./friendshipController.js');

// Sin vinculo previo: se crea uno nuevo.
assert.deepEqual(sendDecision(null), { action: 'create' });

// Rechazado antes: se reactiva (no se duplica la fila).
assert.deepEqual(sendDecision({ state: 'REJECTED' }), { action: 'reactivate' });

// Pendiente / ya amigos: 400.
assert.equal(sendDecision({ state: 'PENDING' }).status, 400);
assert.equal(sendDecision({ state: 'ACCEPTED' }).status, 400);

// Bloqueado: 403.
assert.equal(sendDecision({ state: 'BLOCKED' }).status, 403);

// Estado desconocido: 400, nunca crea/reactiva a ciegas.
const unknown = sendDecision({ state: 'WAT' });
assert.equal(unknown.status, 400);
assert.equal(unknown.action, undefined);

console.log('friendshipController.test OK');
