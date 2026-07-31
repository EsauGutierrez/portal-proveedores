// app/api/tenants/admins/route.ts
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import * as bcrypt from 'bcrypt';
import { requireAuth } from '../../../lib/auth';
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from '../../../lib/passwordPolicy';

export async function POST(request: Request) {
    const { error } = await requireAuth(request, ['SUPERADMIN']);
    if (error) return error;

    try {
        const body = await request.json();
        const { name, email: rawEmail, password, tenantId } = body;

        if (!name || !rawEmail || !password || !tenantId) {
            return NextResponse.json({ message: 'Todos los campos son obligatorios.' }, { status: 400 });
        }

        if (!isValidPassword(password)) {
            return NextResponse.json({ message: PASSWORD_POLICY_MESSAGE }, { status: 400 });
        }

        // Normalizar email a minúsculas para evitar duplicados por capitalización
        const email = rawEmail.trim().toLowerCase();

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({
                message: `El correo "${email}" ya está registrado. Usa un correo diferente o inicia sesión con esa cuenta.`
            }, { status: 409 });
        }

        // Verificar que el tenant exista
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) {
            return NextResponse.json({ message: 'La empresa seleccionada no existe.' }, { status: 404 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: 'TENANT_ADMIN',
                tenantId
            }
        });

        return NextResponse.json({
            message: `Administrador "${name}" creado con éxito para ${tenant.name}.`,
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        }, { status: 201 });

    } catch (error: any) {
        console.error('Error al crear administrador de tenant:', error);

        // Capturar específicamente el error de constraint único de Prisma (P2002)
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return NextResponse.json({
                message: 'El correo electrónico ya está registrado en el sistema. Usa otro correo.'
            }, { status: 409 });
        }

        return NextResponse.json({ message: 'Error interno del servidor.', error: error.message }, { status: 500 });
    }
}
