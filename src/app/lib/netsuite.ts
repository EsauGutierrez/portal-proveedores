// lib/netsuite.ts
import crypto from 'crypto';
import OAuth from 'oauth-1.0a'; // Aún lo usamos para la codificación y el nonce

export interface NetSuiteCredentials {
  accountId: string;
  consumerKey: string;
  consumerSecret: string;
  tokenId: string;
  tokenSecret: string;
}

/**
 * Realiza una consulta a la API de SuiteQL de NetSuite.
 * @param q La consulta de SuiteQL que se va a ejecutar.
 * @param creds Credenciales de NetSuite
 * @returns La respuesta JSON parseada desde la API.
 */
export async function querySuiteQL(q: string, creds: NetSuiteCredentials) {
  const oauth = new OAuth({
    consumer: {
      key: creds.consumerKey,
      secret: creds.consumerSecret,
    },
    signature_method: 'HMAC-SHA256',
    hash_function(base_string, key) {
      return crypto.createHmac('sha256', key).update(base_string).digest('base64');
    },
  });

  const accountId = creds.accountId.toUpperCase();
  const suiteqlUrl = `https://${accountId.replace(/_/g, '-').toLowerCase()}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`;

  const token = {
    key: creds.tokenId,
    secret: creds.tokenSecret,
  };

  const request_data = {
    url: suiteqlUrl,
    method: 'POST',
  };

  const authHeader = oauth.toHeader(oauth.authorize(request_data, token));
  authHeader.Authorization += `, realm="${accountId}"`;

  try {
    const response = await fetch(suiteqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'prefer': 'transient',
        'Authorization': authHeader.Authorization,
      },
      body: JSON.stringify({ q }),
    });

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errorBody = await response.json();
        console.error('Error de la API de NetSuite:', JSON.stringify(errorBody));
        const msg = errorBody?.['o:errorDetails']?.[0]?.detail
          || errorBody?.message
          || errorBody?.error?.message
          || JSON.stringify(errorBody);
        errorDetail = ` — ${msg}`;
      } catch {
        errorDetail = ` — ${await response.text().catch(() => '')}`;
      }
      throw new Error(`Error al conectar con NetSuite: ${response.status} ${response.statusText}${errorDetail}`);
    }

    const data = await response.json();
    return data.items;
  } catch (error) {
    console.error('Error en la función querySuiteQL:', error);
    throw error;
  }
}

/**
 * Llama a un RESTlet de NetSuite utilizando OAuth 1.0a.
 * @param scriptId El ID interno o string del script (ej. 'customscript_imr_portal_restlet')
 * @param deployId El ID del despliegue (ej. 'customdeploy_imr_portal_restlet_1')
 * @param method El método HTTP ('GET', 'POST', 'PUT', 'DELETE')
 * @param creds Credenciales de NetSuite
 * @param body El cuerpo de la petición (opcional)
 */
export async function invokeRestlet(scriptId: string, deployId: string, creds: NetSuiteCredentials, method: string = 'POST', body?: any) {
  const oauth = new OAuth({
    consumer: {
      key: creds.consumerKey,
      secret: creds.consumerSecret,
    },
    signature_method: 'HMAC-SHA256',
    hash_function(base_string, key) {
      return crypto.createHmac('sha256', key).update(base_string).digest('base64');
    },
  });

  const accountId = creds.accountId.toUpperCase();
  const restletUrl = `https://${accountId.replace(/_/g, '-').toLowerCase()}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=${scriptId}&deploy=${deployId}`;

  const token = {
    key: creds.tokenId,
    secret: creds.tokenSecret,
  };

  const request_data = {
    url: restletUrl,
    method: method,
  };

  const authHeader = oauth.toHeader(oauth.authorize(request_data, token));
  authHeader.Authorization += `, realm="${accountId}"`;

  try {
    const fetchOptions: RequestInit = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader.Authorization,
      },
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(restletUrl, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error del RESTlet de NetSuite:', errorText);
      throw new Error(`Error en el RESTlet: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error al invocar RESTlet:', error);
    throw error;
  }
}
