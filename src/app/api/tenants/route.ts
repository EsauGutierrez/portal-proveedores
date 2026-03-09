import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

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
                subsidiaries: true, // <-- PARA TRAER EL DESGLOSE DE SUBSIDIARIAS
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
        const { name, netsuiteAccountId, netsuiteConsumerKey, netsuiteConsumerSecret, netsuiteTokenId, netsuiteTokenSecret } = body;

        if (!name) {
            return NextResponse.json({ message: 'El nombre de la empresa es obligatorio.' }, { status: 400 });
        }

        const newTenant = await prisma.tenant.create({
            data: {
                name,
                isActive: true, // Por defecto al crearlo es activo
                netsuiteAccountId,
                netsuiteConsumerKey,
                netsuiteConsumerSec: netsuiteConsumerSecret,
                netsuiteTokenId,
                netsuiteTokenSecret,
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

export async function PUT(request: Request) {
    if (!isSuperAdmin(request)) {
        return NextResponse.json({ message: 'No Autorizado: Se requiere perfil Super Administrador.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { id, name, netsuiteAccountId, netsuiteConsumerKey, netsuiteConsumerSecret, netsuiteTokenId, netsuiteTokenSecret } = body;

        if (!id || !name) {
            return NextResponse.json({ message: 'El ID y nombre de la empresa son obligatorios.' }, { status: 400 });
        }

        const updatedTenant = await prisma.tenant.update({
            where: { id },
            data: {
                name,
                netsuiteAccountId,
                netsuiteConsumerKey,
                netsuiteConsumerSec: netsuiteConsumerSecret,
                netsuiteTokenId,
                netsuiteTokenSecret,
            }
        });

        return NextResponse.json(updatedTenant, { status: 200 });
    } catch (error) {
        console.error('Error editing tenant:', error);
        return NextResponse.json({ message: 'Error al editar la empresa cliente.' }, { status: 500 });
    }
}
