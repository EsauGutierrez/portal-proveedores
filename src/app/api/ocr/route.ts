// app/api/ocr/route.ts
import { NextResponse } from 'next/server';
import { startAsyncAnalysis, waitForAnalysis, processCfsResults, processOpinionResults, processIDResults, processAddressResults, processActaResults } from '../../lib/ocr';
import jwt from 'jsonwebtoken';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET!);

    const formData = await request.formData();
    const s3Key = formData.get('s3Key') as string;
    const documentType = formData.get('documentType') as string;

    if (!s3Key) {
      return NextResponse.json({ message: 'No se recibió la llave del documento (S3).' }, { status: 400 });
    }

    // 1. Iniciar análisis asíncrono
    const jobId = await startAsyncAnalysis(s3Key);
    console.log(`Textract Job Iniciado: ${jobId}`);

    // 2. Esperar el resultado (Polling)
    // Nota: Para una UI más avanzada podríamos devolver solo el JobId,
    // pero para validar el flujo actual esperaremos aquí.
    const analysisResults = await waitForAnalysis(jobId!);
    
    // 3. Procesar resultados según el tipo de documento
    let processedData = {};
    if (documentType === 'CONSTANCIA_SITUACION_FISCAL') {
      processedData = processCfsResults(analysisResults);
    } else if (documentType === 'OPINION_CUMPLIMIENTO_SAT') {
      processedData = processOpinionResults(analysisResults);
    } else if (documentType === 'IDENTIFICACION_OFICIAL') {
      processedData = processIDResults(analysisResults);
    } else if (documentType === 'COMPROBANTE_DOMICILIO') {
      processedData = processAddressResults(analysisResults);
    } else if (documentType === 'ACTA_CONSTITUTIVA') {
      processedData = processActaResults(analysisResults);
    } else {
      processedData = {
        keyValues: analysisResults.keyValues,
        rawText: analysisResults.rawText
      };
    }

    return NextResponse.json({
      success: true,
      data: processedData,
      jobId
    });

  } catch (error: any) {
    console.error('Error en OCR Asíncrono:', error);
    return NextResponse.json({ 
        message: 'Error al procesar el documento con OCR.',
        error: error.message 
    }, { status: 500 });
  }
}
