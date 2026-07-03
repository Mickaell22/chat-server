import { Router } from "express";
import {
  friendsList,
  friendshipRequests,
  sendFriendship,
  updateFriendship,
} from "../controllers/friendshipController.js";

const router = Router();

router.post("/", sendFriendship);
router.patch("/:id", updateFriendship);
router.get("/", friendsList);
router.get("/requests", friendshipRequests);

export default router;