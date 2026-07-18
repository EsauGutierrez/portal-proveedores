// app/api/admin/sync/suppliers/route.ts
// Sincronización MANUAL de proveedores desde NetSuite — solo TENANT_ADMIN/ADMIN.

import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import jwt from 'jsonwebtoken';
import { syncSuppliersForTenant } from '../../../../lib/syncSuppliersForTenant';

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
        }

        let decoded: any;
        try {
            decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET!);
        } catch {
            return NextResponse.json({ message: 'Token inválido o expirado' }, { status: 401 });
        }

        if (decoded.role !== 'TENANT_ADMIN' && decoded.role !== 'ADMIN') {
            return NextResponse.json({ message: 'No tienes permisos para ejecutar esta acción' }, { status: 403 });
        }

        const tenant = await prisma.tenant.findUnique({
            where: { id: decoded.tenantId },
            include: { subsidiaries: { where: { isActive: true } } },
        });

        if (!tenant) {
            return NextResponse.json({ message: 'Empresa no encontrada' }, { status: 404 });
        }
        if (!tenant.netsuiteAccountId || !tenant.netsuiteConsumerKey || !tenant.netsuiteConsumerSec || !tenant.netsuiteTokenId || !tenant.netsuiteTokenSecret) {
            return NextResponse.json({ message: 'Credenciales de NetSuite incompletas.' }, { status: 400 });
        }
        if (tenant.subsidiaries.length === 0) {
            return NextResponse.json({ message: 'No hay subsidiarias activas en esta empresa.' }, { status: 400 });
        }

        const result = await syncSuppliersForTenant(decoded.tenantId, tenant as any);

        return NextResponse.json({
            message: result.status === 'SUCCESS'
                ? `Sincronización completada: ${result.createdCount} nuevos, ${result.updatedCount} actualizados, ${result.skippedCount} omitidos (RFC inválido)` +
                  (result.conflictCount > 0 ? `, ${result.conflictCount} en conflicto con otra empresa.` : '.')
                : `Error: ${result.error}`,
            totalFound: result.totalFound,
            createdCount: result.createdCount,
            updatedCount: result.updatedCount,
            skippedCount: result.skippedCount,
            conflictCount: result.conflictCount,
        }, { status: result.status === 'SUCCESS' ? 200 : 500 });

    } catch (error: any) {
        console.error('[SYNC SUPPLIERS MANUAL]', error);
        return NextResponse.json({
            message: `Error durante la sincronización: ${error.message}`,
            error: error.message,
        }, { status: 500 });
    }
}
