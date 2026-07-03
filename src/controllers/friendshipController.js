import { prisma } from "../lib/prisma.js";
import { FriendshipState } from "@prisma/client";

export async function sendFriendship(req, res) {
  const token = String(req.body?.token ?? "");
  if (!token) return res.status(400).json({ error: "Falta el token." });
  if (req.user.id === req.body.friendId) {
    return res.status(400).json({
      error: "No puedes enviarte una solicitud de amistad a ti mismo",
    });
  }
  const friend = await prisma.user.findUnique({
    where: { id: req.body.friendId },
  });
  if (friend == null) {
    return res.status(400).json({
      error: "No existe el usuario al que intentas enviarle la solicitud",
    });
  }
  const existingFriendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userId: req.user.id, friendId: req.body.friendId },
        { userId: req.body.friendId, friendId: req.user.id },
      ],
    },
  });

  if (existingFriendship) {
    switch (existingFriendship.state) {
      case FriendshipState.PENDING:
        return res.status(400).json({
          error: "Ya tienes una solicitud pendiente con este usuario",
        });

      case FriendshipState.ACCEPTED:
        return res.status(400).json({
          error: "Ya son amigos",
        });

      case FriendshipState.BLOCKED:
        return res.status(403).json({
          error:
            "No puedes enviar solicitudes a este usuario porque te ha bloqueado",
        });
    }
  }

  try {
    const friendship = await prisma.friendship.create({
      data: {
        userId: req.user.id,
        friendId: req.body.friendId,
        state: FriendshipState.PENDING,
      },
    });
    return res
      .status(201)
      .json({ message: "Friend request sent successfully", friendship });
  } catch (err) {
    console.error("Error al enviar la solicitud de amistad:", err.message);
    return res
      .status(500)
      .json({ error: "Error al enviar la solicitud de amistad." });
  }
}

export async function updateFriendship(req, res) {
  const token = String(req.body?.token ?? "");
  if (!token) return res.status(400).json({ error: "Falta el token." });
  const { id } = req.params;
  const { state } = req.body;
  const friendship = await prisma.friendship.findUnique({
    where: { id },
  });
  if (!friendship) {
    return res
      .status(404)
      .json({ error: "Solicitud de amistad no encontrada" });
  }
  // seguridad: solo el receptor debería poder aceptar/rechazar
  if (friendship.friendId !== req.user.id) {
    return res.status(403).json({ error: "No autorizado" });
  }
  if (!Object.values(FriendshipState).includes(state)) {
    return res.status(400).json({ error: "Estado inválido" });
  }
  if (
    friendship.state === FriendshipState.ACCEPTED &&
    state === FriendshipState.PENDING
  ) {
    return res.status(400).json({ error: "Transición inválida" });
  }
  const data = { state };
  if (state === FriendshipState.ACCEPTED && friendship.approvalDate === null) {
    data.approvalDate = new Date();
  }

  if (state === FriendshipState.BLOCKED && friendship.blockingDate === null) {
    data.blockingDate = new Date();
  }

  const updated = await prisma.friendship.update({
    where: { id },
    data,
  });

  return res.json(updated);
}

export async function friendsList(req, res) {
  const token = String(req.body?.token ?? "");
  if (!token) return res.status(400).json({ error: "Falta el token." });
  const friends = await prisma.friendship.findMany({
    where: {
      state: FriendshipState.ACCEPTED,
      OR: [{ userId: req.user.id }, { friendId: req.user.id }],
    },
  });
  return res.json(friends);
}

export async function friendshipRequests(req, res) {
  const token = String(req.body?.token ?? "");
  if (!token) return res.status(400).json({ error: "Falta el token." });
  const requests = await prisma.friendship.findMany({
    where: {
      state: FriendshipState.PENDING,
      friendId: req.user.id,
    },
  });
  return res.json(requests);
}
