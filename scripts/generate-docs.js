// scripts/generate-docs.js
// Ejecutar con: node scripts/generate-docs.js

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '../public/docs');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BLUE   = '#1d4ed8';
const DARK   = '#1e293b';
const GRAY   = '#64748b';
const LIGHT  = '#f1f5f9';
const WHITE  = '#ffffff';
const RED    = '#dc2626';
const GREEN  = '#16a34a';

function createDoc() {
  return new PDFDocument({ size: 'LETTER', margins: { top: 60, bottom: 60, left: 60, right: 60 }, info: { Author: 'Portal de Proveedores IMR' } });
}

function header(doc, title, subtitle) {
  // Barra superior
  doc.rect(0, 0, doc.page.width, 72).fill(BLUE);
  const logoPath = path.join(__dirname, '../public/logo-imr.png');
  if (fs.existsSync(logoPath)) {
    try { doc.image(logoPath, 40, 16, { height: 38, fit: [160, 38] }); } catch (_) {}
  }
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(11).text('Portal de Proveedores', 40, 54, { align: 'left' });

  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(22).text(title, 60, 100);
  if (subtitle) {
    doc.fillColor(GRAY).font('Helvetica').fontSize(11).text(subtitle, 60, 130, { width: doc.page.width - 120 });
  }
  doc.moveDown(2);
}

function sectionTitle(doc, text) {
  doc.moveDown(0.8);
  doc.rect(60, doc.y, doc.page.width - 120, 24).fill(LIGHT);
  doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(12).text(text, 68, doc.y - 20);
  doc.moveDown(0.6);
  doc.fillColor(DARK).font('Helvetica').fontSize(10.5);
}

function body(doc, text) {
  doc.fillColor(DARK).font('Helvetica').fontSize(10.5).text(text, 60, doc.y, { width: doc.page.width - 120, align: 'justify' });
  doc.moveDown(0.5);
}

function bullet(doc, items) {
  items.forEach(item => {
    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(10.5).text('•', 68, doc.y, { continued: true, width: 12 });
    doc.fillColor(DARK).font('Helvetica').fontSize(10.5).text('  ' + item, { width: doc.page.width - 140 });
    doc.moveDown(0.2);
  });
  doc.moveDown(0.3);
}

function numberedList(doc, items) {
  items.forEach((item, i) => {
    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(10.5).text(`${i + 1}.`, 68, doc.y, { continued: true, width: 18 });
    doc.fillColor(DARK).font('Helvetica').fontSize(10.5).text('  ' + item, { width: doc.page.width - 148 });
    doc.moveDown(0.25);
  });
  doc.moveDown(0.4);
}

function note(doc, text, color = '#92400e', bg = '#fef3c7') {
  const y = doc.y;
  doc.rect(60, y, doc.page.width - 120, 30).fill(bg);
  doc.fillColor(color).font('Helvetica-Oblique').fontSize(9.5).text('⚠  ' + text, 70, y + 9, { width: doc.page.width - 140 });
  doc.moveDown(1.2);
}

function footer(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.rect(0, doc.page.height - 40, doc.page.width, 40).fill('#f8fafc');
    doc.fillColor(GRAY).font('Helvetica').fontSize(8)
       .text('Portal de Proveedores — IMR Software  |  Confidencial', 60, doc.page.height - 26, { align: 'left', width: doc.page.width - 120, continued: true })
       .text(`Página ${i + 1}`, { align: 'right' });
  }
}

