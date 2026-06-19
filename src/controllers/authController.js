import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import {
  signToken,
  signEmailVerifyToken,
  signPasswordResetToken,
  verifyPurposeToken,
} from '../lib/jwt.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from '../lib/mailer.js';

const BCRYPT_ROUNDS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

// Nunca exponer passwordHash en las respuestas.
function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: user.emailVerified,
  };
}

// POST /api/auth/register
export async function register(req, res) {
  const username = String(req.body?.username ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: 'El username debe tener 3-30 caracteres (letras, numeros o guion bajo).',
    });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Email invalido.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: { username, email, passwordHash },
    });

    // Envia el correo de verificacion sin bloquear el registro: si el mail
    // falla, el usuario igual queda creado (verificar no es obligatorio).
    try {
      const verifyToken = signEmailVerifyToken(user);
      const link = `${env.clientOrigin}/verify-email?token=${verifyToken}`;
      await sendVerificationEmail(user, link);
    } catch (mailErr) {
      console.error('No se pudo enviar el correo de verificacion:', mailErr.message);
    }

    const token = signToken(user);
    return res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    // P2002 = violacion de restriccion unica (username o email ya existen).
    if (err.code === 'P2002') {
      const field = err.meta?.target?.includes('email') ? 'email' : 'username';
      return res.status(409).json({ error: `Ese ${field} ya esta registrado.` });
    }
    console.error('Error en register:', err);
    return res.status(500).json({ error: 'Error interno al registrar.' });
  }
}

// POST /api/auth/login
export async function login(req, res) {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    // Mismo mensaje para usuario inexistente y password incorrecta: no revelar
    // si el email existe.
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) {
      return res.status(401).json({ error: 'Credenciales invalidas.' });
    }
    const token = signToken(user);
    return res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('Error en login:', err);
    return res.status(500).json({ error: 'Error interno al iniciar sesion.' });
  }
}

// POST /api/auth/verify-email  { token }
export async function verifyEmail(req, res) {
  const token = String(req.body?.token ?? '');
  if (!token) return res.status(400).json({ error: 'Falta el token.' });
  try {
    const payload = verifyPurposeToken(token, 'verify-email');
    await prisma.user.update({
      where: { id: payload.sub },
      data: { emailVerified: true },
    });
    return res.json({ message: 'Correo verificado correctamente.' });
  } catch {
    return res.status(400).json({ error: 'Token invalido o expirado.' });
  }
}

// POST /api/auth/request-password-reset  { email }
export async function requestPasswordReset(req, res) {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  // Respuesta generica siempre: no revelar si el email existe.
  const generic = {
    message: 'Si el correo existe, te enviamos un enlace para restablecer la contraseña.',
  };
  if (!email) return res.json(generic);

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const resetToken = signPasswordResetToken(user);
      const link = `${env.clientOrigin}/reset-password?token=${resetToken}`;
      await sendPasswordResetEmail(user, link);
    }
  } catch (err) {
    console.error('Error en requestPasswordReset:', err.message);
  }
  return res.json(generic);
}

// POST /api/auth/reset-password  { token, password }
export async function resetPassword(req, res) {
  const token = String(req.body?.token ?? '');
  const password = String(req.body?.password ?? '');

  if (!token) return res.status(400).json({ error: 'Falta el token.' });
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const payload = verifyPurposeToken(token, 'reset-password');
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { id: payload.sub },
      data: { passwordHash },
    });
    return res.json({ message: 'Contraseña actualizada. Ya podes iniciar sesion.' });
  } catch {
    return res.status(400).json({ error: 'Token invalido o expirado.' });
  }
}
