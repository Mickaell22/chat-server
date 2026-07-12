// Constantes compartidas del chat.

// Sala global: existe siempre, todos entran al conectarse. Es una Room real en
// la DB (sin createdBy: es "del sistema") para poder persistir sus mensajes.
export const GLOBAL_ROOM_NAME = 'global';

// Cuantos mensajes se cargan al abrir una conversacion.
export const MESSAGE_HISTORY_LIMIT = 50;

// Tope de longitud de un mensaje (limite de confianza: el socket es input no
// confiable). Se valida server-side antes de persistir.
export const MAX_MESSAGE_LENGTH = 2000;

// Salas: limites del nombre elegido por el usuario (limite de confianza).
export const ROOM_NAME_MIN_LENGTH = 2;
export const ROOM_NAME_MAX_LENGTH = 24;

// Paleta cerrada de reacciones (limite de confianza: el server no acepta
// otro emoji). Mantener en sync con REACTION_EMOJIS del cliente.
export const REACTION_EMOJIS = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F525}'];

// Perfil: limites de los campos editables (limite de confianza).
export const ALIAS_MAX_LENGTH = 40;
export const BIO_MAX_LENGTH = 160;

// Paleta cerrada para el color de perfil (tono 400, misma familia que los
// tokens semanticos --online/--error/--warning). No se acepta un hex libre:
// evita que el usuario mande cualquier color fuera del sistema de diseño.
export const PROFILE_COLORS = [
  '#f87171', // rojo
  '#fb923c', // naranja
  '#fbbf24', // ambar
  '#4ade80', // verde
  '#22d3ee', // cian
  '#60a5fa', // azul
  '#a78bfa', // violeta
  '#f472b6', // rosa
];

// Cooldown entre reenvios del correo de verificacion.
export const RESEND_COOLDOWN_MS = 60_000;
