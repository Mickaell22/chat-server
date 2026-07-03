-- DropIndex
DROP INDEX "Friendship_userId_friendId_key";

-- CreateIndex
CREATE INDEX "Friendship_userId_idx" ON "Friendship"("userId");

-- CreateIndex
CREATE INDEX "Friendship_userId_friendId_idx" ON "Friendship"("userId", "friendId");
