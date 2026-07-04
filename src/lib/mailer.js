import { env } from '../config/env.js';

const RESEND_API_URL = 'https://api.resend.com/emails';

// Envia un correo via la API HTTP de Resend. Si no esta configurado
// (env.mailEnabled=false), cae a modo consola: loguea el contenido en vez de
// enviarlo. Asi el flujo funciona en desarrollo sin credenciales y no se
// rompe nada.
export async function sendMail({ to, subject, html, text }) {
  if (!env.mailEnabled) {
    console.log(
      `[mailer:consola] Para: ${to} | Asunto: ${subject}\n${text || html}`,
    );
    return;
  }
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resend.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.resend.from, to, subject, html, text }),
  });
  if (!res.ok) {
    throw new Error(`Resend respondio ${res.status}: ${await res.text()}`);
  }
}

// username esta validado server-side (solo [a-zA-Z0-9_]), asi que es seguro
// interpolarlo en el HTML sin escapar.
export function sendVerificationEmail(user, link) {
  return sendMail({
    to: user.email,
    subject: 'Verifica tu correo',
    text: `Hola ${user.username}, verifica tu correo: ${link}`,
    html: `<p>Hola <b>${user.username}</b>,</p>
<p>Confirma tu correo para activar tu cuenta de pub:</p>
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
