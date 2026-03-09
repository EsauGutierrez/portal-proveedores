import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

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

        let results: any[] = [];

        // Facturas
        if (!docType || docType === 'ALL' || docType === 'INVOICE') {
            const invoices = await prisma.invoice.findMany({
                where: baseWhere,
                include: {
                    user: { select: { name: true, supplierProfile: { select: { companyName: true, rfc: true } } } },
                    reception: { include: { purchaseOrder: { include: { subsidiary: { select: { name: true } } } } } }
                },
                orderBy: { fecha: 'desc' }
            });

            invoices.forEach(inv => {
                results.push({
                    id: inv.id,
                    tipo: 'Factura',
                    folio: inv.folio,
                    fecha: inv.fecha.toISOString(),
                    proveedor: inv.user?.supplierProfile?.companyName || inv.user?.name || 'Desconocido',
                    rfc: inv.user?.supplierProfile?.rfc || 'N/A',
                    subsidiaria: inv.reception?.purchaseOrder?.subsidiary?.name || 'N/A',
                    total: Number(inv.total),
                    pdfUrl: inv.pdfUrl,
                    xmlUrl: inv.xmlUrl,
                    estadoCentral: inv.syncStatus
                });
            });
        }

        // Complementos de Pago
        if (!docType || docType === 'ALL' || docType === 'PAYMENT') {
            const payments = await prisma.paymentComplement.findMany({
                where: baseWhere,
                include: {
                    user: { select: { name: true, supplierProfile: { select: { companyName: true, rfc: true } } } },
                },
                orderBy: { fecha: 'desc' }
            });
            payments.forEach(pay => {
                results.push({
                    id: pay.id,
                    tipo: 'Complemento de Pago',
                    folio: pay.folio,
                    fecha: pay.fecha.toISOString(),
                    proveedor: pay.user?.supplierProfile?.companyName || pay.user?.name || 'Desconocido',
                    rfc: pay.user?.supplierProfile?.rfc || 'N/A',
                    subsidiaria: 'N/A',
                    total: Number(pay.total),
                    pdfUrl: pay.pdfUrl,
                    xmlUrl: pay.xmlUrl,
                    estadoCentral: 'SYNCED'
                });
            });
        }

        results.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

        // Agregamos también la lista de proveedores para llenar el desplegable del filtro en el frontend
        const filterSuppliersWhere: any = {};
        if (role !== 'SUPERADMIN') filterSuppliersWhere.tenantId = tenantId;

        // Solo devolvemos los proveedores que pertenecen al Tenant
        const suppliers = await prisma.user.findMany({
            where: {
                role: 'SUPPLIER',
                ...filterSuppliersWhere
            },
            select: {
                id: true,
                supplierProfile: { select: { companyName: true, rfc: true } }
            }
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
