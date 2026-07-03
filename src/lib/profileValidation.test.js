// Self-check sin framework: node src/lib/profileValidation.test.js
import assert from 'node:assert/strict';
import { isValidProfileColor, validateProfileFields } from './profileValidation.js';
import { PROFILE_COLORS, ALIAS_MAX_LENGTH, BIO_MAX_LENGTH } from '../config/constants.js';

assert.equal(isValidProfileColor(PROFILE_COLORS[0]), true);
assert.equal(isValidProfileColor('#000000'), false);
assert.equal(isValidProfileColor(undefined), false);

// Payload vacio: no toca nada.
assert.deepEqual(validateProfileFields({}), { data: {} });

// Alias: trim, vacio -> null, demasiado largo -> error.
assert.deepEqual(validateProfileFields({ alias: '  Mick  ' }), { data: { alias: 'Mick' } });
assert.deepEqual(validateProfileFields({ alias: '   ' }), { data: { alias: null } });
assert.ok(validateProfileFields({ alias: 'x'.repeat(ALIAS_MAX_LENGTH + 1) }).error);

// Bio: mismo criterio.
assert.deepEqual(validateProfileFields({ bio: 'hola' }), { data: { bio: 'hola' } });
assert.ok(validateProfileFields({ bio: 'x'.repeat(BIO_MAX_LENGTH + 1) }).error);

// profileColor: null limpia, color de la paleta pasa, cualquier otro string falla.
assert.deepEqual(validateProfileFields({ profileColor: null }), { data: { profileColor: null } });
assert.deepEqual(
  validateProfileFields({ profileColor: PROFILE_COLORS[2] }),
  { data: { profileColor: PROFILE_COLORS[2] } },
);
assert.ok(validateProfileFields({ profileColor: '#123456' }).error);

console.log('profileValidation.test OK');
