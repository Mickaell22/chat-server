import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { uploadAvatar } from '../lib/cloudinary.js';
import { publicUser } from './authController.js';

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