// ─── 1. Manual de Usuario ─────────────────────────────────────────────────────
function generateManual() {
  const doc = createDoc();
  const out = fs.createWriteStream(path.join(OUT_DIR, 'manual-usuario.pdf'));
  doc.pipe(out);

  header(doc, 'Manual de Usuario', 'Guía completa para el uso del Portal de Proveedores IMR');

  sectionTitle(doc, '1. Introducción');
  body(doc, 'El Portal de Proveedores IMR es una plataforma web diseñada para facilitar la gestión de órdenes de compra, facturas y complementos de pago entre IMR y sus proveedores registrados. Este manual describe los pasos necesarios para operar el portal de forma eficiente.');

  sectionTitle(doc, '2. Acceso al Portal');
  body(doc, 'Para ingresar al portal, el administrador de tu empresa habrá enviado una invitación al correo electrónico registrado. Los pasos son:');
  numberedList(doc, [
    'Abre el correo de invitación y haz clic en "Activar mi cuenta".',
    'Establece una contraseña segura (mínimo 8 caracteres).',
    'Completa tu perfil con los datos fiscales requeridos (RFC, razón social, domicilio fiscal).',
    'Si tu cuenta requiere documentos, carga los archivos solicitados antes de continuar.',
    'Una vez aprobado por el administrador, tendrás acceso completo al portal.',
  ]);
  note(doc, 'El enlace de activación tiene vigencia de 72 horas. Si expira, contacta a tu administrador para solicitar uno nuevo.');

  sectionTitle(doc, '3. Panel Principal (Resumen)');
  body(doc, 'Al iniciar sesión verás el panel de resumen con indicadores clave de tu actividad:');
  bullet(doc, [
    'Facturas subidas: total de facturas enviadas.',
    'Aprobadas: facturas con sincronización exitosa en el sistema.',
    'Pendientes: facturas en proceso de revisión.',
    'Monto aprobado: suma total de facturas aceptadas.',
    'Actividad reciente: tus últimas 5 facturas con estado actualizado.',
  ]);

  sectionTitle(doc, '4. Órdenes de Compra');
  body(doc, 'En la sección "Órdenes de Compra" puedes consultar todas las órdenes asignadas a tu cuenta. Cada orden muestra:');
  bullet(doc, [
    'Folio y fecha de emisión.',
    'Subtotal, impuestos y total de la orden.',
    'Subsidiaria emisora.',
    'Estado de la orden.',
  ]);
  body(doc, 'Las órdenes son generadas y sincronizadas automáticamente desde el sistema interno de IMR. No es posible crear órdenes manualmente desde el portal.');

  sectionTitle(doc, '5. Facturas');
  body(doc, 'Para subir una factura contra una orden de compra:');
  numberedList(doc, [
    'Ve a la sección "Facturas" en el menú lateral.',
    'Haz clic en "Subir Factura".',
    'Selecciona la Orden de Compra relacionada.',
    'Adjunta el archivo XML (obligatorio) y PDF de la factura.',
    'Confirma los datos: folio, fecha, monto.',
    'Haz clic en "Enviar Factura".',
  ]);
  note(doc, 'El XML y PDF deben corresponder a la misma factura. El folio del XML no puede repetirse.');

  sectionTitle(doc, '6. Complementos de Pago');
  body(doc, 'Cuando IMR haya realizado el pago de una factura, debes subir el complemento de pago correspondiente:');
  numberedList(doc, [
    'Ve a "Complemento de Pagos" en el menú lateral.',
    'Selecciona la factura ya aprobada.',
    'Adjunta el XML y PDF del complemento de pago (CFDI 3.3 o 4.0).',
    'Verifica el folio, fecha de pago y monto.',
    'Envía el complemento — quedará en revisión del administrador.',
  ]);
  body(doc, 'El complemento puede ser aprobado o rechazado por el administrador. Si es rechazado, recibirás un correo con el motivo.');

  sectionTitle(doc, '7. Solicitar Ayuda');
  body(doc, 'Si tienes dudas o problemas relacionados con una orden de compra o factura, puedes enviar una solicitud de ayuda directamente desde el portal:');
  numberedList(doc, [
    'Ve a "Solicitar Ayuda" en el menú lateral.',
    'Selecciona el tipo de solicitud: OC, Factura u Otro.',
    'Indica el documento relacionado (opcional).',
    'Escribe el asunto y descripción detallada.',
    'Haz clic en "Enviar solicitud".',
  ]);
  body(doc, 'Tu solicitud será enviada al equipo de soporte de IMR, quien se comunicará contigo a la brevedad.');

  sectionTitle(doc, '8. Perfil y Contraseña');
  body(doc, 'En la sección "Perfil" puedes actualizar tu información personal. Para cambiar tu contraseña:');
  numberedList(doc, [
    'Ve a "Perfil" en el menú lateral.',
    'Haz clic en "Cambiar contraseña".',
    'Ingresa tu contraseña actual y la nueva (mínimo 8 caracteres).',
    'Confirma los cambios.',
  ]);
  note(doc, 'Por seguridad, se recomienda cambiar la contraseña periódicamente y no compartirla con terceros.');

  footer(doc);
  doc.end();
  out.on('finish', () => console.log('✅  manual-usuario.pdf generado'));
}

