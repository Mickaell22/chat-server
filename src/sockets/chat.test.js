// Self-check sin framework: node src/sockets/chat.test.js
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgresql://test';

const { isVisibleTo } = await import('./chat.js');

// Online/dnd: visibles para cualquiera.
assert.equal(isVisibleTo({ status: 'online', userId: 'u1' }, 'u2'), true);
assert.equal(isVisibleTo({ status: 'dnd', userId: 'u1' }, 'u2'), true);

// Invisible: no visible para otro viewer.
assert.equal(isVisibleTo({ status: 'invisible', userId: 'u1' }, 'u2'), false);

// Invisible: SI visible para si mismo.
assert.equal(isVisibleTo({ status: 'invisible', userId: 'u1' }, 'u1'), true);

console.log('chat.test OK');
