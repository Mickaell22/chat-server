// Self-check sin framework: node src/controllers/userController.test.js
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgresql://test';
process.env.JWT_SECRET = 'test';

const { friendshipStateFor } = await import('./userController.js');

// Sin vinculo o rechazado: se puede (re)enviar solicitud.
assert.equal(friendshipStateFor(null, 'yo'), 'none');
assert.equal(friendshipStateFor({ state: 'REJECTED', userId: 'yo' }, 'yo'), 'none');

// Pendiente: la direccion decide quien ve "enviada" y quien "recibida".
assert.equal(friendshipStateFor({ state: 'PENDING', userId: 'yo', friendId: 'otro' }, 'yo'), 'pending_sent');
assert.equal(friendshipStateFor({ state: 'PENDING', userId: 'otro', friendId: 'yo' }, 'yo'), 'pending_received');

// Aceptada y bloqueada.
assert.equal(friendshipStateFor({ state: 'ACCEPTED', userId: 'otro' }, 'yo'), 'friends');
assert.equal(friendshipStateFor({ state: 'BLOCKED', userId: 'otro' }, 'yo'), 'blocked');

console.log('userController.test OK');
