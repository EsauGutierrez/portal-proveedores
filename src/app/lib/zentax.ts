export type Lista69bStatusValue = 'NOT_CHECKED' | 'NO_LISTADO' | 'PRESUNTO' | 'DEFINITIVO' | 'DESVIRTUADO' | 'SENTENCIA_FAVORABLE';

export type ZentaxResult = {
  rfc: string;
  status: Exclude<Lista69bStatusValue, 'NOT_CHECKED'>;
};

// Recibe un array de RFCs y devuelve los que SÍ están en Lista 69B con su estatus.
// Los RFC que no aparecen en la respuesta se consideran NO_LISTADO.
export async function checkLista69bBulk(rfcs: string[]): Promise<ZentaxResult[]> {
  const ZENTAX_URL = process.env.ZENTAX_API_URL;
  const ZENTAX_API_KEY = process.env.ZENTAX_API_KEY;

  if (!ZENTAX_URL || !ZENTAX_API_KEY) {
    throw new Error('ZENTAX_API_URL o ZENTAX_API_KEY no están configurados.');
  }

  if (rfcs.length === 0) return [];

  const response = await fetch(`${ZENTAX_URL}/api/v1/lista69b/bulk-check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ZENTAX_API_KEY,
    },
    body: JSON.stringify({ rfcs }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zentax respondió ${response.status}: ${text}`);
  }

  const data = await response.json();
  if (!Array.isArray(data?.results)) {
    throw new Error(`Zentax: respuesta inesperada — ${JSON.stringify(data)}`);
  }
  return data.results as ZentaxResult[];
}
