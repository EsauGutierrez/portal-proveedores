import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function GET(request: Request) {
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

    const transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: parseInt(process.env.MAIL_PORT || '587'),
        secure: false,
        auth: {
            user: process.env.MAIL_USERNAME,
            pass: process.env.MAIL_PASSWORD,
        },
    });

    try {
        await transporter.verify();

        await transporter.sendMail({
            from: `"${process.env.MAIL_FROM_NAME || 'Portal de Proveedores'}" <${process.env.MAIL_FROM_ADDRESS}>`,
            to,
            subject: 'Prueba de correo — Portal de Proveedores',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px;">
                    <h2 style="color: #1e40af;">✅ Correo de prueba</h2>
                    <p>Si recibes este mensaje, el servidor SMTP está configurado correctamente.</p>
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
