import { PrismaClient } from '@prisma/client';

// Cliente unico de Prisma reutilizado en toda la app.
export const prisma = new PrismaClient();
