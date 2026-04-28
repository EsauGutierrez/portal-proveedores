import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { getPresignedUrl } from '../../../lib/s3';

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

        // Determinar modo de búsqueda
        const isPurchaseOrderMode = docType === 'PURCHASE_ORDER';

        const adminPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const adminLimit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '200', 10)));

        let results: any[] = [];

        if (isPurchaseOrderMode) {
            // ===== ÓRDENES DE COMPRA =====
            const poWhere: any = {};
            if (role !== 'SUPERADMIN') poWhere.tenantId = tenantId;
            if (supplierId) poWhere.userId = supplierId;
            if (dateFilter) poWhere.fecha = dateFilter;

            const purchaseOrders = await prisma.purchaseOrder.findMany({
                where: poWhere,
                include: {
                    user: {
                        select: {
                            name: true,
                            supplierProfile: { select: { companyName: true, rfc: true } }
                        }
                    },
                    subsidiary: { select: { name: true } }
                },
                orderBy: { fecha: 'desc' },
                take: adminLimit,
                skip: (adminPage - 1) * adminLimit,
            });

            purchaseOrders.forEach(po => {
                results.push({
                    id: po.id,
                    tipo: 'Orden de Compra',
                    folio: po.folio,
                    fecha: po.fecha.toISOString(),
                    proveedor: po.user?.supplierProfile?.companyName || po.user?.name || 'Desconocido',
                    rfc: po.user?.supplierProfile?.rfc || 'N/A',
                    subsidiaria: po.subsidiary?.name || 'N/A',
                    total: Number(po.total),
                    pdfUrl: null,
                    xmlUrl: null,
                    estadoCentral: 'SYNCED'
                });
            });

        } else {
            // ===== FACTURAS =====
            if (!docType || docType === 'ALL' || docType === 'INVOICE') {
                const invoices = await prisma.invoice.findMany({
                    where: baseWhere,
                    include: {
                        user: { select: { name: true, supplierProfile: { select: { companyName: true, rfc: true } } } },
                        receptions: { include: { purchaseOrder: { include: { subsidiary: { select: { name: true } } } } } },
                        purchaseOrder: { include: { subsidiary: { select: { name: true } } } }
                    },
                    orderBy: { fecha: 'desc' },
                    take: adminLimit,
                    skip: (adminPage - 1) * adminLimit,
                });

                await Promise.all(invoices.map(async (inv: any) => {
                    let subName = 'N/A';
                    if (inv.receptions && inv.receptions.length > 0) {
                        subName = inv.receptions[0].purchaseOrder?.subsidiary?.name || 'N/A';
                    } else if (inv.purchaseOrder) {
                        subName = inv.purchaseOrder.subsidiary?.name || 'N/A';
                    }

                    const [pdfUrl, xmlUrl] = await Promise.all([
                        inv.pdfUrl ? getPresignedUrl(inv.pdfUrl) : null,
                        inv.xmlUrl ? getPresignedUrl(inv.xmlUrl) : null,
                    ]);

                    results.push({
                        id: inv.id,
                        tipo: 'Factura',
                        folio: inv.folio,
                        fecha: inv.fecha.toISOString(),
                        proveedor: inv.user?.supplierProfile?.companyName || inv.user?.name || 'Desconocido',
                        rfc: inv.user?.supplierProfile?.rfc || 'N/A',
                        subsidiaria: subName,
                        total: Number(inv.total),
                        pdfUrl,
                        xmlUrl,
                        estadoCentral: inv.syncStatus
                    });
                }));
            }

            // ===== COMPLEMENTOS DE PAGO =====
            if (!docType || docType === 'ALL' || docType === 'PAYMENT') {
                const payments = await prisma.paymentComplement.findMany({
                    where: baseWhere,
                    include: {
                        user: { select: { name: true, supplierProfile: { select: { companyName: true, rfc: true } } } },
                    },
                    orderBy: { fecha: 'desc' },
                    take: adminLimit,
                    skip: (adminPage - 1) * adminLimit,
                });
                await Promise.all(payments.map(async (pay) => {
                    const [pdfUrl, xmlUrl] = await Promise.all([
                        pay.pdfUrl ? getPresignedUrl(pay.pdfUrl) : null,
                        pay.xmlUrl ? getPresignedUrl(pay.xmlUrl) : null,
                    ]);

                    results.push({
                        id: pay.id,
                        tipo: 'Complemento de Pago',
                        folio: pay.folio,
                        fecha: pay.fecha.toISOString(),
                        proveedor: pay.user?.supplierProfile?.companyName || pay.user?.name || 'Desconocido',
                        rfc: pay.user?.supplierProfile?.rfc || 'N/A',
                        subsidiaria: 'N/A',
                        total: Number(pay.total),
                        pdfUrl,
                        xmlUrl,
                        approvalStatus: pay.status,
                        estadoCentral: pay.status === 'REJECTED'
                            ? 'REJECTED'
                            : pay.netsuiteSyncStatus,
                        netsuitePaymentId: pay.netsuitePaymentId,
                        netsuiteSyncError: pay.netsuiteSyncError,
                    });
                }));
            }
        }

        results.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

        // Lista de proveedores para el filtro del frontend
        const filterSuppliersWhere: any = {};
        if (role !== 'SUPERADMIN') filterSuppliersWhere.tenantId = tenantId;

        const suppliers = await prisma.user.findMany({
            where: { role: 'SUPPLIER', ...filterSuppliersWhere },
            select: { id: true, supplierProfile: { select: { companyName: true, rfc: true } } }
        });

        const formattedSuppliers = suppliers
            .filter(s => s.supplierProfile)
            .map(s => ({ id: s.id, name: s.supplierProfile?.companyName, rfc: s.supplierProfile?.rfc }));

        return NextResponse.json({ documents: results, suppliers: formattedSuppliers }, { status: 200 });


    } catch (error) {
        console.error('Error fetching admin documents:', error);
        return NextResponse.json({ message: 'Error interno localizando facturas', error: (error as Error).message }, { status: 500 });
    }
}
