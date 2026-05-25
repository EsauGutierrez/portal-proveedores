// app/api/admin/sync/purchase-orders/route.ts
// Endpoint para SINCRONIZACIÓN MANUAL de OC desde el panel admin del tenant.
// Usa syncPurchaseOrdersForTenant (lógica centralizada con lookup por netsuiteId).

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { syncPurchaseOrdersForTenant } from '../../../../lib/syncPurchaseOrdersForTenant';

const prisma = new PrismaClient();

export async function POST(request: Request) {
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
            return NextResponse.json({ message: 'Token inválido o expirado' }, { status: 401 });
        }

        if (decodedToken.role !== 'TENANT_ADMIN' && decodedToken.role !== 'ADMIN') {
            return NextResponse.json({ message: 'No tienes permisos para ejecutar esta acción' }, { status: 403 });
        }

        const tenantId: string = decodedToken.tenantId;
        const triggeredBy: string = decodedToken.email || 'admin';

        if (!tenantId) {
            return NextResponse.json({ message: 'No se encontró el Tenant ID en el token' }, { status: 400 });
        }

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            include: { subsidiaries: true }
        });

        if (!tenant) {
            return NextResponse.json({ message: 'Empresa no encontrada' }, { status: 404 });
        }
        if (!tenant.netsuiteAccountId || !tenant.netsuiteConsumerKey || !tenant.netsuiteConsumerSec || !tenant.netsuiteTokenId || !tenant.netsuiteTokenSecret) {
            return NextResponse.json({ message: 'Credenciales de NetSuite incompletas.' }, { status: 400 });
        }

        const result = await syncPurchaseOrdersForTenant(tenantId, tenant, triggeredBy, 'MANUAL');

        return NextResponse.json({
            message: result.status === 'SUCCESS'
                ? 'Sincronización completada exitosamente.'
                : result.status === 'PARTIAL'
                    ? `Sincronización parcial: ${result.errorCount} OC con error, ${result.skippedCount} omitidas.`
                    : 'Sincronización fallida.',
            totalFound: result.totalFound,
            createdCount: result.createdCount,
            updatedCount: result.updatedCount,
            skippedCount: result.skippedCount,
            errorCount: result.errorCount,
            durationMs: result.durationMs,
            ...(result.errors.length > 0 ? { errors: result.errors } : {})
        }, { status: 200 });

    } catch (error: any) {
        console.error('[SYNC MANUAL] Error:', error);

        try {
            const authHeader = request.headers.get('Authorization');
            if (authHeader) {
                const dec: any = jwt.decode(authHeader.split(' ')[1]);
                if (dec?.tenantId) {
                    await prisma.syncLog.create({
                        data: {
                            type: 'MANUAL', status: 'FAILED',
                            errorMessage: error.message, tenantId: dec.tenantId,
                            triggeredBy: dec.email || 'admin'
                        }
                    });
                }
            }
        } catch { /* silencioso */ }

        return NextResponse.json({
            message: 'Error durante la sincronización con NetSuite.',
            error: error.message
        }, { status: 500 });
    }
}

// GET: Obtener el historial de sincronizaciones con paginación y filtros
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

        if (decodedToken.role !== 'TENANT_ADMIN' && decodedToken.role !== 'ADMIN') {
            return NextResponse.json({ message: 'No autorizado' }, { status: 403 });
        }

        const tenantId: string = decodedToken.tenantId;
        const { searchParams } = new URL(request.url);

        const page    = Math.max(1, parseInt(searchParams.get('page')  ?? '1'));
        const limit   = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20')));
        const type    = searchParams.get('type');    // SCHEDULED | MANUAL
        const status  = searchParams.get('status');  // SUCCESS | PARTIAL | FAILED

        const where: any = { tenantId };
        if (type   && ['SCHEDULED', 'MANUAL'].includes(type))               where.type   = type;
        if (status && ['SUCCESS', 'PARTIAL', 'FAILED'].includes(status))    where.status = status;

        const [logs, total] = await Promise.all([
            prisma.syncLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.syncLog.count({ where }),
        ]);

        // Estadísticas resumidas (sin filtro de tipo/estado para que sean globales)
        const [totalSyncs, successSyncs, lastSync] = await Promise.all([
            prisma.syncLog.count({ where: { tenantId } }),
            prisma.syncLog.count({ where: { tenantId, status: 'SUCCESS' } }),
            prisma.syncLog.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, status: true } }),
        ]);

        return NextResponse.json({
            logs,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            stats: {
                totalSyncs,
                successRate: totalSyncs > 0 ? Math.round((successSyncs / totalSyncs) * 100) : 0,
                lastSync: lastSync?.createdAt ?? null,
                lastSyncStatus: lastSync?.status ?? null,
            },
        }, { status: 200 });

    } catch (error: any) {
        return NextResponse.json({ message: 'Error al obtener el historial.', error: error.message }, { status: 500 });
    }
}
