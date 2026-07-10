import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import * as jwt from 'jsonwebtoken';

// Helper para validar si el usuario es SUPERADMIN
const isSuperAdmin = (request: Request) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false;

    try {
        const token = authHeader.split(' ')[1];
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as any;
        return decodedToken.role === 'SUPERADMIN';
    } catch (e) {
        return false;
    }
};

export async function GET(request: Request) {
    if (!isSuperAdmin(request)) {
        return NextResponse.json({ message: 'No Autorizado: Se requiere perfil Super Administrador.' }, { status: 403 });
    }

    try {
        const tenants = await prisma.tenant.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                subsidiaries: true,
                supplierProfiles: {
                    where: { status: 'ACTIVE' },
                    select: { id: true },
                },
                _count: {
                    select: { users: true, subsidiaries: true }
                }
            }
        });
        return NextResponse.json(tenants, { status: 200 });
    } catch (error) {
        console.error('Error fetching tenants:', error);
        return NextResponse.json({ message: 'Error interno al obtener clientes (Tenants).' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    if (!isSuperAdmin(request)) {
        return NextResponse.json({ message: 'No Autorizado: Se requiere perfil Super Administrador.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { name, netsuiteAccountId, netsuiteConsumerKey, netsuiteConsumerSecret, netsuiteTokenId, netsuiteTokenSecret, netsuiteScriptId, netsuiteDeployId, supportEmail, maxSubsidiaries, maxSuppliers, subscriptionExpiresAt } = body;

        if (!name) {
            return NextResponse.json({ message: 'El nombre de la empresa es obligatorio.' }, { status: 400 });
        }

        const newTenant = await prisma.tenant.create({
            data: {
                name,
                isActive: true,
                netsuiteAccountId,
                netsuiteConsumerKey,
                netsuiteConsumerSec: netsuiteConsumerSecret,
                netsuiteTokenId,
                netsuiteTokenSecret,
                netsuiteScriptId: netsuiteScriptId || null,
                netsuiteDeployId: netsuiteDeployId || null,
                supportEmail: supportEmail || null,
                maxSubsidiaries: maxSubsidiaries ? parseInt(maxSubsidiaries) : null,
                maxSuppliers: maxSuppliers ? parseInt(maxSuppliers) : null,
                subscriptionExpiresAt: subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null,
            }
        });

        return NextResponse.json(newTenant, { status: 201 });
    } catch (error) {
        console.error('Error creating tenant:', error);
        return NextResponse.json({ message: 'Error al crear la empresa cliente.' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    if (!isSuperAdmin(request)) {
        return NextResponse.json({ message: 'No Autorizado' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { id, isActive } = body;

        if (!id || typeof isActive !== 'boolean') {
            return NextResponse.json({ message: 'Datos incompletos para actualizar el estado.' }, { status: 400 });
        }

        const updatedTenant = await prisma.tenant.update({
            where: { id },
            data: { isActive },
        });

        return NextResponse.json(updatedTenant, { status: 200 });
    } catch (error) {
        console.error('Error updating tenant:', error);
        return NextResponse.json({ message: 'Error al actualizar el estado de la empresa.' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    if (!isSuperAdmin(request)) {
        return NextResponse.json({ message: 'No Autorizado: Se requiere perfil Super Administrador.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json({ message: 'El ID de la empresa es obligatorio.' }, { status: 400 });
        }

        await prisma.$transaction(async (tx) => {
            // 1. Documentos de proveedores (FK → SupplierProfile, sin cascade)
            await tx.supplierDocument.deleteMany({
                where: { supplierProfile: { tenantId: id } },
            });
            // 2. Artículos de recepciones (FK → Reception, sin cascade a nivel tenant)
            await tx.receptionArticle.deleteMany({
                where: { reception: { tenantId: id } },
            });
            // 3. Complementos de pago (FK → Invoice y User)
            await tx.paymentComplement.deleteMany({ where: { tenantId: id } });
            // 4. Recepciones (FK → PurchaseOrder; invoiceId es opcional)
            await tx.reception.deleteMany({ where: { tenantId: id } });
            // 5. Facturas (FK → PurchaseOrder, User, BulkUploadJob)
            await tx.invoice.deleteMany({ where: { tenantId: id } });
            // 6. Órdenes de compra (FK → Subsidiary)
            await tx.purchaseOrder.deleteMany({ where: { tenantId: id } });
            // 7. Asignaciones de operadores (FK → SupplierProfile y User)
            await tx.operatorAssignment.deleteMany({ where: { tenantId: id } });
            // 8. Logs de carga masiva de complementos
            await tx.bulkPaymentComplementLog.deleteMany({ where: { tenantId: id } });
            // 9. Jobs de carga masiva de facturas (FK → User)
            await tx.bulkUploadJob.deleteMany({ where: { tenantId: id } });
            // 10. Perfiles de proveedor (FK → User y Subsidiary)
            await tx.supplierProfile.deleteMany({ where: { tenantId: id } });
            // 11. Subsidiarias
            await tx.subsidiary.deleteMany({ where: { tenantId: id } });
            // 12. Logs de sincronización
            await tx.syncLog.deleteMany({ where: { tenantId: id } });
            // 13. Requisitos de documentos
            await tx.documentRequirement.deleteMany({ where: { tenantId: id } });
            // 14. Usuarios del tenant
            await tx.user.deleteMany({ where: { tenantId: id } });
            // 15. El tenant
            await tx.tenant.delete({ where: { id } });
        });

        return NextResponse.json({ message: 'Empresa eliminada correctamente.' }, { status: 200 });
    } catch (error) {
        console.error('Error deleting tenant:', error);
        return NextResponse.json({ message: 'Error al eliminar la empresa cliente.' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    if (!isSuperAdmin(request)) {
        return NextResponse.json({ message: 'No Autorizado: Se requiere perfil Super Administrador.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { id, name, netsuiteAccountId, netsuiteConsumerKey, netsuiteConsumerSecret, netsuiteTokenId, netsuiteTokenSecret, netsuiteScriptId, netsuiteDeployId, supportEmail, maxSubsidiaries, maxSuppliers, subscriptionExpiresAt, subsidiariesToDeactivate } = body;

        if (!id || !name) {
            return NextResponse.json({ message: 'El ID y nombre de la empresa son obligatorios.' }, { status: 400 });
        }

        const updatedTenant = await prisma.$transaction(async (tx) => {
            if (subsidiariesToDeactivate?.length) {
                await tx.subsidiary.updateMany({
                    where: { id: { in: subsidiariesToDeactivate }, tenantId: id },
                    data: { isActive: false },
                });
            }

            return tx.tenant.update({
                where: { id },
                data: {
                    name,
                    netsuiteAccountId,
                    netsuiteConsumerKey,
                    netsuiteConsumerSec: netsuiteConsumerSecret,
                    netsuiteTokenId,
                    netsuiteTokenSecret,
                    netsuiteScriptId: netsuiteScriptId || null,
                    netsuiteDeployId: netsuiteDeployId || null,
                    supportEmail: supportEmail || null,
                    maxSubsidiaries: maxSubsidiaries ? parseInt(maxSubsidiaries) : null,
                    maxSuppliers: maxSuppliers ? parseInt(maxSuppliers) : null,
                    subscriptionExpiresAt: subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null,
                },
            });
        });

        return NextResponse.json(updatedTenant, { status: 200 });
    } catch (error) {
        console.error('Error editing tenant:', error);
        return NextResponse.json({ message: 'Error al editar la empresa cliente.' }, { status: 500 });
    }
}
