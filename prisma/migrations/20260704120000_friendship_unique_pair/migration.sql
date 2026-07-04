-- Reponer la unicidad del par (userId, friendId): la migracion de "correccion"
-- la habia degradado a indice normal, permitiendo solicitudes duplicadas.
-- NOTA: si ya existen filas duplicadas en la DB, hay que deduplicarlas antes
-- de aplicar esta migracion (o CREATE UNIQUE INDEX fallara).

-- DropIndex
DROP INDEX "Friendship_userId_friendId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_userId_friendId_key" ON "Friendship"("userId", "friendId");
