import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';

// Configura el SDK con las credenciales del server (el secret nunca sale de aca).
// Si no hay credenciales, uploadsEnabled es false y el controller responde 503.
if (env.uploadsEnabled) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
  });
}

// Sube un buffer de imagen a Cloudinary y resuelve con la URL segura (https).
// Usa upload_stream porque el archivo llega en memoria (multer memoryStorage).
export function uploadAvatar(buffer, userId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'chat/avatars',
        public_id: userId, // una imagen por usuario: la nueva pisa la anterior
        overwrite: true,
        resource_type: 'image',
        transformation: [
          { width: 256, height: 256, crop: 'fill', gravity: 'face' },
        ],
      },
      (err, result) => (err ? reject(err) : resolve(result.secure_url)),
    );
    stream.end(buffer);
  });
}
