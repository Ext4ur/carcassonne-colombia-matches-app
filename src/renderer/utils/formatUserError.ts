/**
 * Extrae un mensaje legible para el usuario a partir de un error desconocido.
 * Nunca incluye stack traces ni datos sensibles.
 */
export function formatUserError(error: unknown, fallback: string): string {
  if (typeof error === 'string') {
    const trimmed = error.trim();
    if (trimmed.length > 0) return trimmed;
    return fallback;
  }

  if (error instanceof Error) {
    const trimmed = error.message.trim();
    if (trimmed.length > 0) return trimmed;
    return fallback;
  }

  if (error !== null && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === 'string') {
      const trimmed = msg.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }

  return fallback;
}
