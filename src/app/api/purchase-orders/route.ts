// app/api/purchase-orders/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import jwt from 'jsonwebtoken';
import { getPresignedUrl } from '../../lib/s3';

// --- Función GET para obtener las órdenes de compra ---
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; role: string; tenantId: string };
    const { userId, role, tenantId } = decodedToken;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    // CARGADOR puede consultar OCs de un proveedor asignado mediante supplierUserId
    let effectiveUserId = userId;
    if (role === 'CARGADOR') {
      const supplierUserId = searchParams.get('supplierUserId');
      if (supplierUserId) {
        const supplierProfile = await prisma.supplierProfile.findFirst({
          where: { userId: supplierUserId, tenantId },
          select: { id: true },
        });
        const assignment = supplierProfile
          ? await prisma.operatorAssignment.findFirst({
              where: { operatorId: userId, supplierProfileId: supplierProfile.id },
            })
          : null;
        if (!assignment) {
          return NextResponse.json({ message: 'No tienes acceso a las OCs de este proveedor.' }, { status: 403 });
        }
        effectiveUserId = supplierUserId;
      }
    }

    const [purchaseOrders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where: { userId: effectiveUserId },
        include: {
          subsidiary: true,
          invoices: {
            select: { id: true, syncStatus: true, pdfUrl: true, xmlUrl: true, total: true },
          },
          recepciones: {
            include: {
              articles: true,
              invoice: true,
            },
          },
          user: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.purchaseOrder.count({ where: { userId: effectiveUserId } }),
    ]);

    const formattedData = await Promise.all(
      purchaseOrders.map(async (po) => {
        const invoicesWithUrls = await Promise.all(
          (po.invoices as any[]).map(async (inv) => {
            const [pdfUrl, xmlUrl] = await Promise.all([
              inv.pdfUrl ? getPresignedUrl(inv.pdfUrl) : Promise.resolve(null),
              inv.xmlUrl ? getPresignedUrl(inv.xmlUrl) : Promise.resolve(null),
            ]);
            return { ...inv, pdfUrl, xmlUrl };
          })
        );

        const totalFacturado = invoicesWithUrls
          .filter(inv => inv.syncStatus !== 'FAILED')
          .reduce((sum, inv) => sum + Number(inv.total), 0);
        const saldoDisponible = Number(po.total) - totalFacturado;

        return {
          ...po,
          invoice: invoicesWithUrls[0] ?? null,
          invoices: invoicesWithUrls,
          totalFacturado,
          saldoDisponible,
          subsidiaria: po.subsidiary.name,
        };
      })
    );

    return NextResponse.json(
      { data: formattedData, total, page, limit, totalPages: Math.ceil(total / limit) },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    return NextResponse.json({ message: 'Error al obtener las órdenes de compra.' }, { status: 500 });
  }
}

// --- Función POST para crear una nueva orden de compra ---
export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Se esperan los IDs del proveedor, la subsidiaria y ahora el tenant
    const { folio, fecha, subtotal, total, userId, subsidiaryId, tenantId } = body;

    // Validación de los datos de entrada
    if (!folio || !fecha || !subtotal || !total || !userId || !subsidiaryId || !tenantId) {
      return NextResponse.json({ message: 'Faltan datos requeridos (incluyendo tenantId) para crear la orden de compra.' }, { status: 400 });
    }

    // Creación de la nueva orden de compra
    const newPurchaseOrder = await prisma.purchaseOrder.create({
      data: {
        folio,
        fecha: new Date(fecha),
        subtotal,
        total,
        // Se conecta con el usuario (proveedor), subsidiaria y Tenant
        user: { connect: { id: userId } },
        subsidiary: { connect: { id: subsidiaryId } },
        tenant: { connect: { id: tenantId } }, // <-- INYECTAR TENANT
      },
    });

    return NextResponse.json(newPurchaseOrder, { status: 201 });

  } catch (error) {
    console.error('Error creating purchase order:', error);
    if ((error as any).code === 'P2002') {
      return NextResponse.json({ message: `El folio '${(error as any).meta.target}' ya existe.` }, { status: 409 });
    }
    if ((error as any).code === 'P2025') {
      return NextResponse.json({ message: 'El proveedor o la subsidiaria especificados no existen.' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Error al crear la orden de compra.' }, { status: 500 });
  }
}
