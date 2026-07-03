import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { uploadAvatar } from '../lib/cloudinary.js';
import { publicUser, publicProfile } from './authController.js';
import { validateProfileFields } from '../lib/profileValidation.js';
import { getPresenceStatus } from '../sockets/chat.js';

// POST /api/users/me/avatar  (multipart, campo "avatar")
// Sube la imagen a Cloudinary y guarda la URL en el usuario autenticado.
export async function updateAvatar(req, res) {
  if (!env.uploadsEnabled) {
    return res.status(503).json({ error: 'Subida de imagenes no configurada.' });
  }
  // multer deja el archivo en req.file; el fileFilter ya rechazo no-imagenes.
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibio ninguna imagen.' });
  }
  try {
    const url = await uploadAvatar(req.file.buffer, req.user.id);
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl: url },
    });
    return res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('Error subiendo avatar:', err.message);
    return res.status(502).json({ error: 'No se pudo subir la imagen.' });
  }
}

// GET /api/users/:id  (requireAuth)
// Perfil publico de otro usuario (o el propio), con su presencia tal como la
// veria quien pregunta (invisible aparece 'offline' salvo para si mismo).
export async function getUserProfile(req, res) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    return res.json({
      user: { ...publicProfile(user), status: getPresenceStatus(user.id, req.user.id) },
    });
  } catch (err) {
    console.error('Error obteniendo perfil:', err.message);
    return res.status(500).json({ error: 'No se pudo obtener el perfil.' });
  }
}

// PATCH /api/users/me  { alias?, bio?, profileColor? }  (requireAuth)
export async function updateProfile(req, res) {
  const { error, data } = validateProfileFields(req.body ?? {});
  if (error) return res.status(400).json({ error });
  try {
    const user = await prisma.user.update({ where: { id: req.user.id }, data });
    return res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('Error actualizando perfil:', err.message);
    return res.status(500).json({ error: 'No se pudo actualizar el perfil.' });
  }
}
