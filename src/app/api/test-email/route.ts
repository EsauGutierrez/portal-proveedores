import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { sendEmail } from '../../lib/mailer';

export async function GET(request: Request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }
    try {
        const decoded: any = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET!);
        if (decoded.role !== 'ADMIN' && decoded.role !== 'SUPERADMIN') {
            return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 });
        }
    } catch {
        return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const to = searchParams.get('to');

    if (!to) {
        return NextResponse.json({ error: 'Falta el parámetro ?to=correo@ejemplo.com' }, { status: 400 });
    }

    const config = {
        MAIL_HOST: process.env.MAIL_HOST || '(no configurado)',
        MAIL_PORT: process.env.MAIL_PORT || '(no configurado)',
        MAIL_USERNAME: process.env.MAIL_USERNAME ? process.env.MAIL_USERNAME.substring(0, 8) + '...' : '(no configurado)',
        MAIL_FROM_ADDRESS: process.env.MAIL_FROM_ADDRESS || '(no configurado)',
    };

    if (!process.env.MAIL_HOST) {
        return NextResponse.json({ error: 'MAIL_HOST no está configurado', config }, { status: 500 });
    }

    try {
        await sendEmail({
            to,
            subject: 'Prueba de correo — Portal de Proveedores',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px;">
                    <h2 style="color: #1e40af;">✅ Correo de prueba (vía mailer)</h2>
                    <p>Si recibes este mensaje, el módulo de correo está funcionando correctamente.</p>
                    <p style="color: #6b7280; font-size: 13px;">Enviado desde: <strong>${process.env.MAIL_FROM_ADDRESS}</strong></p>
                </div>
            `,
        });

        return NextResponse.json({ success: true, message: `Correo enviado a ${to}`, config });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message,
            code: error.code,
            config,
        }, { status: 500 });
    }
}