// ─── 2. Políticas de Facturación ──────────────────────────────────────────────
function generatePoliticas() {
  const doc = createDoc();
  const out = fs.createWriteStream(path.join(OUT_DIR, 'politicas-facturacion.pdf'));
  doc.pipe(out);

  header(doc, 'Políticas de Facturación', 'Lineamientos para la emisión y recepción de comprobantes fiscales');

  sectionTitle(doc, '1. Objetivo');
  body(doc, 'El presente documento establece los lineamientos, requisitos y procedimientos que los proveedores de IMR deben cumplir para la correcta emisión, recepción y gestión de comprobantes fiscales digitales (CFDI) a través del Portal de Proveedores.');

  sectionTitle(doc, '2. Requisitos del CFDI');
  body(doc, 'Todo comprobante fiscal enviado a través del portal deberá cumplir con los siguientes requisitos:');
  bullet(doc, [
    'Estar emitido conforme al CFDI versión 4.0 (o 3.3 en periodo de transición según SAT).',
    'Contener el RFC del receptor correspondiente a la subsidiaria de IMR indicada en la orden de compra.',
    'El monto total debe coincidir con el importe acordado en la orden de compra.',
    'Incluir el complemento de comercio exterior cuando aplique.',
    'Contar con el sello digital válido del SAT al momento de la carga.',
    'El XML y PDF deben corresponder al mismo comprobante (mismo UUID/folio fiscal).',
  ]);

  sectionTitle(doc, '3. Plazos de Facturación');
  bullet(doc, [
    'La factura debe emitirse dentro de los 30 días naturales posteriores a la recepción de la mercancía o servicio.',
    'Las facturas recibidas fuera de plazo podrán ser rechazadas sin responsabilidad para IMR.',
    'El complemento de pago debe emitirse a más tardar el día 10 del mes siguiente al que se realizó el pago.',
  ]);

  sectionTitle(doc, '4. Proceso de Revisión y Aprobación');
  body(doc, 'Una vez recibida la factura en el portal, el proceso de revisión es el siguiente:');
  numberedList(doc, [
    'El sistema valida automáticamente el formato XML y la vigencia del sello.',
    'El administrador de IMR revisa que la factura corresponda a una orden de compra activa.',
    'Si la factura es correcta, se aprueba y se sincroniza con el sistema financiero.',
    'Si existen observaciones, la factura es rechazada con el motivo indicado. El proveedor podrá reenviarla corregida.',
  ]);

  sectionTitle(doc, '5. Causas de Rechazo');
  body(doc, 'Una factura puede ser rechazada por las siguientes razones:');
  bullet(doc, [
    'RFC del receptor incorrecto o no corresponde a la subsidiaria de la OC.',
    'Monto diferente al acordado en la orden de compra.',
    'XML con sello inválido o cancelado en el SAT.',
    'Factura duplicada (UUID ya registrado en el sistema).',
    'Factura emitida fuera del periodo de vigencia de la orden de compra.',
    'Conceptos que no corresponden al objeto de la OC.',
  ]);
  note(doc, 'Las facturas rechazadas deben ser canceladas ante el SAT antes de emitir un nuevo CFDI de reemplazo.');

  sectionTitle(doc, '6. Complementos de Pago');
  body(doc, 'El proveedor está obligado a emitir el complemento de pago (REP) cuando:');
  bullet(doc, [
    'El pago de la factura se realice en una o más parcialidades.',
    'El pago se efectúe en fecha posterior a la emisión de la factura.',
  ]);
  body(doc, 'El complemento debe cargarse en el portal una vez que IMR haya realizado el pago. De lo contrario, la relación comercial puede verse afectada para futuros pagos.');

  sectionTitle(doc, '7. Retenciones e Impuestos');
  bullet(doc, [
    'Las tasas de IVA aplicables son 16%, 8% (zona fronteriza) o 0% según corresponda.',
    'Si el proveedor está sujeto a retención de ISR o IVA, debe indicarlo explícitamente en el CFDI.',
    'IMR realizará las retenciones legales aplicables conforme a la legislación fiscal vigente.',
  ]);

  sectionTitle(doc, '8. Confidencialidad');
  body(doc, 'Toda la información intercambiada a través del portal tiene carácter confidencial. Queda prohibida la divulgación, copia o distribución de los documentos a terceros no autorizados. El incumplimiento de esta política podrá resultar en la suspensión del acceso al portal.');

  footer(doc);
  doc.end();
  out.on('finish', () => console.log('✅  politicas-facturacion.pdf generado'));
}

