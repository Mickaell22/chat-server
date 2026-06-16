import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

// Healthcheck (util para Railway y para verificar que el server vive)
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// TODO (semana 1): montar rutas de auth -> app.use('/api/auth', authRouter)

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, credentials: true },
});

// TODO (semana 1): middleware que valida el JWT en el handshake del socket
// TODO (semana 2-3): registrar handlers de chat (salas, DM, usuarios online)
io.on('connection', (socket) => {
  console.log(`Socket conectado: ${socket.id}`);
  socket.on('disconnect', () => console.log(`Socket desconectado: ${socket.id}`));
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
