import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { env } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import { socketAuth } from './middleware/auth.js';
import { registerChatHandlers } from './sockets/chat.js';

const app = express();
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json());

// Healthcheck (util para Railway y para verificar que el server vive)
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: env.clientOrigin, credentials: true },
});

// Valida el JWT en el handshake: nadie entra al chat sin autenticarse.
io.use(socketAuth);

// Handlers de chat: usuarios online + sala global con persistencia.
// (salas multiples y DM llegan en incrementos siguientes)
registerChatHandlers(io);

server.listen(env.port, () => {
  console.log(`Servidor escuchando en http://localhost:${env.port}`);
});