// ─── 3. Guía: Subir Orden de Compra ──────────────────────────────────────────
function generateGuiaOC() {
  const doc = createDoc();
  const out = fs.createWriteStream(path.join(OUT_DIR, 'guia-ordenes-de-compra.pdf'));
  doc.pipe(out);

  header(doc, 'Guía Rápida: Órdenes de Compra', 'Cómo consultar y gestionar tus órdenes de compra en el portal');

  sectionTitle(doc, '¿Qué es una Orden de Compra?');
  body(doc, 'Una Orden de Compra (OC) es el documento oficial emitido por IMR que autoriza la adquisición de bienes o servicios a un proveedor. Cada OC tiene un folio único, un monto acordado y está asociada a una subsidiaria específica de IMR.');

  sectionTitle(doc, 'Cómo consultar tus Órdenes de Compra');
  numberedList(doc, [
    'Inicia sesión en el portal con tus credenciales.',
    'En el menú lateral, haz clic en "Órdenes de Compra".',
    'Verás la lista de órdenes asignadas a tu cuenta.',
    'Puedes identificar cada orden por su folio, fecha, monto y subsidiaria.',
  ]);

  sectionTitle(doc, 'Información de cada Orden');
  body(doc, 'Para cada orden de compra podrás ver los siguientes datos:');
  bullet(doc, [
    'Folio — número único de la orden.',
    'Fecha de emisión.',
    'Subtotal, IVA y total.',
    'Subsidiaria emisora (empresa de IMR que genera la OC).',
    'Facturas asociadas a esa orden.',
  ]);

  sectionTitle(doc, 'Relación OC → Factura');
  body(doc, 'Para facturar contra una orden de compra, sigue estos pasos:');
  numberedList(doc, [
    'Identifica la OC que deseas facturar en la lista.',
    'Anota el folio y el RFC de la subsidiaria emisora — estos datos deben aparecer en tu factura.',
    'Emite el CFDI con los datos de la subsidiaria como receptor.',
    'Ve a la sección "Facturas" y sube tu CFDI indicando la OC relacionada.',
  ]);
  note(doc, 'Una Orden de Compra puede tener múltiples facturas parciales siempre que no excedan el monto total autorizado.');

  sectionTitle(doc, 'Preguntas Frecuentes');
  body(doc, '¿Por qué no veo mis órdenes de compra?');
  body(doc, 'Las órdenes se sincronizan automáticamente desde el sistema de IMR. Si no ves una OC esperada, puede estar en proceso de sincronización. Contacta a soporte usando la opción "Solicitar Ayuda" si el problema persiste.');
  doc.moveDown(0.3);
  body(doc, '¿Puedo facturar contra una OC ya cerrada?');
  body(doc, 'No. Las órdenes cerradas o vencidas no aceptan nuevas facturas. Contacta a tu administrador en IMR para gestionar una extensión si aplica.');

  footer(doc);
  doc.end();
  out.on('finish', () => console.log('✅  guia-ordenes-de-compra.pdf generado'));
}

// ─── 4. Guía: Consultar Estado de Factura ────────────────────────────────────
function generateGuiaFactura() {
  const doc = createDoc();
  const out = fs.createWriteStream(path.join(OUT_DIR, 'guia-facturas.pdf'));
  doc.pipe(out);

  header(doc, 'Guía Rápida: Facturas', 'Cómo subir y consultar el estado de tus facturas');

  sectionTitle(doc, 'Cómo subir una Factura');
  numberedList(doc, [
    'Ve a "Facturas" en el menú lateral.',
    'Haz clic en el botón "Subir Factura" (esquina superior derecha).',
    'Selecciona la Orden de Compra relacionada del listado.',
    'Adjunta el archivo XML de la factura (obligatorio).',
    'Adjunta el archivo PDF de la factura (recomendado).',
    'Verifica que el folio, fecha y monto mostrados sean correctos.',
    'Haz clic en "Enviar Factura" para completar el proceso.',
  ]);
  note(doc, 'El XML debe ser un CFDI válido con sello del SAT. No se aceptan XMLs cancelados o con errores de validación.');

  sectionTitle(doc, 'Estados de una Factura');
  body(doc, 'Cada factura puede encontrarse en uno de los siguientes estados:');
  bullet(doc, [
    'Pendiente — la factura fue recibida y está en revisión por IMR.',
    'Aprobada — la factura fue validada y sincronizada con el sistema financiero de IMR.',
    'Fallida — ocurrió un error al sincronizar con el sistema. Se muestra el detalle del error.',
  ]);

  sectionTitle(doc, 'Cómo consultar el estado');
  numberedList(doc, [
    'Ve a la sección "Facturas" en el menú lateral.',
    'Localiza la factura por folio o fecha.',
    'La columna "Estado" muestra la situación actual.',
    'Si el estado es "Fallida", el ícono de detalle muestra el motivo del error.',
  ]);

  sectionTitle(doc, 'Mi factura fue rechazada, ¿qué hago?');
  numberedList(doc, [
    'Lee el motivo de rechazo indicado por el administrador.',
    'Cancela el CFDI original ante el SAT si es necesario.',
    'Emite un nuevo CFDI corrigiendo el error indicado.',
    'Sube nuevamente la factura desde el portal.',
  ]);
  note(doc, 'No vuelvas a subir el mismo XML rechazado. Debes emitir un CFDI nuevo con UUID diferente.');

  sectionTitle(doc, 'Límites y restricciones');
  bullet(doc, [
    'Solo se permiten archivos XML y PDF.',
    'El tamaño máximo por archivo es de 10 MB.',
    'El folio fiscal (UUID) no puede repetirse en el sistema.',
    'Solo se pueden subir facturas contra OCs asignadas a tu cuenta.',
  ]);

  footer(doc);
  doc.end();
  out.on('finish', () => console.log('✅  guia-facturas.pdf generado'));
}

