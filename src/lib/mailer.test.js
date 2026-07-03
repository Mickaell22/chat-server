// Self-check sin framework: node src/lib/mailer.test.js
// Verifica que sendMail llame a la API HTTP de Resend con el payload correcto
// y que un error de la API se propague en vez de tragarse en silencio.
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgresql://test';
process.env.JWT_SECRET = 'secreto-de-prueba';
process.env.RESEND_API_KEY = 'clave-de-prueba';
process.env.MAIL_FROM = 'Chat <no-reply@ejemplo.com>';

const { sendMail } = await import('./mailer.js');

let lastCall = null;
globalThis.fetch = async (url, options) => {
  lastCall = { url, options };
  return { ok: true, status: 200, text: async () => '' };
};

await sendMail({ to: 'user@ejemplo.com', subject: 'Hola', text: 'contenido' });

assert.equal(lastCall.url, 'https://api.resend.com/emails');
assert.equal(lastCall.options.headers.Authorization, 'Bearer clave-de-prueba');
const body = JSON.parse(lastCall.options.body);
assert.equal(body.from, 'Chat <no-reply@ejemplo.com>');
assert.equal(body.to, 'user@ejemplo.com');
assert.equal(body.subject, 'Hola');

globalThis.fetch = async () => ({ ok: false, status: 422, text: async () => 'email invalido' });
await assert.rejects(() => sendMail({ to: 'x', subject: 'x', text: 'x' }), /Resend respondio 422/);

console.log('mailer.test OK');
