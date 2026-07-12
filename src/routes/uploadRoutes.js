import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { uploadChatImage } from '../lib/cloudinary.js';

// Mismo esquema que la subida de avatar: el archivo viaja en memoria y se
// reenvia a Cloudinary. Limite de confianza server-side: solo imagenes y
// maximo 5 MB (el cliente ya comprime con canvas, pero no se confia en el).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imagenes.'));
  },
});

const router = Router();

// POST /api/uploads/image  (multipart, campo "image")
// Sube la imagen y devuelve su URL; el cliente luego la manda como imageUrl
// en room:message / dm:message. ponytail: handler inline, es un solo endpoint.
router.post('/image', requireAuth, upload.single('image'), async (req, res) => {
  if (!env.uploadsEnabled) {
    return res.status(503).json({ error: 'Subida de imagenes no configurada.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibio ninguna imagen.' });
  }
  try {
    const url = await uploadChatImage(req.file.buffer);
    return res.json({ url });
  } catch (err) {
    console.error('Error subiendo imagen de chat:', err.message);
    return res.status(502).json({ error: 'No se pudo subir la imagen.' });
  }
});

// Traduce los errores de multer (tipo/tamaño) a respuestas JSON limpias.
router.use((err, _req, res, _next) => {
  if (err) return res.status(400).json({ error: err.message });
});

export default router;
