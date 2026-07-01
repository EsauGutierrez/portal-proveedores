import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Configuración del cliente S3 con las variables de entorno
const s3Client = new S3Client({
    region: process.env.APP_AWS_REGION || process.env.AWS_REGION || 'us-east-2',
    credentials: {
        accessKeyId: (process.env.APP_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID)!,
        secretAccessKey: (process.env.APP_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY)!,
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
        Bucket: (process.env.APP_AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME)!,
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
        Bucket: (process.env.APP_AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME)!,
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

/**
 * Descarga un archivo de S3 y lo retorna como Buffer.
 */
export async function downloadFileFromS3(fileKey: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: (process.env.APP_AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME)!,
    Key: fileKey,
  });
  const response = await s3Client.send(command);
  const stream = response.Body as any;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Sube un Buffer directamente a S3 con la key especificada.
 */
export async function uploadBufferToS3(buffer: Buffer, key: string, contentType: string): Promise<string> {
  const params = {
    Bucket: (process.env.APP_AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME)!,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  };
  await s3Client.send(new PutObjectCommand(params));
  return key;
}

/**
 * Elimina un archivo de S3 dado su key interno.
 * @param fileKey La clave interna del archivo en S3 (guardada en base de datos).
 */
export async function deleteFromS3(fileKey: string): Promise<void> {
    if (!fileKey || fileKey.startsWith('http')) return;

    const command = new DeleteObjectCommand({
        Bucket: (process.env.APP_AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME)!,
        Key: fileKey,
    });

    await s3Client.send(command);
}
