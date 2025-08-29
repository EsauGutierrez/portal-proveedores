// lib/netsuite.ts
import crypto from 'crypto';
import OAuth from 'oauth-1.0a'; // Aún lo usamos para la codificación y el nonce

/**
 * Realiza una consulta a la API de SuiteQL de NetSuite.
 * @param q La consulta de SuiteQL que se va a ejecutar.
 * @returns La respuesta JSON parseada desde la API.
 */
export async function querySuiteQL(q: string) {
  const oauth = new OAuth({
    consumer: {
      key: "4f6f1ab755722a38d7ccf6d76e308b9e92907d74a98615d112f6350f885ea89e",//process.env.NETSUITE_CONSUMER_KEY!,
      secret: "23a83f09072a8a45b596e30c93f75132cf579971099595b8dd6a9606067f609e"//process.env.NETSUITE_CONSUMER_SECRET!,
    },
    signature_method: 'HMAC-SHA256',
    hash_function(base_string, key) {
      return crypto.createHmac('sha256', key).update(base_string).digest('base64');
    },
  });

  const accountId = process.env.NETSUITE_ACCOUNT!;
  const suiteqlUrl = `https://${accountId.replace(/_/g, '-')}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`;

  const token = {
    key: "d5b042892a6b7d2b41ec36f29cfc5b72a637a8c8a26a978192e27677f435160a",//process.env.NETSUITE_TOKEN_ID!,
    secret: "d379f8f5599714f4f5000bfe6b9cc1a352d4c9ce30f28bb0828ceb8894ca14f9"//process.env.NETSUITE_TOKEN_SECRET!,
  };

  // 1. Generar parámetros OAuth manualmente
  const oauth_timestamp = Math.floor(Date.now() / 1000).toString();
  const oauth_nonce = oauth.getNonce();

  const oauthParameters = {
    oauth_consumer_key: oauth.consumer.key,
    oauth_nonce: oauth_nonce,
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: oauth_timestamp,
    oauth_token: token.key,
    oauth_version: '1.0',
  };

  // 2. Crear la cadena de parámetros ordenada y codificada
  const parameterString = Object.keys(oauthParameters)
    .sort()
    .map(key => `${key}=${oauth.percentEncode(oauthParameters[key])}`)
    .join('&');
    
  // 3. Crear la "base string" para la firma
  const baseString = `POST&${oauth.percentEncode(suiteqlUrl)}&${oauth.percentEncode(parameterString)}`;

  // 4. Crear la clave para la firma
  const signingKey = `${oauth.percentEncode(oauth.consumer.secret)}&${oauth.percentEncode(token.secret)}`;

  // 5. Generar la firma
  const oauth_signature = oauth.hash_function(baseString, signingKey);

  // 6. Construir el encabezado de autorización final
  const realm = accountId;
  const header = `OAuth realm="${realm}",` +
    `oauth_consumer_key="${oauth.percentEncode(oauthParameters.oauth_consumer_key)}",` +
    `oauth_token="${oauth.percentEncode(oauthParameters.oauth_token)}",` +
    `oauth_signature_method="${oauth.percentEncode(oauthParameters.oauth_signature_method)}",` +
    `oauth_timestamp="${oauth.percentEncode(oauthParameters.oauth_timestamp)}",` +
    `oauth_nonce="${oauth.percentEncode(oauthParameters.oauth_nonce)}",` +
    `oauth_version="${oauth.percentEncode(oauthParameters.oauth_version)}",` +
    `oauth_signature="${oauth.percentEncode(oauth_signature)}"`;

  try {
    const response = await fetch(suiteqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'prefer': 'transient',
        'Authorization': header,
      },
      body: JSON.stringify({ q }),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      console.error('Error de la API de NetSuite:', errorBody);
      throw new Error(`Error al conectar con NetSuite: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.items;
  } catch (error) {
    console.error('Error en la función querySuiteQL:', error);
    throw error;
  }
}
