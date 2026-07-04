import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  friendsList,
  friendshipRequests,
  sendFriendship,
  updateFriendship,
} from "../controllers/friendshipController.js";

const router = Router();

router.post("/", requireAuth, sendFriendship);
router.patch("/:id", requireAuth, updateFriendship);
router.get("/", requireAuth, friendsList);
router.get("/requests", requireAuth, friendshipRequests);

export default router;