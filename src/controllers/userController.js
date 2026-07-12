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

// Ids del "otro extremo" de una lista de amistades de `selfId` (cada fila
// puede tenerlo como emisor o receptor). Pura para poder testearla.
export function otherEnds(rows, selfId) {
  return rows.map((r) => (r.userId === selfId ? r.friendId : r.userId));
}

// Estado de amistad entre viewer y target, visto desde el viewer. Pura para
// poder testearla. REJECTED cuenta como 'none': se puede volver a enviar (el
// friendshipController reactiva la fila en vez de duplicarla).
export function friendshipStateFor(friendship, viewerId) {
  if (!friendship || friendship.state === 'REJECTED') return 'none';
  if (friendship.state === 'ACCEPTED') return 'friends';
  if (friendship.state === 'BLOCKED') return 'blocked';
  // PENDING: la direccion dice quien la envio.
  return friendship.userId === viewerId ? 'pending_sent' : 'pending_received';
}

// GET /api/users/:id  (requireAuth)
// Perfil publico de otro usuario (o el propio), con su presencia tal como la
// veria quien pregunta (invisible aparece 'offline' salvo para si mismo) y el
// estado de amistad entre ambos (para el boton contextual del modal).
export async function getUserProfile(req, res) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    let friendship = { state: 'self', id: null };
    if (user.id !== req.user.id) {
      // El vinculo puede existir en cualquier direccion (unique por par).
      const row = await prisma.friendship.findFirst({
        where: {
          OR: [
            { userId: req.user.id, friendId: user.id },
            { userId: user.id, friendId: req.user.id },
          ],
        },
      });
      friendship = { state: friendshipStateFor(row, req.user.id), id: row?.id ?? null };
    }

    // Lo que comparten viewer y target: salas (sin la global, que es de
    // todos) y amigos aceptados en comun.
    let common = { rooms: [], friends: { count: 0, names: [] } };
    if (user.id !== req.user.id) {
      const [mine, theirs] = await Promise.all([
        prisma.roomMember.findMany({ where: { userId: req.user.id }, select: { roomId: true } }),
        prisma.roomMember.findMany({ where: { userId: user.id }, select: { roomId: true } }),
      ]);
      const myIds = new Set(mine.map((m) => m.roomId));
      const sharedRoomIds = theirs.map((m) => m.roomId).filter((id) => myIds.has(id));
      if (sharedRoomIds.length > 0) {
        const rooms = await prisma.room.findMany({
          where: { id: { in: sharedRoomIds } },
          select: { name: true },
          orderBy: { name: 'asc' },
        });
        common.rooms = rooms.map((r) => r.name);
      }

      const acceptedOf = (id) =>
        prisma.friendship.findMany({
          where: { state: 'ACCEPTED', OR: [{ userId: id }, { friendId: id }] },
          select: { userId: true, friendId: true },
        });
      const [myFriendRows, theirFriendRows] = await Promise.all([
        acceptedOf(req.user.id),
        acceptedOf(user.id),
      ]);
      const myFriends = new Set(otherEnds(myFriendRows, req.user.id));
      const shared = otherEnds(theirFriendRows, user.id).filter((id) => myFriends.has(id));
      if (shared.length > 0) {
        const friends = await prisma.user.findMany({
          where: { id: { in: shared.slice(0, 3) } },
          select: { username: true, alias: true },
        });
        common.friends = {
          count: shared.length,
          names: friends.map((f) => f.alias || f.username),
        };
      }
    }

    return res.json({
      user: {
        ...publicProfile(user),
        status: getPresenceStatus(user.id, req.user.id),
        friendship,
        common,
      },
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

// GET /api/users/search?q=texto  (requireAuth)
// Busca usuarios por username o alias (para agregar amigos). Excluye al propio
// usuario y limita a 10 resultados. Query corta -> lista vacia (no escanea todo).
const USER_SEARCH_SELECT = { id: true, username: true, alias: true, avatarUrl: true };

export async function searchUsers(req, res) {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) return res.json([]);
  try {
    const users = await prisma.user.findMany({
      where: {
        id: { not: req.user.id },
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { alias: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: USER_SEARCH_SELECT,
      take: 10,
    });
    return res.json(users);
  } catch (err) {
    console.error('Error buscando usuarios:', err.message);
    return res.status(500).json({ error: 'No se pudo buscar usuarios.' });
  }
}
