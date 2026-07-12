// Self-check sin framework: node src/sockets/call.test.js
import assert from 'node:assert/strict';

const { targetId } = await import('./call.js');

// Destino valido.
assert.equal(targetId({ to: 'u2' }, 'u1'), 'u2');

// Auto-llamada: rechazada.
assert.equal(targetId({ to: 'u1' }, 'u1'), null);

// Payload basura (no confiable): rechazado.
assert.equal(targetId({ to: 123 }, 'u1'), null);
assert.equal(targetId({ to: '' }, 'u1'), null);
assert.equal(targetId({}, 'u1'), null);
assert.equal(targetId(null, 'u1'), null);
assert.equal(targetId(undefined, 'u1'), null);

console.log('call.test OK');
