import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import jwt from 'jsonwebtoken';
import { getPresignedUrl } from '../../../lib/s3';

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
        } catch {
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
        const docType = searchParams.get('docType') || 'ALL';
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
        const offset = (page - 1) * limit;

        // Date filter objects
        let startDateObj: Date | undefined;
        let endDateObj: Date | undefined;
        if (startDate) startDateObj = new Date(startDate);
        if (endDate) {
            endDateObj = new Date(endDate);
            endDateObj.setHours(23, 59, 59, 999);
        }

        // Prisma where object for single-table queries
        const baseWhere: any = {};
        if (role !== 'SUPERADMIN') baseWhere.tenantId = tenantId;
        if (supplierId) baseWhere.userId = supplierId;
        if (startDateObj || endDateObj) {
            baseWhere.fecha = {
                ...(startDateObj ? { gte: startDateObj } : {}),
                ...(endDateObj ? { lte: endDateObj } : {}),
            };
        }

        let results: any[] = [];
        let total = 0;

        if (docType === 'PURCHASE_ORDER') {
            // === PURCHASE ORDERS ===
            const poWhere: any = {};
            if (role !== 'SUPERADMIN') poWhere.tenantId = tenantId;
            if (supplierId) poWhere.userId = supplierId;
            if (baseWhere.fecha) poWhere.fecha = baseWhere.fecha;

            const [purchaseOrders, poCount] = await Promise.all([
                prisma.purchaseOrder.findMany({
                    where: poWhere,
                    include: {
                        user: {
                            select: {
                                name: true,
                                supplierProfile: { select: { companyName: true, rfc: true } },
                            },
                        },
                        subsidiary: { select: { name: true } },
                    },
                    orderBy: { fecha: 'desc' },
                    take: limit,
                    skip: offset,
                }),
                prisma.purchaseOrder.count({ where: poWhere }),
            ]);

            total = poCount;
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
                    estadoCentral: 'SYNCED',
                });
            });

        } else if (docType === 'INVOICE') {
            // === INVOICES ONLY ===
            const [invoices, invCount] = await Promise.all([
                prisma.invoice.findMany({
                    where: baseWhere,
                    include: {
                        user: { select: { name: true, supplierProfile: { select: { companyName: true, rfc: true } } } },
                        receptions: { include: { purchaseOrder: { include: { subsidiary: { select: { name: true } } } } } },
                        purchaseOrder: { include: { subsidiary: { select: { name: true } } } },
                    },
                    orderBy: { fecha: 'desc' },
                    take: limit,
                    skip: offset,
                }),
                prisma.invoice.count({ where: baseWhere }),
            ]);

            total = invCount;
            await Promise.all(invoices.map(async (inv: any) => {
                let subName = 'N/A';
                if (inv.receptions?.length > 0) {
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
                    estadoCentral: inv.syncStatus,
                    paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
                });
            }));

        } else if (docType === 'PAYMENT') {
            // === PAYMENT COMPLEMENTS ONLY ===
            const [payments, payCount] = await Promise.all([
                prisma.paymentComplement.findMany({
                    where: baseWhere,
                    include: {
                        user: { select: { name: true, supplierProfile: { select: { companyName: true, rfc: true } } } },
                    },
                    orderBy: { fecha: 'desc' },
                    take: limit,
                    skip: offset,
                }),
                prisma.paymentComplement.count({ where: baseWhere }),
            ]);

            total = payCount;
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
                    estadoCentral: pay.status === 'REJECTED' ? 'REJECTED' : pay.netsuiteSyncStatus,
                    netsuitePaymentId: pay.netsuitePaymentId,
                    netsuiteSyncError: pay.netsuiteSyncError,
                });
            }));

        } else {
            // === ALL MODE: true UNION pagination via $queryRaw ===
            // Build WHERE fragments for each table
            const invConds: Prisma.Sql[] = [];
            if (role !== 'SUPERADMIN') invConds.push(Prisma.sql`i."tenantId" = ${tenantId}`);
            if (supplierId) invConds.push(Prisma.sql`i."userId" = ${supplierId}`);
            if (startDateObj) invConds.push(Prisma.sql`i.fecha >= ${startDateObj}`);
            if (endDateObj) invConds.push(Prisma.sql`i.fecha <= ${endDateObj}`);
            const invWhere = invConds.length > 0
                ? Prisma.sql`WHERE ${Prisma.join(invConds, ' AND ')}`
                : Prisma.sql``;

            const payConds: Prisma.Sql[] = [];
            if (role !== 'SUPERADMIN') payConds.push(Prisma.sql`p."tenantId" = ${tenantId}`);
            if (supplierId) payConds.push(Prisma.sql`p."userId" = ${supplierId}`);
            if (startDateObj) payConds.push(Prisma.sql`p.fecha >= ${startDateObj}`);
            if (endDateObj) payConds.push(Prisma.sql`p.fecha <= ${endDateObj}`);
            const payWhere = payConds.length > 0
                ? Prisma.sql`WHERE ${Prisma.join(payConds, ' AND ')}`
                : Prisma.sql``;

            const limitSql = BigInt(limit);
            const offsetSql = BigInt(offset);

            type RawRow = {
                id: string;
                tipo: string;
                folio: string;
                fecha: Date;
                total: number;
                pdfUrl: string | null;
                xmlUrl: string | null;
                estadoCentral: string;
                proveedor: string;
                rfc: string;
                paidAt: Date | null;
            };

            // Run COUNT and DATA queries in parallel
            const [countRows, rows] = await Promise.all([
                prisma.$queryRaw<[{ total: bigint }]>`
                    SELECT COUNT(*) AS total FROM (
                        SELECT i.id FROM "Invoice" i ${invWhere}
                        UNION ALL
                        SELECT p.id FROM "PaymentComplement" p ${payWhere}
                    ) combined
                `,
                prisma.$queryRaw<RawRow[]>`
                    SELECT * FROM (
                        SELECT
                            i.id,
                            'Factura'::text AS tipo,
                            i.folio,
                            i.fecha,
                            CAST(i.total AS FLOAT8) AS total,
                            i."pdfUrl",
                            i."xmlUrl",
                            i."syncStatus"::text AS "estadoCentral",
                            COALESCE(sp."companyName", u.name, 'Desconocido') AS proveedor,
                            COALESCE(sp.rfc, 'N/A') AS rfc,
                            i."paidAt"
                        FROM "Invoice" i
                        JOIN "User" u ON i."userId" = u.id
                        LEFT JOIN "SupplierProfile" sp ON sp."userId" = i."userId"
                        ${invWhere}

                        UNION ALL

                        SELECT
                            p.id,
                            'Complemento de Pago'::text AS tipo,
                            p.folio,
                            p.fecha,
                            CAST(p.total AS FLOAT8) AS total,
                            p."pdfUrl",
                            p."xmlUrl",
                            CASE WHEN p.status::text = 'REJECTED' THEN 'REJECTED'
                                 ELSE p."netsuiteSyncStatus"::text END AS "estadoCentral",
                            COALESCE(sp."companyName", u.name, 'Desconocido') AS proveedor,
                            COALESCE(sp.rfc, 'N/A') AS rfc,
                            CAST(NULL AS TIMESTAMP) AS "paidAt"
                        FROM "PaymentComplement" p
                        JOIN "User" u ON p."userId" = u.id
                        LEFT JOIN "SupplierProfile" sp ON sp."userId" = p."userId"
                        ${payWhere}
                    ) combined
                    ORDER BY fecha DESC
                    LIMIT ${limitSql} OFFSET ${offsetSql}
                `,
            ]);

            total = Number(countRows[0]?.total ?? 0);

            await Promise.all(rows.map(async (row) => {
                const [pdfUrl, xmlUrl] = await Promise.all([
                    row.pdfUrl ? getPresignedUrl(row.pdfUrl) : null,
                    row.xmlUrl ? getPresignedUrl(row.xmlUrl) : null,
                ]);

                results.push({
                    id: row.id,
                    tipo: row.tipo,
                    folio: row.folio,
                    fecha: row.fecha instanceof Date ? row.fecha.toISOString() : row.fecha,
                    proveedor: row.proveedor,
                    rfc: row.rfc,
                    subsidiaria: 'N/A',
                    total: Number(row.total),
                    pdfUrl,
                    xmlUrl,
                    estadoCentral: row.estadoCentral,
                    paidAt: row.paidAt ? (row.paidAt instanceof Date ? row.paidAt.toISOString() : row.paidAt) : null,
                });
            }));
        }

        // Suppliers list for the filter dropdown (only fetch once — frontend caches it)
        const filterSuppliersWhere: any = { role: 'SUPPLIER' };
        if (role !== 'SUPERADMIN') filterSuppliersWhere.tenantId = tenantId;

        const suppliers = await prisma.user.findMany({
            where: filterSuppliersWhere,
            select: { id: true, supplierProfile: { select: { companyName: true, rfc: true } } },
        });

        const formattedSuppliers = suppliers
            .filter(s => s.supplierProfile)
            .map(s => ({ id: s.id, name: s.supplierProfile?.companyName, rfc: s.supplierProfile?.rfc }));

        return NextResponse.json({
            documents: results,
            total,
            page,
            limit,
            suppliers: formattedSuppliers,
        }, { status: 200 });

    } catch (error) {
        console.error('Error fetching admin documents:', error);
        return NextResponse.json({ message: 'Error interno localizando facturas', error: (error as Error).message }, { status: 500 });
    }
}
