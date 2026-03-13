import { NextResponse } from 'next/server';
import { extractTextFromDocument } from '../../lib/textract';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ message: 'No se incluyó ningún documento para procesar.' }, { status: 400 });
        }

        const fileBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(fileBuffer);

        // Call OCR Motor
        const ocrText = await extractTextFromDocument(buffer);

        return NextResponse.json({
            message: 'Procesamiento OCR completado exitosamente.',
            fileName: file.name,
            ocrText,
        });
    } catch (error: any) {
        console.error('Error in OCR processing:', error);
        return NextResponse.json(
            { message: 'Error en el procesamiento del OCR (AWS Textract)', error: error.message },
            { status: 500 }
        );
    }
}
