import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import AdmZip from 'adm-zip';
import { getPresignedUrl } from '../../../../lib/s3';

const prisma = new PrismaClient();

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
        }
        const token = authHeader.split(' ')[1];

        let decodedToken: any;
        try {
            decodedToken = jwt.verify(token, process.env.JWT_SECRET!);
        } catch (error) {
            return NextResponse.json({ message: 'Token inválido' }, { status: 401 });
        }

        const { role, tenantId } = decodedToken;
        if (role !== 'TENANT_ADMIN' && role !== 'ADMIN' && role !== 'SUPERADMIN') {
            return NextResponse.json({ message: 'Acceso denegado' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const supplierId = searchParams.get('supplierId');
        const docType = searchParams.get('docType'); // 'INVOICE' | 'PAYMENT' | 'ALL'

        let dateFilter: any = undefined;
        if (startDate || endDate) {
            dateFilter = {};
            if (startDate) dateFilter.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                dateFilter.lte = end;
            }
        }

        const baseWhere: any = {};
        if (role !== 'SUPERADMIN') {
            baseWhere.tenantId = tenantId;
        }

        if (supplierId) {
            baseWhere.userId = supplierId;
        }
        if (dateFilter) {
            baseWhere.fecha = dateFilter;
        }

        let documentsToDownload = [];

        // Facturas
        if (!docType || docType === 'ALL' || docType === 'INVOICE') {
            const invoices = await prisma.invoice.findMany({
                where: baseWhere,
                include: {
                    user: { select: { name: true, supplierProfile: { select: { companyName: true, rfc: true } } } }
                }
            });

            invoices.forEach(inv => {
                const supplierName = inv.user?.supplierProfile?.companyName || inv.user?.name || 'Desconocido';
                if (inv.pdfUrl) documentsToDownload.push({ name: `${supplierName}/Factura_${inv.folio}.pdf`, urlKey: inv.pdfUrl });
                if (inv.xmlUrl) documentsToDownload.push({ name: `${supplierName}/Factura_${inv.folio}.xml`, urlKey: inv.xmlUrl });
            });
        }

        // Complementos de Pago
        if (!docType || docType === 'ALL' || docType === 'PAYMENT') {
            const payments = await prisma.paymentComplement.findMany({
                where: baseWhere,
                include: {
                    user: { select: { name: true, supplierProfile: { select: { companyName: true, rfc: true } } } },
                }
            });

            payments.forEach(pay => {
                const supplierName = pay.user?.supplierProfile?.companyName || pay.user?.name || 'Desconocido';
                if (pay.pdfUrl) documentsToDownload.push({ name: `${supplierName}/Pago_${pay.folio}.pdf`, urlKey: pay.pdfUrl });
                if (pay.xmlUrl) documentsToDownload.push({ name: `${supplierName}/Pago_${pay.folio}.xml`, urlKey: pay.xmlUrl });
            });
        }

        if (documentsToDownload.length === 0) {
            return NextResponse.json({ message: 'No hay documentos para descargar' }, { status: 404 });
        }

        const zip = new AdmZip();

        // Download and add to ZIP
        for (const doc of documentsToDownload) {
            try {
                const downloadUrl = await getPresignedUrl(doc.urlKey);
                if (!downloadUrl) continue;

                const response = await fetch(downloadUrl);
                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    zip.addFile(doc.name, Buffer.from(arrayBuffer));
                }
            } catch (err) {
                console.error(`Error procesando archivo ${doc.name}:`, err);
            }
        }

        const zipBuffer = zip.toBuffer();

        return new NextResponse(zipBuffer as unknown as BodyInit, {
            status: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': 'attachment; filename="documentos_exportados.zip"'
            }
        });

    } catch (error) {
        console.error('Error exportando ZIP:', error);
        return NextResponse.json({ message: 'Error al generar el ZIP', error: (error as Error).message }, { status: 500 });
    }
}
