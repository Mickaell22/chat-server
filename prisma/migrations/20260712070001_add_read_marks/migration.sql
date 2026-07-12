-- CreateTable
CREATE TABLE "ReadMark" (
    "userId" TEXT NOT NULL,
    "chatKey" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadMark_pkey" PRIMARY KEY ("userId","chatKey")
);

-- AddForeignKey
ALTER TABLE "ReadMark" ADD CONSTRAINT "ReadMark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

