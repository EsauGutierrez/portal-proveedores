// app/api/purchase-orders/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// --- Función GET para obtener las órdenes de compra ---
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    const { userId } = decodedToken;

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: { userId },
      include: {
        subsidiary: true,
        recepciones: {
          include: {
            articles: true,
          },
        },
        user: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Transformamos los datos para que el frontend no se rompa
    const formattedData = purchaseOrders.map(po => ({
      ...po,
      subsidiaria: po.subsidiary.name, // Aseguramos que el campo 'subsidiaria' siga existiendo para la UI
    }));

    return NextResponse.json(formattedData, { status: 200 });

  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    return NextResponse.json({ message: 'Error al obtener las órdenes de compra.' }, { status: 500 });
  }
}

// --- Función POST para crear una nueva orden de compra ---
export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Se esperan los IDs del proveedor (userId) y la subsidiaria (subsidiaryId)
    const { folio, fecha, subtotal, total, userId, subsidiaryId } = body;

    // Validación de los datos de entrada
    if (!folio || !fecha || !subtotal || !total || !userId || !subsidiaryId) {
      return NextResponse.json({ message: 'Faltan datos requeridos para crear la orden de compra.' }, { status: 400 });
    }

    // Creación de la nueva orden de compra
    const newPurchaseOrder = await prisma.purchaseOrder.create({
      data: {
        folio,
        fecha: new Date(fecha),
        subtotal,
        total,
        // Se conecta con el usuario (proveedor) y la subsidiaria por sus IDs
        user: { connect: { id: userId } },
        subsidiary: { connect: { id: subsidiaryId } },
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
