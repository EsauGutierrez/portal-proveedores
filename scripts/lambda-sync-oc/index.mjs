// Lambda function: portal-sync-oc
// Invocada por EventBridge Scheduler cada hora.
// Llama al endpoint de sync del portal con el x-sync-key correcto.

export const handler = async () => {
  const url     = process.env.PORTAL_SYNC_URL;   // https://main.d3p4mboa66xgd6.amplifyapp.com/api/sync/all-tenants
  const syncKey = process.env.SYNC_API_KEY;       // mismo valor que en Amplify env vars

  if (!url || !syncKey) {
    console.error('[SYNC] Faltan variables de entorno PORTAL_SYNC_URL o SYNC_API_KEY');
    return { statusCode: 500, body: 'Missing env vars' };
  }

  try {
    console.log(`[SYNC] Llamando ${url} ...`);

    const res = await fetch(url, {
      method: 'GET',
      headers: { 'x-sync-key': syncKey },
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(`[SYNC] Error ${res.status}:`, JSON.stringify(data));
      return { statusCode: res.status, body: JSON.stringify(data) };
    }

    console.log('[SYNC] Resultado:', JSON.stringify(data.summary ?? data));
    return { statusCode: 200, body: JSON.stringify(data) };

  } catch (err) {
    console.error('[SYNC] Error de red:', err.message);
    return { statusCode: 500, body: err.message };
  }
};
