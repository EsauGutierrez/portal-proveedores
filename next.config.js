/** @type {import('next').NextConfig} */

// Content Security Policy — compatible con Next.js 15 (App Router, hydración inline)
const csp = [
  "default-src 'self'",
  // Next.js requiere 'unsafe-inline' para hidratación de React en App Router
  "script-src 'self' 'unsafe-inline'",
  // Tailwind + estilos inline de componentes
  "style-src 'self' 'unsafe-inline'",
  // Imágenes: mismo origen, data URIs, S3 (presigned URLs), avatares placeholder
  "img-src 'self' data: blob: https://*.s3.amazonaws.com https://*.s3.us-east-2.amazonaws.com https://placehold.co",
  // Fuentes embebidas como data URI
  "font-src 'self' data:",
  // fetch/XHR: mismo origen + S3 para descarga de archivos con presigned URLs
  "connect-src 'self' https://*.s3.amazonaws.com https://*.s3.us-east-2.amazonaws.com",
  // Bloquea embedding en iframes — previene clickjacking
  "frame-ancestors 'none'",
  // Bloquea plugins (Flash, etc.)
  "object-src 'none'",
  // Evita inyección de <base> maliciosa que redirige URLs relativas
  "base-uri 'self'",
  // Formularios solo pueden enviar datos al mismo origen
  "form-action 'self'",
  // Fuerza HTTPS para recursos embebidos en producción
  "upgrade-insecure-requests",
].join('; ');

const securityHeaders = [
  // Previene XSS, clickjacking y carga de recursos externos maliciosos
  { key: 'Content-Security-Policy', value: csp },
  // Redundante con frame-ancestors del CSP, pero cubre browsers más antiguos
  { key: 'X-Frame-Options', value: 'DENY' },
  // Evita MIME-sniffing de archivos subidos (ej. PDF interpretado como HTML)
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Controla qué URL se expone como Referer en requests externos
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Fuerza HTTPS por 2 años — solo activo en producción (HTTPS)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // Deshabilita APIs del navegador no usadas por el portal
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
