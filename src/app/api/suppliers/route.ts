// app/api/suppliers/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient, SupplierType } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { rateLimit, getClientIP, rateLimitResponse } from '../../lib/rateLimit';
import { sendEmail } from '../../lib/mailer';
import { getPresignedUrl } from '../../lib/s3';

const prisma = new PrismaClient();

// Función para obtener proveedores, filtrando por estado y tenant
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const { searchParams: sp } = new URL(request.url);
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '100', 10)));

    // Extraer tenantId del JWT si está presente
    let tenantId: string | undefined;
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET!) as any;
        tenantId = decoded.tenantId ?? undefined;
      } catch { /* token inválido, continuar sin filtro */ }
    }

    const where = {
      ...(tenantId ? { tenantId } : {}),
      ...(status ? { status: { equals: status as any } } : {}),
    };

    const [rawSuppliers, total] = await Promise.all([
      prisma.supplierProfile.findMany({
        where,
        include: {
          user: { select: { name: true, email: true } },
          documents: true,
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.supplierProfile.count({ where }),
    ]);

    // Generar presigned URLs para cada documento de cada proveedor
    const suppliers = await Promise.all(
      rawSuppliers.map(async (supplier) => ({
        ...supplier,
        documents: await Promise.all(
          supplier.documents.map(async (doc) => ({
            ...doc,
            fileUrl: doc.fileUrl ? await getPresignedUrl(doc.fileUrl) : null,
          }))
        ),
      }))
    );



    
    return NextResponse.json(
      { data: suppliers, total, page, limit, totalPages: Math.ceil(total / limit) },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error fetching suppliers:', error);
    return NextResponse.json(
      { message: 'Error al obtener los proveedores.' },
      { status: 500 }
    );
  }
}

// POST: Invitación de nuevo proveedor (solo Email y Nombre)
export async function POST(request: Request) {
  // Rate limit: 20 invitaciones por IP cada hora
  const ip = getClientIP(request);
  const rl = rateLimit(`invite-supplier:${ip}`, 20, 60 * 60 * 1000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterSec);

  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    const tokenAdmin = authHeader.split(' ')[1];
    const decodedToken = jwt.verify(tokenAdmin, process.env.JWT_SECRET!) as { userId: string, role: string, tenantId: string };

    if (decodedToken.role !== 'TENANT_ADMIN' && decodedToken.role !== 'ADMIN') {
      return NextResponse.json({ message: 'No tienes permisos para invitar proveedores' }, { status: 403 });
    }

    const body = await request.json();
    const { email, name, subsidiaryId, requireDocuments = false, supplierType = 'NATIONAL' } = body;

    if (!email || !name) {
      return NextResponse.json({ message: 'Email y Nombre son requeridos' }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ message: 'Este correo ya está registrado en el sistema.' }, { status: 409 });
    }

    // Verificar límite de proveedores activos y preparar aviso
    let supplierLimitWarning: string | null = null;
    const tenantForLimit = await prisma.tenant.findUnique({
      where: { id: decodedToken.tenantId },
      select: { maxSuppliers: true },
    });
    if (tenantForLimit?.maxSuppliers !== null && tenantForLimit?.maxSuppliers !== undefined) {
      const activeCount = await prisma.supplierProfile.count({
        where: { tenantId: decodedToken.tenantId, status: 'ACTIVE' },
      });
      if (activeCount >= tenantForLimit.maxSuppliers) {
        supplierLimitWarning = `Has alcanzado el límite de ${tenantForLimit.maxSuppliers} proveedores activos. La invitación se enviará, pero el proveedor no podrá acceder hasta que se amplíe el límite de tu suscripción.`;
      }
    }

    // Usar la subsidiaria indicada; si no se envió, tomar la primera del tenant como fallback
    let subsidiary = subsidiaryId
      ? await prisma.subsidiary.findFirst({ where: { id: subsidiaryId, tenantId: decodedToken.tenantId } })
      : await prisma.subsidiary.findFirst({ where: { tenantId: decodedToken.tenantId } });

    if (!subsidiary) {
      return NextResponse.json({ message: 'Subsidiaria no encontrada. Verifica la configuración.' }, { status: 400 });
    }

    // Crear usuario con password temporal aleatoria
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name,
          password: hashedPassword,
          role: 'SUPPLIER',
          tenant: { connect: { id: decodedToken.tenantId } },
          firstLogin: true // Forzará cambio de contraseña
        }
      });

      await tx.supplierProfile.create({
        data: {
          companyName: name,
          rfc: `INVITE-${Date.now()}`,
          taxAddress: 'Pendiente de completar',
          status: 'PENDING',
          requireDocuments: Boolean(requireDocuments),
          supplierType: supplierType === SupplierType.FOREIGN ? SupplierType.FOREIGN : SupplierType.NATIONAL,
          user: { connect: { id: user.id } },
          subsidiary: { connect: { id: subsidiary.id } },
          tenant: { connect: { id: decodedToken.tenantId } }
        }
      });

      return user;
    });

    // Generar token para el enlace de "Establecer contraseña"
    const inviteToken = jwt.sign(
      { userId: newUser.id },
      process.env.JWT_SECRET!,
      { expiresIn: '72h' }
    );

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
      `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}`;
    const setPasswordUrl = `${appUrl}/crear-contrasena?token=${inviteToken}`;

    try {
      await sendEmail({
        to: email,
        subject: 'Invitación al Portal de Proveedores',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">¡Has sido invitado!</h1>
            </div>
            <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
              <p style="color: #374151; font-size: 16px;">Hola, <strong>${name}</strong></p>
              <p style="color: #6b7280;">Has sido invitado a unirte al Portal de Proveedores. Para activar tu cuenta y establecer tu contraseña, haz clic en el siguiente enlace:</p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${setPasswordUrl}" style="background-color: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
                  Activar mi cuenta
                </a>
              </div>
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px;">
                <p style="color: #92400e; margin: 0; font-size: 14px;">⚠️ Este enlace es válido por <strong>72 horas</strong>.</p>
              </div>
            </div>
          </div>
        `,
      });
    } catch (emailError) {
      console.error('Error enviando correo de invitación:', emailError);
    }

    return NextResponse.json({
      message: 'Proveedor invitado exitosamente.',
      userId: newUser.id,
      tempPassword,
      ...(supplierLimitWarning && { warning: supplierLimitWarning }),
    }, { status: 201 });

  } catch (error) {
    console.error('Error inviting supplier:', error);
    return NextResponse.json({ message: 'Error al invitar al proveedor.' }, { status: 500 });
  }
}
