// api/payment-complements/bulk/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import jwt from 'jsonwebtoken';
import { processBulkPaymentComplements } from '../../../../lib/processBulkPaymentComplements';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
    }
    let decoded: any;
    try {
      decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET!);
    } catch {
      return NextResponse.json({ message: 'Token inválido.' }, { status: 401 });
    }

    const log = await prisma.bulkPaymentComplementLog.findFirst({
      where: { id, userId: decoded.userId },
    });

    if (!log) {
      return NextResponse.json({ message: 'Log no encontrado.' }, { status: 404 });
    }

    return NextResponse.json(log);
  } catch (err) {
    console.error('[BulkLog GET] Error:', err);
    return NextResponse.json({ message: 'Error al obtener el log.' }, { status: 500 });
  }
}

// POST: Disparar procesamiento manualmente (útil en dev y para recuperar logs atascados)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
    }
    let decoded: any;
    try {
      decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET!);
    } catch {
      return NextResponse.json({ message: 'Token inválido.' }, { status: 401 });
    }

    const log = await prisma.bulkPaymentComplementLog.findFirst({
      where: { id, userId: decoded.userId },
    });

    if (!log) {
      return NextResponse.json({ message: 'Log no encontrado.' }, { status: 404 });
    }
    if (log.status !== 'PROCESSING') {
      return NextResponse.json({ message: `El log ya tiene estado final: ${log.status}` }, { status: 409 });
    }
    if (!log.s3ZipKey) {
      return NextResponse.json({ message: 'El log no tiene ZIP asociado.' }, { status: 422 });
    }

    // Resetear a PROCESSING por si acaso y disparar de forma asíncrona
    await prisma.bulkPaymentComplementLog.update({
      where: { id },
      data: { status: 'PROCESSING', results: [] },
    });

    // Procesar sin await para no bloquear la respuesta HTTP
    processBulkPaymentComplements(log.id, log.s3ZipKey, log.userId, log.tenantId)
      .catch(err => console.error('[BulkTrigger] Error en procesamiento:', err));

    return NextResponse.json({ message: 'Procesamiento iniciado.' });
  } catch (err) {
    console.error('[BulkLog POST] Error:', err);
    return NextResponse.json({ message: 'Error al disparar el procesamiento.' }, { status: 500 });
  }
}
