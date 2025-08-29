// app/api/chat/route.ts

import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

// En una aplicación real, obtendrías estos datos de tu base de datos
// basándote en el usuario que hace la pregunta.
const getContextForAI = async (userId: string, message: string) => {
  // Simulación: Si el usuario pregunta por una factura, buscamos datos de ejemplo.
  if (message.toLowerCase().includes('factura')) {
    return `
      Contexto del Usuario:
      - Nombre del Proveedor: Insumos Industriales del Norte S.A. de C.V.
      - ID de Usuario: ${userId}
      - Última factura subida: Folio F-REC-f7b-1, Estado: PENDIENTE_SYNC.
      - Error común: El subtotal del XML no coincide con el de la recepción.
    `;
  }
  return `Contexto del Usuario: ID de Usuario: ${userId}.`;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { history, message } = body;

    // 1. Autenticar al usuario para obtener contexto (opcional pero recomendado)
    const authHeader = request.headers.get('Authorization');
    let userId = 'usuario_anonimo';
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
            userId = decoded.userId;
        } catch (e) {
            console.warn('Token de chat inválido o ausente.');
        }
    }

    // 2. Obtener contexto relevante para la pregunta
    const context = await getContextForAI(userId, message);

    // 3. Construir el historial y el prompt para la IA
    const chatHistory = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }));
    
    chatHistory.unshift({
        role: 'user',
        parts: [{ text: `
            Eres un asistente virtual amigable para un portal de proveedores.
            Tu nombre es "PortalFin Assistant".
            Responde de forma breve y directa a las preguntas de los usuarios.
            Usa el siguiente contexto sobre el usuario para informar tus respuestas.
            Contexto: ${context}
        `}]
    });
     chatHistory.push({ role: "user", parts: [{ text: message }] });


    // 4. Llamar a la API de Gemini
    const payload = { contents: chatHistory };
    // CAMBIO: Se utiliza la API Key desde las variables de entorno.
    const apiKey = process.env.GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const apiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
        const errorDetails = await apiResponse.json();
        console.error("Error de la API de Gemini:", errorDetails);
        const errorMessage = errorDetails.error?.message || 'La API de IA devolvió un error desconocido.';
        throw new Error(errorMessage);
    }

    const result = await apiResponse.json();
    
    const reply = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No pude procesar esa respuesta.';

    return NextResponse.json({ reply });

  } catch (error) {
    console.error('Error en la API del chat:', error);
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
