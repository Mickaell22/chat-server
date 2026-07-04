import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  friendsList,
  friendshipRequests,
  sendFriendship,
  updateFriendship,
  deleteFriendship,
} from "../controllers/friendshipController.js";

const router = Router();

router.post("/", requireAuth, sendFriendship);
router.get("/", requireAuth, friendsList);
router.get("/requests", requireAuth, friendshipRequests);
router.patch("/:id", requireAuth, updateFriendship);
router.delete("/:id", requireAuth, deleteFriendship);

export default router;
