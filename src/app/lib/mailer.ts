import nodemailer from 'nodemailer';

const FROM_ADDRESS = process.env.MAIL_FROM_ADDRESS || 'no-reply@zentax.com.mx';
const FROM_NAME = process.env.MAIL_FROM_NAME || 'Portal de Proveedores';

function createTransporter() {
    const host = process.env.MAIL_HOST;
    if (!host) return null;

    return nodemailer.createTransport({
        host,
        port: parseInt(process.env.MAIL_PORT || '587'),
        secure: false,
        auth: {
            user: process.env.MAIL_USERNAME,
            pass: process.env.MAIL_PASSWORD,
        },
    });
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
    const transporter = createTransporter();

    if (!transporter) {
        console.log('📧 [SIMULADO] Email no enviado (configura MAIL_HOST en .env):', { to, subject });
        return;
    }

    await transporter.sendMail({
        from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
        to,
        subject,
        html,
    });
}
