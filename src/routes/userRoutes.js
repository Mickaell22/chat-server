import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { updateAvatar } from '../controllers/userController.js';

// El archivo viaja en memoria (no a disco): es chico y se reenvia a Cloudinary.
// Validacion en el limite de confianza: solo imagenes, maximo 5 MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imagenes.'));
  },
});

const router = Router();

router.post('/me/avatar', requireAuth, upload.single('avatar'), updateAvatar);

// Traduce los errores de multer (tipo/tamaño) a respuestas JSON limpias.
router.use((err, _req, res, _next) => {
  if (err) return res.status(400).json({ error: err.message });
});

export default router;
