import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { env } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import friendshipRoutes from "./routes/friendshipRoutes.js";
import uploadRoutes from './routes/uploadRoutes.js';
import { socketAuth } from './middleware/auth.js';
import { registerChatHandlers } from './sockets/chat.js';

const app = express();
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json());

// Healthcheck (util para Railway y para verificar que el server vive)
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friendships', friendshipRoutes);
app.use('/api/uploads', uploadRoutes);

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: env.clientOrigin, credentials: true },
});

// Valida el JWT en el handshake: nadie entra al chat sin autenticarse.
io.use(socketAuth);

// Handlers de chat: usuarios online, sala global, salas multiples (publicas
// y privadas con invitacion), DM y typing.
registerChatHandlers(io);

server.listen(env.port, () => {
  console.log(`Servidor escuchando en http://localhost:${env.port}`);
});
