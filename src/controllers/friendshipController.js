import { prisma } from "../lib/prisma.js";

// Estados de una amistad. Se usan como strings (Prisma acepta el valor del enum
// como string), asi el helper puro de abajo es testeable sin el cliente generado.
const STATE = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  BLOCKED: "BLOCKED",
};

// Datos publicos del otro usuario que viajan al cliente (incluye alias para
// respetar displayName = alias || username, ver convencion del proyecto).
const FRIEND_SELECT = {
  id: true,
  username: true,
  alias: true,
  avatarUrl: true,
};

// Decision pura para sendFriendship dado el vinculo existente (si lo hay).
// Separada del handler para poder testearla sin DB (ver friendshipController.test.js).
//   - sin vinculo         -> crear uno nuevo
//   - REJECTED            -> reactivar (volver a PENDING) en vez de duplicar fila
//   - PENDING/ACCEPTED    -> 400 (ya existe / ya son amigos)
//   - BLOCKED             -> 403
export function sendDecision(existing) {
  if (!existing) return { action: "create" };
  switch (existing.state) {
    case STATE.PENDING:
      return { error: "Ya tienes una solicitud pendiente con este usuario", status: 400 };
    case STATE.ACCEPTED:
      return { error: "Ya son amigos", status: 400 };
    case STATE.BLOCKED:
      return { error: "No puedes enviar solicitudes a este usuario", status: 403 };
    case STATE.REJECTED:
      return { action: "reactivate" };
    default:
      return { error: "Estado de amistad desconocido", status: 400 };
  }
}

// POST /api/friendships  { friendId }
export async function sendFriendship(req, res) {
  // Input no confiable: validar antes de tocar la DB (un friendId undefined
  // hacia crashear el findUnique con una promesa rechazada sin manejar).
  const friendId = typeof req.body?.friendId === "string" ? req.body.friendId : "";
  if (!friendId) {
    return res.status(400).json({ error: "Falta el id del usuario destinatario." });
  }
  if (friendId === req.user.id) {
    return res.status(400).json({ error: "No puedes enviarte una solicitud a ti mismo." });
  }

  try {
    const friend = await prisma.user.findUnique({ where: { id: friendId } });
    if (!friend) {
      return res.status(404).json({ error: "No existe el usuario al que intentas enviarle la solicitud." });
    }

    // Vinculo existente en cualquier direccion (A->B o B->A).
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: req.user.id, friendId },
          { userId: friendId, friendId: req.user.id },
        ],
      },
    });

    const decision = sendDecision(existing);
    if (decision.error) {
      return res.status(decision.status).json({ error: decision.error });
    }

    if (decision.action === "reactivate") {
      // Reusar la fila rechazada: se pone a PENDING con el emisor actual como
      // remitente (asi funciona tanto si re-envia el mismo como el otro).
      const friendship = await prisma.friendship.update({
        where: { id: existing.id },
        data: {
          userId: req.user.id,
          friendId,
          state: STATE.PENDING,
          requestDate: new Date(),
          approvalDate: null,
          blockingDate: null,
        },
      });
      return res.status(201).json({ message: "Solicitud enviada.", friendship });
    }

    const friendship = await prisma.friendship.create({
      data: { userId: req.user.id, friendId, state: STATE.PENDING },
    });
    return res.status(201).json({ message: "Solicitud enviada.", friendship });
  } catch (err) {
    console.error("Error al enviar la solicitud de amistad:", err.message);
    return res.status(500).json({ error: "Error al enviar la solicitud de amistad." });
  }
}

// PATCH /api/friendships/:id  { state }
// Solo el receptor (friendId) acepta/rechaza/bloquea.
export async function updateFriendship(req, res) {
  const { id } = req.params;
  const { state } = req.body ?? {};

  if (!Object.values(STATE).includes(state)) {
    return res.status(400).json({ error: "Estado invalido." });
  }

  try {
    const friendship = await prisma.friendship.findUnique({ where: { id } });
    if (!friendship) {
      return res.status(404).json({ error: "Solicitud de amistad no encontrada." });
    }
    // Limite de confianza: se valida en el server, no se confia en el cliente.
    if (friendship.friendId !== req.user.id) {
      return res.status(403).json({ error: "No autorizado." });
    }
    // No revivir una amistad ya aceptada a PENDING.
    if (friendship.state === STATE.ACCEPTED && state === STATE.PENDING) {
      return res.status(400).json({ error: "Transicion invalida." });
    }

    const data = { state };
    if (state === STATE.ACCEPTED && friendship.approvalDate === null) {
      data.approvalDate = new Date();
    }
    if (state === STATE.BLOCKED && friendship.blockingDate === null) {
      data.blockingDate = new Date();
    }

    const updated = await prisma.friendship.update({ where: { id }, data });
    return res.json(updated);
  } catch (err) {
    console.error("Error al actualizar la amistad:", err.message);
    return res.status(500).json({ error: "No se pudo actualizar la solicitud." });
  }
}

// DELETE /api/friendships/:id
// Cualquiera de los dos involucrados puede eliminar (cancelar solicitud propia
// o dejar de ser amigo).
export async function deleteFriendship(req, res) {
  const { id } = req.params;
  try {
    const friendship = await prisma.friendship.findUnique({ where: { id } });
    if (!friendship) {
      return res.status(404).json({ error: "Solicitud de amistad no encontrada." });
    }
    if (friendship.userId !== req.user.id && friendship.friendId !== req.user.id) {
      return res.status(403).json({ error: "No autorizado." });
    }
    await prisma.friendship.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Error al eliminar la amistad:", err.message);
    return res.status(500).json({ error: "No se pudo eliminar." });
  }
}

// GET /api/friendships  -> lista de amigos aceptados
export async function friendsList(req, res) {
  try {
    const friendships = await prisma.friendship.findMany({
      where: {
        state: STATE.ACCEPTED,
        OR: [{ userId: req.user.id }, { friendId: req.user.id }],
      },
      include: {
        sender: { select: FRIEND_SELECT },
        receiver: { select: FRIEND_SELECT },
      },
    });
    const friends = friendships.map((f) => ({
      id: f.id,
      since: f.approvalDate,
      friend: f.sender.id === req.user.id ? f.receiver : f.sender,
    }));
    return res.json(friends);
  } catch (err) {
    console.error("Error al listar amigos:", err.message);
    return res.status(500).json({ error: "No se pudo obtener el listado de amigos." });
  }
}

// GET /api/friendships/requests  -> solicitudes PENDIENTES recibidas
// Incluye al remitente para que el cliente muestre quien la envio.
export async function friendshipRequests(req, res) {
  try {
    const requests = await prisma.friendship.findMany({
      where: { state: STATE.PENDING, friendId: req.user.id },
      include: { sender: { select: FRIEND_SELECT } },
      orderBy: { requestDate: "desc" },
    });
    const shaped = requests.map((r) => ({
      id: r.id,
      since: r.requestDate,
      from: r.sender,
    }));
    return res.json(shaped);
  } catch (err) {
    console.error("Error al listar solicitudes:", err.message);
    return res.status(500).json({ error: "No se pudieron obtener las solicitudes." });
  }
}
