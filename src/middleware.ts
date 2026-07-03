import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Métodos que modifican estado — los únicos que necesitan validación de origen
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isAllowedOrigin(origin: string, requestHost: string): boolean {
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  // Construye la lista de hosts permitidos dinámicamente:
  // - El propio host del servidor (cubre cualquier dominio de producción)
  // - NEXT_PUBLIC_APP_URL de .env (para casos donde host != dominio público)
  // - localhost para desarrollo local
  const allowed = new Set<string>(
    [
      requestHost,
      'localhost:3000',
      'localhost:3001',
      process.env.NEXT_PUBLIC_APP_URL
        ? (() => { try { return new URL(process.env.NEXT_PUBLIC_APP_URL!).host; } catch { return ''; } })()
        : '',
    ].filter(Boolean)
  );

  return allowed.has(originHost);
}

export function middleware(request: NextRequest) {
  // Solo aplica a rutas de API con métodos que modifican estado
  if (
    !request.nextUrl.pathname.startsWith('/api/') ||
    !MUTATING_METHODS.has(request.method)
  ) {
    return NextResponse.next();
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host') ?? '';

  // Sin header Origin → petición servidor-a-servidor (EventBridge, SQS, curl, Postman)
  // Estas no tienen origen en el sentido CSRF; los browsers siempre envían Origin en cross-origin.
  if (!origin) return NextResponse.next();

  // Origin: null → iframe sandboxado, redirección cross-origin o data: URI → bloquear
  if (origin === 'null') {
    return NextResponse.json(
      { message: 'Origen de la petición no permitido.' },
      { status: 403 }
    );
  }

  if (!isAllowedOrigin(origin, host)) {
    return NextResponse.json(
      { message: 'Origen de la petición no permitido.' },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  // Aplica el middleware solo a rutas de API
  matcher: '/api/:path*',
};
