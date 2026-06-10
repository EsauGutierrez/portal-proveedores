import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// Genera array de los últimos N meses en formato { label, key }
function getLast6Months() {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
            label: d.toLocaleString('es-MX', { month: 'short', year: '2-digit' }),
            start: new Date(d.getFullYear(), d.getMonth(), 1),
            end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59),
        });
    }
    return months;
}

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
        }
        const token = authHeader.split(' ')[1];

        let decodedToken: { userId: string; role: string; tenantId?: string; supplierProfileId?: string };
        try {
            decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as any;
        } catch {
            return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
        }

        const { userId, role, tenantId } = decodedToken;
        const months = getLast6Months();
        let resData: any = {};

        // ─── SUPPLIER ───────────────────────────────────────────────────────
        if (role === 'SUPPLIER') {
            const invoices = await prisma.invoice.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
            });

            const synced = invoices.filter(i => i.syncStatus === 'SYNCED');
            const failed = invoices.filter(i => i.syncStatus === 'FAILED');
            const pending = invoices.filter(i => i.syncStatus === 'PENDING_SYNC');
            const totalAmount = synced.reduce((sum, i) => sum + Number(i.total), 0);

            // Tendencia mensual: facturas subidas por mes
            const tendencia = months.map(m => ({
                mes: m.label,
                facturas: invoices.filter(i => i.createdAt >= m.start && i.createdAt <= m.end).length,
                monto: invoices
                    .filter(i => i.syncStatus === 'SYNCED' && i.createdAt >= m.start && i.createdAt <= m.end)
                    .reduce((sum, i) => sum + Number(i.total), 0),
            }));

            // Actividad reciente: últimas 5 facturas
            const actividadReciente = invoices.slice(0, 5).map(i => ({
                id: i.id,
                tipo: 'factura',
                descripcion: `Factura ${i.folio}`,
                monto: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(i.total)),
                estado: i.syncStatus,
                fecha: i.createdAt,
            }));

            resData = {
                totalFacturas: invoices.length,
                facturasAprobadas: synced.length,
                facturasRechazadas: failed.length,
                facturasPendientes: pending.length,
                montoTotalAprobado: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalAmount),
                tendencia,
                actividadReciente,
            };

        // ─── ADMIN / TENANT_ADMIN ─────────────────────────────────────────
        } else if (role === 'ADMIN' || role === 'TENANT_ADMIN') {
            const [supplierProfiles, invoices, subsidiariasActivas] = await Promise.all([
                prisma.supplierProfile.findMany({
                    where: { tenantId: tenantId! },
                    include: { user: { select: { name: true, email: true } } },
                    orderBy: { createdAt: 'desc' },
                }),
                prisma.invoice.findMany({
                    where: { tenantId: tenantId! },
                    include: { user: { select: { name: true } } },
                    orderBy: { createdAt: 'desc' },
                }),
                prisma.subsidiary.count({ where: { tenantId: tenantId!, isActive: true } }),
            ]);

            const provActivos = supplierProfiles.filter(p => p.status === 'ACTIVE').length;
            const provPendientes = supplierProfiles.filter(p => p.status === 'PENDING').length;
            const provRechazados = supplierProfiles.filter(p => p.status === 'REJECTED').length;
            const LISTA69B_ALERT = ['PRESUNTO', 'DEFINITIVO', 'DESVIRTUADO', 'SENTENCIA_FAVORABLE'];
            const provEnLista69b = supplierProfiles.filter(p => LISTA69B_ALERT.includes((p as any).lista69bStatus)).length;

            const facturasRecibidas = invoices.length;
            const facturasAprobadas = invoices.filter(i => i.syncStatus === 'SYNCED').length;
            const facturasPendientes = invoices.filter(i => i.syncStatus === 'PENDING_SYNC').length;
            const facturasFallidas = invoices.filter(i => i.syncStatus === 'FAILED').length;
            const montoTotal = invoices
                .filter(i => i.syncStatus === 'SYNCED')
                .reduce((sum, i) => sum + Number(i.total), 0);

            // Tendencia mensual de facturas
            const tendenciaFacturas = months.map(m => ({
                mes: m.label,
                recibidas: invoices.filter(i => i.createdAt >= m.start && i.createdAt <= m.end).length,
                aprobadas: invoices.filter(i => i.syncStatus === 'SYNCED' && i.createdAt >= m.start && i.createdAt <= m.end).length,
            }));

            // Tendencia mensual de proveedores registrados
            const tendenciaProveedores = months.map(m => ({
                mes: m.label,
                registrados: supplierProfiles.filter(p => p.createdAt >= m.start && p.createdAt <= m.end).length,
            }));

            // Actividad reciente: mezcla de últimas facturas + últimos proveedores
            const ultimasFacturas = invoices.slice(0, 5).map(i => ({
                id: i.id,
                tipo: 'factura' as const,
                descripcion: `Factura ${i.folio} — ${i.user?.name || 'Proveedor'}`,
                monto: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(i.total)),
                estado: i.syncStatus,
                fecha: i.createdAt,
            }));

            const ultimosProveedores = supplierProfiles.slice(0, 5).map(p => ({
                id: p.id,
                tipo: 'proveedor' as const,
                descripcion: `${p.companyName} (${p.rfc})`,
                estado: p.status,
                fecha: p.createdAt,
            }));

            // Mezclar y ordenar por fecha desc, tomar 8
            const actividadReciente = [...ultimasFacturas, ...ultimosProveedores]
                .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                .slice(0, 8);

            resData = {
                totalProveedores: supplierProfiles.length,
                proveedoresActivos: provActivos,
                subsidiariasActivas,
                proveedoresPendientes: provPendientes,
                proveedoresRechazados: provRechazados,
                facturasRecibidas,
                facturasAprobadas,
                facturasPendientes,
                facturasFallidas,
                montoTotalAprobado: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(montoTotal),
                tendenciaFacturas,
                tendenciaProveedores,
                actividadReciente,
                // Alertas: proveedores pendientes de aprobar
                alertas: {
                    proveedoresSinAprobar: provPendientes,
                    facturasSinProcesar: facturasPendientes,
                    facturasFallidas,
                    proveedoresEnLista69b: provEnLista69b,
                },
            };

        // ─── SUPERADMIN ───────────────────────────────────────────────────
        } else if (role === 'SUPERADMIN') {
            const [tenants, allSuppliers, allInvoices] = await Promise.all([
                prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } }),
                prisma.supplierProfile.count(),
                prisma.invoice.count(),
            ]);

            const activeTenants = tenants.filter(t => t.isActive);

            const tendenciaClientes = months.map(m => ({
                mes: m.label,
                nuevos: tenants.filter(t => t.createdAt >= m.start && t.createdAt <= m.end).length,
            }));

            resData = {
                totalClientes: tenants.length,
                clientesActivos: activeTenants.length,
                clientesSuspendidos: tenants.length - activeTenants.length,
                totalProveedores: allSuppliers,
                totalFacturas: allInvoices,
                tendenciaClientes,
                ultimosClientes: tenants.slice(0, 5).map(t => ({
                    id: t.id,
                    nombre: t.name,
                    activo: t.isActive,
                    fecha: t.createdAt,
                })),
            };
        }

        return NextResponse.json(resData, { status: 200 });
    } catch (error) {
        console.error('Error fetching metrics', error);
        return NextResponse.json({ message: 'Error interno del servidor.' }, { status: 500 });
    }
}
