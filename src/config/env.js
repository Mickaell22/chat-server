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

// Resend es opcional: si falta la API key, el server arranca igual y el
// mailer cae a modo consola (loguea el link en vez de enviarlo). La
// verificacion no bloquea login.
// ponytail: se usa la API HTTP de Resend con fetch nativo (Node >= 18), sin
// SDK. SMTP se descarto porque Railway bloquea/filtra los puertos salientes
// que usa (25/465/587); una API sobre HTTPS no tiene ese problema.
const resend = {
  apiKey: process.env.RESEND_API_KEY || '',
  from: process.env.MAIL_FROM || 'pub <no-reply@ejemplo.com>',
};

// Cloudinary es opcional: si faltan credenciales, el endpoint de subida de
// avatar responde 503 en vez de romper el arranque. El secret vive SOLO aqui
// (server), nunca llega al cliente.
const cloudinary = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  apiKey: process.env.CLOUDINARY_API_KEY || '',
  apiSecret: process.env.CLOUDINARY_API_SECRET || '',
};

export const env = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  resend,
  mailEnabled: Boolean(resend.apiKey),
  cloudinary,
  uploadsEnabled: Boolean(
    cloudinary.cloudName && cloudinary.apiKey && cloudinary.apiSecret,
  ),
};
