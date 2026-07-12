// Self-check sin framework: node src/sockets/call.test.js
import assert from 'node:assert/strict';

const { targetId, canJoinVoice, MAX_VOICE_PEERS } = await import('./call.js');

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

// canJoinVoice: una sola sala de voz a la vez y tope de participantes.
assert.equal(canJoinVoice({ alreadyIn: false, membersCount: 0 }), null);
assert.equal(canJoinVoice({ alreadyIn: false, membersCount: MAX_VOICE_PEERS - 1 }), null);
assert.ok(canJoinVoice({ alreadyIn: true, membersCount: 0 }));
assert.ok(canJoinVoice({ alreadyIn: false, membersCount: MAX_VOICE_PEERS }));

console.log('call.test OK');
