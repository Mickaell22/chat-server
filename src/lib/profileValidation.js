import { ALIAS_MAX_LENGTH, BIO_MAX_LENGTH, PROFILE_COLORS } from '../config/constants.js';

export function isValidProfileColor(value) {
  return PROFILE_COLORS.includes(value);
}

// Valida los campos editables del perfil (limite de confianza: vienen del
// body de un PATCH). Cada campo es opcional en el payload; si viene, se
// valida y se normaliza (trim, string vacio -> null = "sin valor"). Devuelve
// { error } si algo es invalido, o { data } con los campos ya normalizados
// listos para pasar a prisma.user.update.
export function validateProfileFields({ alias, bio, profileColor } = {}) {
  const data = {};

  if (alias !== undefined) {
    const trimmed = typeof alias === 'string' ? alias.trim() : '';
    if (trimmed.length > ALIAS_MAX_LENGTH) {
      return { error: `El alias no puede superar los ${ALIAS_MAX_LENGTH} caracteres.` };
    }
    data.alias = trimmed || null;
  }

  if (bio !== undefined) {
    const trimmed = typeof bio === 'string' ? bio.trim() : '';
    if (trimmed.length > BIO_MAX_LENGTH) {
      return { error: `La bio no puede superar los ${BIO_MAX_LENGTH} caracteres.` };
    }
    data.bio = trimmed || null;
  }

  if (profileColor !== undefined) {
    if (profileColor !== null && !isValidProfileColor(profileColor)) {
      return { error: 'Color de perfil invalido.' };
    }
    data.profileColor = profileColor;
  }

  return { data };
}
