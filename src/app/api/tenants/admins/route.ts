// app/api/tenants/admins/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';

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
        } catch (err) {
            return NextResponse.json({ message: 'Token inválido' }, { status: 401 });
        }

        if (decodedToken.role !== 'SUPERADMIN') {
            return NextResponse.json({ message: 'Solo un SuperAdmin puede crear administradores de cliente.' }, { status: 403 });
        }

        const body = await request.json();
        const { name, email, password, tenantId } = body;

        if (!name || !email || !password || !tenantId) {
            return NextResponse.json({ message: 'Todos los campos son obligatorios.' }, { status: 400 });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({ message: 'El correo ya está registrado en uso.' }, { status: 400 });
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

        return NextResponse.json({ message: 'Administrador creado con éxito', user }, { status: 201 });

    } catch (error: any) {
        console.error('Error al crear administrador de tenant:', error);
        return NextResponse.json({ message: 'Error interno del servidor.', error: error.message }, { status: 500 });
    }
}
