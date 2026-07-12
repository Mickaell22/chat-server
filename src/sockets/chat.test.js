// Self-check sin framework: node src/sockets/chat.test.js
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgresql://test';
// chat.js ahora importa env.js (para validar imageUrl), que exige JWT_SECRET.
process.env.JWT_SECRET = 'test';

const { isVisibleTo, mergeDmPartners, normalizeRoomName, summarizeReactions } = await import('./chat.js');

// Online/dnd: visibles para cualquiera.
assert.equal(isVisibleTo({ status: 'online', userId: 'u1' }, 'u2'), true);
assert.equal(isVisibleTo({ status: 'dnd', userId: 'u1' }, 'u2'), true);

// Invisible: no visible para otro viewer.
assert.equal(isVisibleTo({ status: 'invisible', userId: 'u1' }, 'u2'), false);

// Invisible: SI visible para si mismo.
assert.equal(isVisibleTo({ status: 'invisible', userId: 'u1' }, 'u1'), true);

// mergeDmPartners: une enviados y recibidos quedandose con la fecha mas
// reciente por partner, sin importar la direccion.
const d1 = new Date('2026-07-01T10:00:00Z');
const d2 = new Date('2026-07-02T10:00:00Z');
const d3 = new Date('2026-07-03T10:00:00Z');

const merged = mergeDmPartners(
  [
    { recipientId: 'ana', _max: { createdAt: d1 } },
    { recipientId: 'beto', _max: { createdAt: d3 } },
  ],
  [
    { senderId: 'ana', _max: { createdAt: d2 } }, // mas reciente que lo enviado
    { senderId: 'caro', _max: { createdAt: d1 } }, // solo recibido
  ],
);
assert.equal(merged.size, 3);
assert.equal(merged.get('ana'), d2); // gana la direccion mas reciente
assert.equal(merged.get('beto'), d3); // solo enviado
assert.equal(merged.get('caro'), d1); // solo recibido

// Sin DMs: mapa vacio.
assert.equal(mergeDmPartners([], []).size, 0);

// normalizeRoomName: minusculas, espacios a guiones, valida charset/largo.
assert.deepEqual(normalizeRoomName('  Mi Sala  '), { name: 'mi-sala' });
assert.deepEqual(normalizeRoomName('juegos-2026'), { name: 'juegos-2026' });
assert.deepEqual(normalizeRoomName('a  b   c'), { name: 'a-b-c' });
assert.ok(normalizeRoomName('x').error); // muy corto
assert.ok(normalizeRoomName('a'.repeat(30)).error); // muy largo
assert.ok(normalizeRoomName('con ñ').error); // charset invalido
assert.ok(normalizeRoomName('global').error); // reservado
assert.ok(normalizeRoomName(undefined).error); // input basura
assert.ok(normalizeRoomName('sala!').error); // simbolos

// summarizeReactions: agrupa por emoji en el orden de la paleta.
const rows = [
  { userId: 'u2', emoji: '\u{1F525}' },
  { userId: 'u1', emoji: '\u{1F44D}' },
  { userId: 'u3', emoji: '\u{1F44D}' },
];
const summary = summarizeReactions(rows);
assert.equal(summary.length, 2);
assert.equal(summary[0].emoji, '\u{1F44D}'); // orden de paleta, no de llegada
assert.deepEqual(summary[0].userIds, ['u1', 'u3']);
assert.deepEqual(summary[1].userIds, ['u2']);
assert.deepEqual(summarizeReactions([]), []);

console.log('chat.test OK');
