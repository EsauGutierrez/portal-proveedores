// Plantillas de correo reutilizables para notificaciones del sistema.

export interface Lista69bEntry {
  companyName: string;
  rfc: string;
  statusLabel: string;
}

/**
 * Genera el HTML del correo de alerta Lista 69B.
 * Úsala para registro de proveedor, edición de RFC y verificación mensual.
 */
export function buildLista69bAlertEmail(opts: {
  suppliers: Lista69bEntry[];
  contextMessage?: string;
  date?: Date;
}): string {
  const { suppliers, contextMessage, date = new Date() } = opts;

  const dateStr = date.toLocaleDateString('es-MX', { dateStyle: 'long' });

  const rows = suppliers
    .map(
      (s) => `
      <tr style="border-bottom:1px solid #fecaca">
        <td style="padding:11px 16px;color:#111827;font-size:14px">${s.companyName}</td>
        <td style="padding:11px 16px;font-family:monospace;font-size:13px;color:#374151">${s.rfc}</td>
        <td style="padding:11px 16px">
          <span style="display:inline-block;padding:3px 10px;border-radius:9999px;background:#fee2e2;color:#991b1b;font-size:12px;font-weight:700;white-space:nowrap">${s.statusLabel}</span>
        </td>
      </tr>`
    )
    .join('');

  const defaultContext =
    suppliers.length === 1
      ? 'El siguiente proveedor aparece en la Lista 69B del SAT:'
      : `Los siguientes <strong>${suppliers.length} proveedores</strong> aparecen en la Lista 69B del SAT:`;

  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:24px">
    <div style="background:linear-gradient(135deg,#991b1b 0%,#dc2626 100%);padding:32px;border-radius:12px 12px 0 0;text-align:center">
      <div style="font-size:36px;margin-bottom:8px">⚠️</div>
      <h1 style="color:white;margin:0;font-size:22px;font-weight:700">Alerta Lista 69B del SAT</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px">Verificación de proveedores contra la lista del SAT</p>
    </div>

    <div style="background:white;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <p style="color:#374151;font-size:15px;margin-top:0">
        ${contextMessage ?? defaultContext}
      </p>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;overflow:hidden;margin:20px 0">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#fee2e2">
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#7f1d1d;text-transform:uppercase;letter-spacing:0.05em;font-weight:700">Proveedor</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#7f1d1d;text-transform:uppercase;letter-spacing:0.05em;font-weight:700">RFC</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#7f1d1d;text-transform:uppercase;letter-spacing:0.05em;font-weight:700">Estatus SAT</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div style="padding:12px 16px;background:#fff7ed;border-left:3px solid #f97316;border-radius:4px;margin-bottom:24px">
        <p style="color:#9a3412;font-size:13px;margin:0">
          Revisa el perfil de ${suppliers.length === 1 ? 'este proveedor' : 'estos proveedores'} en el portal y toma las medidas necesarias antes de procesar cualquier transacción.
        </p>
      </div>

      <div style="border-top:1px solid #e5e7eb;padding-top:20px;text-align:center">
        <p style="color:#9ca3af;font-size:12px;margin:0">Portal de Proveedores &nbsp;·&nbsp; Alerta Lista 69B SAT &nbsp;·&nbsp; ${dateStr}</p>
      </div>
    </div>
  </div>`;
}

export interface PaidInvoiceEntry {
  folio: string;
  total: number;
  fecha: Date;
}

/**
 * Genera el HTML del correo que avisa a un proveedor que una o más de sus
 * facturas ya fueron pagadas, para que emita su Complemento de Pago (CFDI) si aún no lo ha hecho.
 */
export function buildInvoicePaidEmail(opts: {
  supplierName: string;
  invoices: PaidInvoiceEntry[];
  date?: Date;
}): string {
  const { supplierName, invoices, date = new Date() } = opts;
  const dateStr = date.toLocaleDateString('es-MX', { dateStyle: 'long' });
  const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

  const rows = invoices
    .map(
      (i) => `
      <tr style="border-bottom:1px solid #bbf7d0">
        <td style="padding:11px 16px;font-family:monospace;font-size:13px;color:#374151">${i.folio.slice(-12)}</td>
        <td style="padding:11px 16px;color:#111827;font-size:14px">${i.fecha.toLocaleDateString('es-MX')}</td>
        <td style="padding:11px 16px;color:#111827;font-size:14px;text-align:right">${fmt(i.total)}</td>
      </tr>`
    )
    .join('');

  const contextMessage =
    invoices.length === 1
      ? 'Te informamos que la siguiente factura ya fue pagada:'
      : `Te informamos que las siguientes <strong>${invoices.length} facturas</strong> ya fueron pagadas:`;

  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:24px">
    <div style="background:linear-gradient(135deg,#15803d 0%,#22c55e 100%);padding:32px;border-radius:12px 12px 0 0;text-align:center">
      <div style="font-size:36px;margin-bottom:8px">💰</div>
      <h1 style="color:white;margin:0;font-size:22px;font-weight:700">¡Factura pagada!</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px">Portal de Proveedores</p>
    </div>

    <div style="background:white;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <p style="color:#374151;font-size:15px;margin-top:0">Hola, <strong>${supplierName}</strong></p>
      <p style="color:#374151;font-size:15px">${contextMessage}</p>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;overflow:hidden;margin:20px 0">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#dcfce7">
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#14532d;text-transform:uppercase;letter-spacing:0.05em;font-weight:700">Factura</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#14532d;text-transform:uppercase;letter-spacing:0.05em;font-weight:700">Fecha</th>
              <th style="padding:10px 16px;text-align:right;font-size:12px;color:#14532d;text-transform:uppercase;letter-spacing:0.05em;font-weight:700">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div style="padding:12px 16px;background:#fff7ed;border-left:3px solid #f97316;border-radius:4px;margin-bottom:24px">
        <p style="color:#9a3412;font-size:13px;margin:0">
          Si aún no lo has hecho, recuerda subir tu <strong>Complemento de Pago (CFDI)</strong> correspondiente en el portal para cumplir con tus obligaciones fiscales ante el SAT.
        </p>
      </div>

      <div style="border-top:1px solid #e5e7eb;padding-top:20px;text-align:center">
        <p style="color:#9ca3af;font-size:12px;margin:0">Portal de Proveedores &nbsp;·&nbsp; ${dateStr}</p>
      </div>
    </div>
  </div>`;
}
