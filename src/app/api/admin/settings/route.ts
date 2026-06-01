// app/api/admin/settings/route.ts
// Configuración del tenant: tolerancia de importe en facturas, etc.

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

function decodeTenantAdmin(request: Request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;
    try {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET!) as any;
        if (decoded.role !== 'TENANT_ADMIN' && decoded.role !== 'ADMIN') return null;
        return decoded;
    } catch {
        return null;
    }
}

// GET: Obtener configuración actual del tenant
export async function GET(request: Request) {
    const decoded = decodeTenantAdmin(request);
    if (!decoded) return NextResponse.json({ message: 'No autorizado' }, { status: 401 });

    try {
        const tenant = await prisma.tenant.findUnique({
            where: { id: decoded.tenantId },
            select: { invoiceTolerance: true },
        });

        if (!tenant) return NextResponse.json({ message: 'Empresa no encontrada' }, { status: 404 });

        return NextResponse.json({ invoiceTolerance: tenant.invoiceTolerance });
    } catch (error: any) {
        return NextResponse.json({ message: 'Error al obtener configuración.', error: error.message }, { status: 500 });
    }
}

// PATCH: Actualizar configuración del tenant
export async function PATCH(request: Request) {
    const decoded = decodeTenantAdmin(request);
    if (!decoded) return NextResponse.json({ message: 'No autorizado' }, { status: 401 });

    try {
        const body = await request.json();
        const { invoiceTolerance } = body;

        if (invoiceTolerance === undefined || typeof invoiceTolerance !== 'number' || invoiceTolerance < 0) {
            return NextResponse.json({ message: 'El valor de tolerancia debe ser un número mayor o igual a 0.' }, { status: 400 });
        }

        const updated = await prisma.tenant.update({
            where: { id: decoded.tenantId },
            data: { invoiceTolerance },
            select: { invoiceTolerance: true },
        });

        return NextResponse.json({ message: 'Configuración guardada correctamente.', invoiceTolerance: updated.invoiceTolerance });
    } catch (error: any) {
        return NextResponse.json({ message: 'Error al guardar configuración.', error: error.message }, { status: 500 });
    }
}
