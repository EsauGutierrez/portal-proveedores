import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
        }
        const token = authHeader.split(' ')[1];

        let decodedToken: { userId: string, role: string, tenantId?: string };
        try {
            decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string, role: string, tenantId?: string };
        } catch (error) {
            return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
        }

        const { userId, role, tenantId } = decodedToken;

        let resData: any = {};

        if (role === 'SUPPLIER') {
            const invoices = await prisma.invoice.findMany({ where: { userId } });
            const totalInvoices = invoices.length;
            const approvedInvoices = invoices.filter(i => i.syncStatus === 'SYNCED');
            const rejectedInvoices = invoices.filter(i => i.syncStatus === 'FAILED');
            const pendingInvoices = invoices.filter(i => i.syncStatus === 'PENDING_SYNC');

            const totalAmount = approvedInvoices.reduce((sum, i) => sum + Number(i.total), 0);

            resData = {
                totalFacturas: totalInvoices,
                facturasAprobadas: approvedInvoices.length,
                facturasRechazadas: rejectedInvoices.length,
                facturasPendientes: pendingInvoices.length,
                montoTotalAprobado: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalAmount),
            };
        } else if (role === 'ADMIN' || role === 'TENANT_ADMIN') {
            const supplierProfiles = await prisma.supplierProfile.findMany({ include: { documents: true } });
            const invoices = await prisma.invoice.findMany();

            const totalProveedores = supplierProfiles.length;
            const proveedoresActivos = supplierProfiles.filter(p => p.status === 'ACTIVE').length;

            const proveedoresPendientes = supplierProfiles.filter(p => {
                return p.documents.some(doc => doc.status === 'PENDING' || doc.status === 'UPLOADED');
            }).length;

            const facturasRecibidas = invoices.length;
            const facturasAprobadas = invoices.filter(i => i.syncStatus === 'SYNCED').length;
            const facturasPendientes = invoices.filter(i => i.syncStatus === 'PENDING_SYNC').length;

            resData = {
                totalProveedores,
                proveedoresActivos,
                proveedoresPendientes, // Proveedores con docs pendientes
                facturasRecibidas,
                facturasAprobadas,
                facturasPendientes
            };
        } else if (role === 'SUPERADMIN') {
            const tenants = await prisma.tenant.findMany();
            const activeTenants = tenants.filter(t => t.isActive).length;

            resData = {
                totalClientes: tenants.length,
                clientesActivos: activeTenants
            };
        }

        return NextResponse.json(resData, { status: 200 });
    } catch (error) {
        console.error('Error fetching metrics', error);
        return NextResponse.json({ message: 'Error interno del servidor.' }, { status: 500 });
    }
}
