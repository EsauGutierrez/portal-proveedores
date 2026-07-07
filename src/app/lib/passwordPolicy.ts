// app/lib/passwordPolicy.ts
// Política de contraseñas centralizada — usada en todo endpoint/formulario que
// establece o cambia una contraseña (invitación, registro, recuperación, cambio de perfil).

export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[._@$!%*?&]).{8,72}$/;

export const PASSWORD_POLICY_MESSAGE =
  'La contraseña debe tener 8 o más caracteres y combinar mayúsculas, minúsculas, números y símbolos (._@$!%*?&).';

export function isValidPassword(password: string): boolean {
  return PASSWORD_REGEX.test(password);
}

export type PasswordRequirement = { label: string; test: (password: string) => boolean };

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { label: 'Entre 8 y 72 caracteres', test: (p) => p.length >= 8 && p.length <= 72 },
  { label: 'Al menos una mayúscula', test: (p) => /[A-Z]/.test(p) },
  { label: 'Al menos una minúscula', test: (p) => /[a-z]/.test(p) },
  { label: 'Al menos un número', test: (p) => /\d/.test(p) },
  { label: 'Al menos un símbolo ( . _ @ $ ! % * ? & )', test: (p) => /[._@$!%*?&]/.test(p) },
];
