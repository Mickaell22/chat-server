import 'dotenv/config';

// Carga y valida las variables de entorno una sola vez. Falla rapido al
// arrancar si falta algo critico, en vez de explotar a mitad de un request.
function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

// SMTP es opcional: si falta, el server arranca igual y el mailer cae a modo
// consola (loguea el link en vez de enviarlo). La verificacion no bloquea login.
const smtp = {
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.MAIL_FROM || 'Chat en tiempo real <no-reply@ejemplo.com>',
};

export const env = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  smtp,
  // Hay envio real solo si estan host, user y pass.
  mailEnabled: Boolean(smtp.host && smtp.user && smtp.pass),
};