// ─── 5. Guía: Complemento de Pago ────────────────────────────────────────────
function generateGuiaComplemento() {
  const doc = createDoc();
  const out = fs.createWriteStream(path.join(OUT_DIR, 'guia-complemento-pago.pdf'));
  doc.pipe(out);

  header(doc, 'Guía Rápida: Complemento de Pago', 'Cómo registrar y gestionar tus complementos de pago');

  sectionTitle(doc, '¿Qué es un Complemento de Pago?');
  body(doc, 'El Complemento de Pago (también llamado REP — Recibo Electrónico de Pago) es un CFDI que el proveedor emite para amparar el pago recibido de una factura que fue cobrada de forma diferida. Es un requisito del SAT cuando el pago no se realiza en la misma fecha de la factura.');

  sectionTitle(doc, '¿Cuándo debo subirlo?');
  bullet(doc, [
    'Cuando IMR haya realizado el pago de una factura aprobada.',
    'Cuando el pago se realizó en fecha posterior a la emisión de la factura.',
    'Cuando el pago fue parcial (en abonos) — se requiere un complemento por cada parcialidad.',
  ]);
  note(doc, 'El complemento de pago debe emitirse a más tardar el día 10 del mes siguiente al mes en que se recibió el pago.');

  sectionTitle(doc, 'Cómo subir un Complemento de Pago');
  numberedList(doc, [
    'Ve a "Complemento de Pagos" en el menú lateral.',
    'Haz clic en "Subir Complemento".',
    'Selecciona la factura aprobada a la que corresponde el pago.',
    'Adjunta el XML del complemento de pago (obligatorio).',
    'Adjunta el PDF del complemento (recomendado).',
    'Verifica el folio, fecha de pago y monto.',
    'Haz clic en "Enviar" — el complemento quedará en revisión.',
  ]);

  sectionTitle(doc, 'Estados del Complemento');
  bullet(doc, [
    'Pendiente — recibido por IMR, en espera de revisión.',
    'Aprobado — validado y registrado en el sistema financiero. Se genera el pago en NetSuite.',
    'Rechazado — el complemento tiene observaciones. Revisa el motivo y reenvía.',
    'Error de sincronización — ocurrió un problema técnico. El administrador puede reintentar la sincronización.',
  ]);

  sectionTitle(doc, 'Mi complemento fue rechazado');
  numberedList(doc, [
    'Consulta el motivo de rechazo en el detalle del complemento.',
    'Cancela el CFDI ante el SAT si el error es en los datos del comprobante.',
    'Emite un nuevo complemento con los datos corregidos.',
    'Súbelo nuevamente desde el portal.',
  ]);
  note(doc, 'Asegúrate de que el UUID del complemento coincida con el folio fiscal de la factura original en el campo "DoctoRelacionado" del XML.');

  sectionTitle(doc, 'Reintento de sincronización');
  body(doc, 'Si el complemento muestra estado "Error de sincronización", el administrador de IMR puede reintentar el envío a NetSuite. No es necesario que el proveedor realice ninguna acción adicional en ese caso. Sin embargo, puedes usar la opción "Solicitar Ayuda" para notificar al equipo de soporte.');

  footer(doc);
  doc.end();
  out.on('finish', () => console.log('✅  guia-complemento-pago.pdf generado'));
}

// ─── Ejecutar ─────────────────────────────────────────────────────────────────
generateManual();
generatePoliticas();
generateGuiaOC();
generateGuiaFactura();
generateGuiaComplemento();

console.log('\n📄 Generando PDFs en public/docs/ ...');
