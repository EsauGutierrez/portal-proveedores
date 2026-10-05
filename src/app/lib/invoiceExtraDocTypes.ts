// Tipos de archivo y validación para los documentos adicionales de factura.
// Módulo puro (sin Prisma): lo usan tanto el servidor como los componentes cliente.

export const MAX_EXTRA_FILE_MB = 10;
export const MAX_EXTRA_FILE_BYTES = MAX_EXTRA_FILE_MB * 1024 * 1024;

export type ExtraFileType = 'PDF' | 'IMAGE' | 'EXCEL' | 'WORD';

export const EXTRA_FILE_TYPES: Record<ExtraFileType, { label: string; extensions: string[] }> = {
  PDF: { label: 'PDF', extensions: ['.pdf'] },
  IMAGE: { label: 'Imágenes (JPG, PNG)', extensions: ['.jpg', '.jpeg', '.png'] },
  EXCEL: { label: 'Excel', extensions: ['.xlsx', '.xls'] },
  WORD: { label: 'Word', extensions: ['.docx', '.doc'] },
};

export const EXTRA_FILE_TYPE_KEYS = Object.keys(EXTRA_FILE_TYPES) as ExtraFileType[];

export function isExtraFileType(value: unknown): value is ExtraFileType {
  return typeof value === 'string' && value in EXTRA_FILE_TYPES;
}

export function extensionsFor(allowedTypes: string[]): string[] {
  return allowedTypes.filter(isExtraFileType).flatMap((t) => EXTRA_FILE_TYPES[t].extensions);
}

// Valor para el atributo `accept` de <input type="file">
export function acceptAttribute(allowedTypes: string[]): string {
  return extensionsFor(allowedTypes).join(',');
}

// Texto legible: "PDF, Imágenes (JPG, PNG)"
export function describeAllowedTypes(allowedTypes: string[]): string {
  return allowedTypes
    .filter(isExtraFileType)
    .map((t) => EXTRA_FILE_TYPES[t].label)
    .join(', ');
}

function matchesMagicBytes(ext: string, h: Uint8Array): boolean {
  const isPDF = h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46;
  const isJPEG = h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff;
  const isPNG = h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47;
  // .xlsx y .docx son contenedores ZIP; .xls y .doc son OLE2 (formato binario antiguo)
  const isZip = h[0] === 0x50 && h[1] === 0x4b;
  const isOle = h[0] === 0xd0 && h[1] === 0xcf && h[2] === 0x11 && h[3] === 0xe0;

  switch (ext) {
    case '.pdf': return isPDF;
    case '.jpg':
    case '.jpeg': return isJPEG;
    case '.png': return isPNG;
    case '.xlsx':
    case '.docx': return isZip;
    case '.xls':
    case '.doc': return isOle;
    default: return false;
  }
}

/**
 * Valida un archivo contra los tipos permitidos de un documento adicional:
 * tamaño, extensión permitida y que el contenido real (magic bytes) corresponda
 * a esa extensión — no se confía en el MIME que declara el navegador.
 * Devuelve el mensaje de error, o null si el archivo es válido.
 */
export async function validateExtraFile(file: File, allowedTypes: string[]): Promise<string | null> {
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > MAX_EXTRA_FILE_BYTES) return `El archivo no puede superar los ${MAX_EXTRA_FILE_MB} MB.`;

  const allowedExt = extensionsFor(allowedTypes);
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  if (!allowedExt.includes(ext)) {
    return `Formato no permitido. Se aceptan: ${describeAllowedTypes(allowedTypes)}.`;
  }

  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!matchesMagicBytes(ext, header)) {
    return `El contenido del archivo no corresponde a un formato ${ext} válido.`;
  }
  return null;
}
