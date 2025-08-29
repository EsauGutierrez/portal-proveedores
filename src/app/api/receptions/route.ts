// app/api/receptions/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // CAMBIO: Se obtiene el 'folio' del cuerpo de la petición
    const { purchaseOrderId, folio, fecha, articles } = body;

    // CAMBIO: Se añade la validación para el nuevo campo 'folio'
    if (!purchaseOrderId || !folio || !fecha || !articles || !Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json(
        { message: 'Faltan datos: se requiere purchaseOrderId, folio, fecha y una lista de artículos.' },
        { status: 400 }
      );
    }

    const newReception = await prisma.$transaction(async (tx) => {
      // Se elimina la generación automática del folio

      const reception = await tx.reception.create({
        data: {
          folio: folio, // <-- CAMBIO: Se usa el folio recibido desde la API
          fecha: new Date(fecha),
          purchaseOrder: {
            connect: { id: purchaseOrderId },
          },
        },
      });

      for (const articleData of articles) {
        if (!articleData.articleName || !articleData.quantity || !articleData.unitPrice) {
            throw new Error('Cada artículo debe tener articleName, quantity y unitPrice.');
        }

        const subtotal = articleData.quantity * articleData.unitPrice;
        const tax = subtotal * 0.16;
        const total = subtotal + tax;

        await tx.receptionArticle.create({
          data: {
            receptionId: reception.id,
            articleName: articleData.articleName,
            quantity: articleData.quantity,
            unitPrice: articleData.unitPrice,
            subtotal: subtotal,
            tax: tax,
            total: total,
          },
        });
      }

      return tx.reception.findUnique({
        where: { id: reception.id },
        include: {
          articles: true,
        },
      });
    });

    return NextResponse.json(newReception, { status: 201 });

  } catch (error) {
    console.error('Error creating reception:', error);
    if (error.code === 'P2025') {
        return NextResponse.json({ message: 'La orden de compra especificada no existe.' }, { status: 404 });
    }
    // Manejo de error para folios duplicados
    if (error.code === 'P2002') {
        return NextResponse.json(
            { message: `El folio de recepción '${error.meta.target}' ya existe.` },
            { status: 409 } // Conflict
        );
    }
    return NextResponse.json({ message: 'Error al crear la recepción.', error: error.message }, { status: 500 });
  }
}
