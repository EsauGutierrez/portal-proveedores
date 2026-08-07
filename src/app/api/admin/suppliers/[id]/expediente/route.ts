// GET /api/admin/suppliers/[id]/expediente
// Genera un ZIP con el "Expediente de Materialidad" de un proveedor: documentos
// aprobados, facturas (CFDI + PDF), complementos de pago y una hoja de resumen con
// su estatus de Lista 69B y su historial de aprobación — para apoyar auditorías de
// materialidad (Art. 69-B CFF) sin salir del portal.

import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import jwt from 'jsonwebtoken';
import AdmZip from 'adm-zip';
import { getPresignedUrl } from '../../../../../lib/s3';

const LISTA69B_LABELS: Record<string, string> = {
  NOT_CHECKED: 'Sin verificar',
  NO_LISTADO: 'No listado (sin observaciones)',
  PRESUNTO: 'Presunto (EFOS) — ALERTA',
  DEFINITIVO: 'Definitivo (SAT) — ALERTA',
  DESVIRTUADO: 'Desvirtuado',
  SENTENCIA_FAVORABLE: 'Sentencia favorable',
};

function sanitizeName(name: string): string {
  return (name || 'archivo').replace(/[\\/:*?"<>|]/g, '_').trim();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
    }
    let decoded: any;
    try {
      decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET!);
    } catch {
      return NextResponse.json({ message: 'Token inválido o expirado.' }, { status: 401 });
    }
    if (!['ADMIN', 'TENANT_ADMIN', 'SUPERADMIN'].includes(decoded.role)) {
      return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
    }

    const { id } = await params;

    const supplier = await prisma.supplierProfile.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true } },
        subsidiary: { select: { name: true, rfc: true, businessName: true } },
        documents: { where: { status: 'APPROVED' } },
      },
    });

    if (!supplier) {
      return NextResponse.json({ message: 'Proveedor no encontrado.' }, { status: 404 });
    }
    // Aislamiento por tenant: un TENANT_ADMIN solo exporta proveedores de su propio tenant.
    if (decoded.role !== 'SUPERADMIN' && supplier.tenantId !== decoded.tenantId) {
      return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
    }

    const [invoices, complements] = await Promise.all([
      prisma.invoice.findMany({
        where: { userId: supplier.userId },
        orderBy: { fecha: 'asc' },
        select: { folio: true, fecha: true, total: true, syncStatus: true, pdfUrl: true, xmlUrl: true },
      }),
      prisma.paymentComplement.findMany({
        where: { userId: supplier.userId },
        orderBy: { fecha: 'asc' },
        select: { folio: true, fecha: true, total: true, netsuiteSyncStatus: true, pdfUrl: true, xmlUrl: true },
      }),
    ]);

    const zip = new AdmZip();
    const companyFolder = sanitizeName(supplier.companyName);

    // ── Hoja de resumen (evidencia de cumplimiento para el auditor) ───────────
    const now = new Date();
    const fmt = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : 'N/A');
    const summaryLines = [
      'EXPEDIENTE DE MATERIALIDAD',
      '='.repeat(60),
      `Generado: ${now.toISOString().slice(0, 19).replace('T', ' ')}`,
      '',
      'DATOS DEL PROVEEDOR',
      '-'.repeat(60),
      `Razón social:      ${supplier.companyName}`,
      `RFC:                ${supplier.rfc}`,
      `Dirección fiscal:   ${supplier.taxAddress}`,
      `Contacto:           ${supplier.user?.name || 'N/A'} <${supplier.user?.email || 'N/A'}>`,
      `Subsidiaria:        ${supplier.subsidiary?.name || 'N/A'} (${supplier.subsidiary?.businessName || ''})`,
      `Tipo de proveedor:  ${supplier.supplierType}`,
      `Estatus en portal:  ${supplier.status}`,
      `Alta en el portal:  ${fmt(supplier.createdAt)}`,
      '',
      'CUMPLIMIENTO FISCAL',
      '-'.repeat(60),
      `Lista 69B (SAT):    ${LISTA69B_LABELS[supplier.lista69bStatus] || supplier.lista69bStatus}`,
      `Última verificación: ${fmt(supplier.lista69bCheckedAt)}`,
      '',
      `DOCUMENTOS APROBADOS INCLUIDOS (${supplier.documents.length})`,
      '-'.repeat(60),
      ...(supplier.documents.length
        ? supplier.documents.map(d => `  • ${d.documentType} — ${d.fileName} (aprobado: ${fmt(d.approvedAt)})`)
        : ['  (sin documentos aprobados)']),
      '',
      `FACTURAS INCLUIDAS (${invoices.length})`,
      '-'.repeat(60),
      ...(invoices.length
        ? invoices.map(i => `  • ${fmt(i.fecha)} | Folio ${i.folio} | $${Number(i.total).toFixed(2)} | Sync NetSuite: ${i.syncStatus}`)
        : ['  (sin facturas)']),
      '',
      `COMPLEMENTOS DE PAGO INCLUIDOS (${complements.length})`,
      '-'.repeat(60),
      ...(complements.length
        ? complements.map(c => `  • ${fmt(c.fecha)} | Folio ${c.folio} | $${Number(c.total).toFixed(2)} | Sync NetSuite: ${c.netsuiteSyncStatus}`)
        : ['  (sin complementos de pago)']),
      '',
      '='.repeat(60),
      'Este expediente se generó automáticamente desde el Portal de Proveedores',
      'como apoyo a auditorías de materialidad (Art. 69-B CFF). No sustituye la',
      'validación legal/fiscal de un asesor especializado.',
    ];
    zip.addFile(`${companyFolder}/Resumen_Expediente.txt`, Buffer.from(summaryLines.join('\n'), 'utf-8'));

    // ── Descarga y empaquetado de archivos (best-effort: un archivo roto no detiene el resto) ──
    const addFileToZip = async (s3Key: string | null | undefined, destPath: string) => {
      if (!s3Key) return;
      try {
        const url = await getPresignedUrl(s3Key);
        if (!url) return;
        const res = await fetch(url);
        if (!res.ok) return;
        zip.addFile(destPath, Buffer.from(await res.arrayBuffer()));
      } catch (err) {
        console.error(`[Expediente] Error descargando ${s3Key}:`, err);
      }
    };

    for (const doc of supplier.documents) {
      const ext = doc.fileName.includes('.') ? doc.fileName.split('.').pop() : 'pdf';
      await addFileToZip(doc.fileUrl, `${companyFolder}/Documentos/${sanitizeName(doc.documentType)}.${ext}`);
    }
    for (const inv of invoices) {
      await addFileToZip(inv.pdfUrl, `${companyFolder}/Facturas/Factura_${sanitizeName(inv.folio)}.pdf`);
      await addFileToZip(inv.xmlUrl, `${companyFolder}/Facturas/Factura_${sanitizeName(inv.folio)}.xml`);
    }
    for (const c of complements) {
      await addFileToZip(c.pdfUrl, `${companyFolder}/Complementos_Pago/Pago_${sanitizeName(c.folio)}.pdf`);
      await addFileToZip(c.xmlUrl, `${companyFolder}/Complementos_Pago/Pago_${sanitizeName(c.folio)}.xml`);
    }

    const zipBuffer = zip.toBuffer();
    const filename = `Expediente_Materialidad_${companyFolder}_${now.toISOString().slice(0, 10)}.zip`;

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error generando expediente de materialidad:', error);
    return NextResponse.json({ message: 'Error al generar el expediente.', error: (error as Error).message }, { status: 500 });
  }
}
