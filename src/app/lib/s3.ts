import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Configuración del cliente S3 con las variables de entorno
const s3Client = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
});

/**
 * Función genérica para subir un archivo a S3.
 * @param file El objeto File (desde FormData).
 * @param targetFolder Carpeta dentro del bucket (ej. "invoices", "documents").
 * @returns La URL pública del archivo subido en S3.
 */
export async function uploadFileToS3(file: File, targetFolder: string): Promise<string> {
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Limpiamos el nombre del archivo para evitar problemas con espacios o caracteres raros
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileKey = `${targetFolder}/${Date.now()}-${safeFileName}`;

    const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: fileKey,
        Body: fileBuffer,
        ContentType: file.type || "application/octet-stream",
    };

    const command = new PutObjectCommand(params);

    try {
        await s3Client.send(command);

        // Devolvemos simplemente la "Key" (ruta interna en S3) en lugar de una URL pública
        return fileKey;
    } catch (error) {
        console.error(`Error subiendo archivo a S3 (${file.name}):`, error);
        throw new Error('No se pudo subir el archivo al servidor de almacenamiento en la nube.');
    }
}

/**
 * Genera una URL pre-firmada (Presigned URL) para descargar/leer un archivo privado de S3.
 * La URL expira después de cierto tiempo.
 * @param fileKey La clave interna del archivo en S3 (guardada en base de datos).
 * @returns La URL temporal para acceder al archivo.
 */
export async function getPresignedUrl(fileKey: string): Promise<string> {
    if (!fileKey) return '';

    // Si por alguna razón la key en la BD ya es una URL vieja formateada, extraemos solo la key
    let cleanKey = fileKey;
    if (fileKey.startsWith('http')) {
        const urlParts = fileKey.split('.com/');
        if (urlParts.length > 1) {
            cleanKey = urlParts[1];
        }
    }

    const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: cleanKey,
    });

    try {
        // La URL será válida por 1 hora (3600 segundos)
        const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        return presignedUrl;
    } catch (error) {
        console.error("Error generando presigned URL para", cleanKey, error);
        return '';
    }
}
