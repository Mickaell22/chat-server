// Constantes compartidas del chat.

// Sala global: existe siempre, todos entran al conectarse. Es una Room real en
// la DB (sin createdBy: es "del sistema") para poder persistir sus mensajes.
export const GLOBAL_ROOM_NAME = 'global';

// Cuantos mensajes se cargan al abrir una conversacion.
export const MESSAGE_HISTORY_LIMIT = 50;

// Tope de longitud de un mensaje (limite de confianza: el socket es input no
// confiable). Se valida server-side antes de persistir.
export const MAX_MESSAGE_LENGTH = 2000;
