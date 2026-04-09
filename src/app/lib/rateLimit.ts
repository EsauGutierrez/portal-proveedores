// lib/rateLimit.ts
// In-memory rate limiter. Para multi-instancia en producción, reemplazar con Redis.

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

// Limpia entradas expiradas cada 5 minutos para no acumular memoria
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Verifica y registra un intento de uso del rate limiter.
 * @param key    Identificador único (ej. "login:192.168.1.1")
 * @param limit  Máximo de intentos permitidos en la ventana
 * @param windowMs Duración de la ventana en milisegundos
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number; resetAt: number; retryAfterSec: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, resetAt: now + windowMs, retryAfterSec: 0 };
  }

  if (entry.count >= limit) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    return { success: false, remaining: 0, resetAt: entry.resetAt, retryAfterSec };
  }

  entry.count++;
  return { success: true, remaining: limit - entry.count, resetAt: entry.resetAt, retryAfterSec: 0 };
}

/**
 * Extrae la IP del cliente de los headers de la request.
 */
export function getClientIP(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') || // Cloudflare
    'unknown'
  );
}

/**
 * Respuesta estándar cuando se supera el rate limit.
 */
export function rateLimitResponse(retryAfterSec: number) {
  const { NextResponse } = require('next/server');
  return NextResponse.json(
    {
      message: `Demasiados intentos. Por favor espera ${Math.ceil(retryAfterSec / 60)} minuto(s) antes de intentar de nuevo.`,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSec),
        'X-RateLimit-Limit': '0',
      },
    }
  );
}
