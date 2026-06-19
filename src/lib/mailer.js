import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

// Transporter perezoso: se crea en el primer envio real, no al importar.
let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }
  return transporter;
}

// Envia un correo. Si SMTP no esta configurado (env.mailEnabled=false), cae a
// modo consola: loguea el contenido en vez de enviarlo. Asi el flujo funciona
// en desarrollo sin credenciales y no se rompe nada.
export async function sendMail({ to, subject, html, text }) {
  if (!env.mailEnabled) {
    console.log(
      `[mailer:consola] Para: ${to} | Asunto: ${subject}\n${text || html}`,
    );
    return;
  }
  await getTransporter().sendMail({ from: env.smtp.from, to, subject, html, text });
}

// username esta validado server-side (solo [a-zA-Z0-9_]), asi que es seguro
// interpolarlo en el HTML sin escapar.
export function sendVerificationEmail(user, link) {
  return sendMail({
    to: user.email,
    subject: 'Verifica tu correo',
    text: `Hola ${user.username}, verifica tu correo: ${link}`,
    html: `<p>Hola <b>${user.username}</b>,</p>
<p>Confirma tu correo para activar tu cuenta de Chat en tiempo real:</p>
<p><a href="${link}">Verificar mi correo</a></p>
<p>Si no creaste esta cuenta, ignora este mensaje.</p>`,
  });
}

export function sendPasswordResetEmail(user, link) {
  return sendMail({
    to: user.email,
    subject: 'Recupera tu contraseña',
    text: `Hola ${user.username}, para restablecer tu contraseña entra a: ${link} (expira en 1 hora)`,
    html: `<p>Hola <b>${user.username}</b>,</p>
<p>Pediste restablecer tu contraseña. El enlace expira en 1 hora:</p>
<p><a href="${link}">Restablecer contraseña</a></p>
<p>Si no lo pediste, ignora este mensaje.</p>`,
  });
}
