// src/app/lib/ocr.ts

import { 
    TextractClient, 
    StartDocumentAnalysisCommand, 
    GetDocumentAnalysisCommand,
    FeatureType 
} from "@aws-sdk/client-textract";

const textractClient = new TextractClient({
    region: process.env.APP_AWS_REGION || 'us-east-2',
    credentials: {
        accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
    },
});

/**
 * Inicia un análisis asíncrono para PDFs en S3.
 * Devuelve un JobId.
 */
export async function startAsyncAnalysis(s3Key: string) {
    const params = {
        DocumentLocation: {
            S3Object: {
                Bucket: process.env.S3_BUCKET_NAME!,
                Name: s3Key,
            }
        },
        FeatureTypes: [FeatureType.FORMS, FeatureType.TABLES],
    };

    const command = new StartDocumentAnalysisCommand(params);
    const response = await textractClient.send(command);
    return response.JobId;
}

/**
 * Consulta el estado de un JobId y obtiene los resultados si terminó.
 */
export async function getAsyncResults(jobId: string) {
    const command = new GetDocumentAnalysisCommand({ JobId: jobId });
    const response = await textractClient.send(command);
    
    // Si todavía está en curso, devolvemos null o estado
    if (response.JobStatus === "IN_PROGRESS") {
        return { status: "IN_PROGRESS" };
    }

    if (response.JobStatus === "FAILED") {
        throw new Error("El análisis de Textract falló.");
    }

    // Si terminó exitosamente (SUCCEEDED)
    const keyValues = extractKeyValues(response);
    const rawText = extractRawText(response);

    return {
        status: "SUCCEEDED",
        keyValues,
        rawText
    };
}

/**
 * Función helper que hace polling (espera) hasta que el Job termina.
 * Útil si queremos dar respuesta síncrona en la API aunque el proceso sea asíncrono.
 */
export async function waitForAnalysis(jobId: string, maxRetries = 60) {
    for (let i = 0; i < maxRetries; i++) {
        const result = await getAsyncResults(jobId);
        if (result.status === "SUCCEEDED") return result;
        if (result.status === "FAILED") throw new Error("Análisis fallido.");
        
        // Esperar 2 segundos antes de reintentar
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error("Tiempo de espera agotado para el análisis del documento.");
}

/**
 * Función específica para extraer datos de una Constancia de Situación Fiscal de México.
 */
export function processCfsResults(results: any) {
    const text = results.rawText.toUpperCase();
    const lines = results.rawText.split('\n').map((l: string) => l.trim().toUpperCase());
    

    // 1. Extraer RFC: Buscamos el patrón estándar de 12 o 13 caracteres
    const rfcMatch = text.match(/([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/);
    const rfc = rfcMatch ? rfcMatch[1] : null;

    // 2. Extraer Razón Social / Nombre
    let companyName = "";

    // Novedad: Intento 0 - Buscar explicitamente Nombre(s), Primer Apellido, Segundo Apellido (Tabla de Persona Física)
    const findLineAfter = (label: string) => {
        const index = lines.findIndex(l => l.includes(label));
        return index !== -1 && index + 1 < lines.length ? lines[index + 1] : "";
    };

    const hasPhysicalPersonFields = lines.some(l => l.includes('PRIMER APELLIDO'));
    
    if (hasPhysicalPersonFields) {
        // En los PDFs del SAT, el valor suele estar en la línea inmediatamente inferior al label
        const nombres = findLineAfter("NOMBRE (S):");
        const apellido1 = findLineAfter("PRIMER APELLIDO:");
        const apellido2 = findLineAfter("SEGUNDO APELLIDO:");

        if (nombres || apellido1) {
            companyName = `${nombres} ${apellido1} ${apellido2}`.trim().replace(/\s+/g, ' ');
            console.log("Nombre extraído vía formato de Persona Física (Tabla):", companyName);
        }
    }

    // Intento A: Si es persona moral (Denominación/Razón Social), usualmente no tienen "Primer Apellido"
    if (!companyName) {
        const nameMatch = text.match(/DENOMINACI[OÓ]N\/RAZ[OÓ]N SOCIAL:\s*([^]*?)(?=R[EÉ]GIMEN|CURP|$)/i);
        if (nameMatch && nameMatch[1].length > 5) {
            companyName = nameMatch[1].trim().replace(/\n/g, ' ');
            console.log("Nombre extraído vía Regex Persona Moral:", companyName);
        } 
    }

    // Intento B: Cédula CIF (Fallback)
    if (!companyName) {
        const targetLabel = "NOMBRE, DENOMINACIÓN O RAZÓN SOCIAL";
        const labelIndex = lines.findIndex(l => l.includes(targetLabel));
        
        if (labelIndex > 0) {
            companyName = lines[labelIndex - 1];
            if (rfc && companyName.includes(rfc)) {
                companyName = lines[labelIndex - 2] || companyName;
            }
            console.log("Nombre extraído vía Fallback CIF (Cédula):", companyName);
        }
    }

    // Limpieza final del nombre
    companyName = companyName
        .replace(/DENOMINACI[OÓ]N\/RAZ[OÓ]N SOCIAL:?/i, '')
        .replace(/CURP:?.*/i, '')
        .trim();

    return {
        rfc,
        companyName: companyName || null,
        isCfs: text.includes("CONSTANCIA DE SITUACIÓN FISCAL") || text.includes("IDENTIFICACIÓN FISCAL")
    };
}

/**
 * Extrae datos específicos de la Opinión de Cumplimiento a partir del resultado de un Job.
 */
export function processOpinionResults(results: any) {
    const text = results.rawText.toUpperCase();
    const lines = results.rawText.split('\n').map((l: string) => l.trim().toUpperCase());

    // 1. Extraer RFC
    const rfcMatch = text.match(/([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/);
    const rfc = rfcMatch ? rfcMatch[1] : null;

    // 2. Determinar si es Positiva o Negativa
    // Normalmente la carta dice "sentido POSITIVA" o "Sentido POSITIVO"
    let isPositive = false;
    let isNegative = false;

    if (text.includes("POSITIVA") || text.includes("POSITIVO")) {
        isPositive = true;
    }
    if (text.match(/\bNEGATIVA\b/) || text.match(/\bNEGATIVO\b/)) {
        isNegative = true;
        // Si tiene ambas, se considera negativa por seguridad
        isPositive = false;
    }

    // 3. Extraer Nombre o Razón Social (A menudo debajo de "Nombre, Denominación o Razón Social:")
    let companyName = "";
    
    // Buscar la etiqueta del nombre
    const nameLabelIndex = lines.findIndex(l => l.includes("NOMBRE, DENOMINACIÓN O RAZÓN SOCIAL") || l.includes("NOMBRE, DENOMINACION O RAZON SOCIAL"));
    if (nameLabelIndex !== -1 && nameLabelIndex + 1 < lines.length) {
        // Podría estar abajo
        companyName = lines[nameLabelIndex + 1];
        if (rfc && companyName.includes(rfc)) {
            // A veces el RFC aparece abajo, entonces está arriba
            companyName = lines[nameLabelIndex - 1] || "";
        }
    } else {
        // Fallback genérico: el nombre suele estar muy cerca del RFC en el documento
        const rfcIndex = lines.findIndex(l => rfc && l.includes(rfc));
        if (rfcIndex > 0) {
            companyName = lines[rfcIndex - 1]; // Suele estar justo arriba
            if (companyName.includes("RFC") || companyName.includes("CLAVE DE REGISTRO")) {
                companyName = lines[rfcIndex + 1]; // O justo abajo
            }
        }
    }

    companyName = companyName
        .replace(/RFC:?.*/i, '')
        .replace(/FOLIO:?.*/i, '')
        .trim();

    // 4. Extraer Fecha (Ej. 17 DE MARZO DE 2026)
    const dateMatch = text.match(/(\d{1,2})\s+DE\s+([A-Z]+)\s+DE\s+(\d{4})/);
    let emissionDate: string | null = null;
    let isExpired = false;

    if (dateMatch) {
        const day = parseInt(dateMatch[1], 10);
        const monthName = dateMatch[2];
        const year = parseInt(dateMatch[3], 10);
        
        const months: Record<string, number> = {
            "ENERO": 0, "FEBRERO": 1, "MARZO": 2, "ABRIL": 3, "MAYO": 4, "JUNIO": 5, 
            "JULIO": 6, "AGOSTO": 7, "SEPTIEMBRE": 8, "OCTUBRE": 9, "NOVIEMBRE": 10, "DICIEMBRE": 11
        };

        if (months[monthName] !== undefined) {
            const dateObj = new Date(year, months[monthName], day);
            // Formatear para mostrar en UI (ej. YYYY-MM-DD o string legible)
            emissionDate = `${day} de ${monthName.charAt(0) + monthName.slice(1).toLowerCase()} del ${year}`;
            
            // Validar si tiene más de 30 días
            const today = new Date();
            const diffTime = today.getTime() - dateObj.getTime(); // Positivo si es en el pasado
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            // Si tiene más de 30 días de antigüedad, consideramos que está expirada
            if (diffDays > 30) {
                isExpired = true;
            }
        }
    }

    return {
        rfc,
        companyName: companyName || null,
        status: isPositive ? 'POSITIVO' : (isNegative ? 'NEGATIVO' : 'DESCONOCIDO'),
        emissionDate,
        isExpired,
        isOpinion: text.includes("OPINIÓN DEL CUMPLIMIENTO") || text.includes("OPINION DEL CUMPLIMIENTO")
    };
}

/**
 * Extrae datos de la Identificación Oficial (INE / Pasaporte)
 */
export function processIDResults(results: any) {
    const text = results.rawText.toUpperCase();
    
    // 1. Identificar tipo (INE / Pasaporte)
    let idType = 'DESCONOCIDO';
    if (text.includes('INSTITUTO NACIONAL ELECTORAL') || text.includes('CREDENCIAL PARA VOTAR') || text.includes('INSTITUTO FEDERAL ELECTORAL')) {
        idType = 'INE / IFE';
    } else if (text.includes('PASAPORTE') || text.includes('SECRETARIA DE RELACIONES EXTERIORES') || text.includes('SECRETARÍA DE RELACIONES EXTERIORES')) {
        idType = 'PASAPORTE';
    }

    // 2. Extraer CURP (RegEx de 18 Caracteres Oficial)
    const curpMatch = text.match(/([A-Z][AEIOUX][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d)/);
    const curp = curpMatch ? curpMatch[1] : null;

    // 3. Extraer Vigencia / Año (Para INE, suele decir "VIGENCIA 2030")
    let expirationYear = null;
    let isExpired = false;
    
    const vigenciaMatch = text.match(/VIGENCIA\s*(\d{4})/);
    if (vigenciaMatch) {
       expirationYear = parseInt(vigenciaMatch[1], 10);
       const currentYear = new Date().getFullYear();
       if (expirationYear < currentYear) {
           isExpired = true;
       }
    }

    return {
        idType,
        curp,
        expirationYear,
        isExpired,
        isValidDocument: idType !== 'DESCONOCIDO' || curp !== null, // Si encontramos INE/Pasaporte o al menos un CURP
        rawText: text
    };
}

/**
 * Extrae datos del Comprobante de Domicilio
 */
export function processAddressResults(results: any) {
    const text = results.rawText.toUpperCase();
    
    // 1. Identificar Proveedor
    let provider = 'DESCONOCIDO';
    if (text.match(/CFE|COMISION FEDERAL DE ELECTRICIDAD/)) provider = 'CFE (Electricidad)';
    else if (text.match(/TELMEX|TELEFONOS DE MEXICO/)) provider = 'Telmex (Telefonía)';
    else if (text.match(/IZZI|TOTALPLAY|MEGACABLE|TELCEL|AT&T/)) provider = 'Telecomunicaciones';
    else if (text.match(/AGUA|JUMAPA|SIAPA|CESPT|SADM/)) provider = 'Servicio de Agua';
    else if (text.match(/BANCOMER|BBVA|BANAMEX|CITIBANAMEX|SANTANDER|HSBC|BANORTE|SCOTIABANK|INBURSA/)) provider = 'Estado de Cuenta Bancario';

    // 2. Intentar buscar una fecha referencial
    let isExpired = false;
    let detectedDateStr = null;
    
    const currentYear = new Date().getFullYear();
    const dateMatch = text.match(/([0-9]{1,2})?\s*(?:DE|-|\/)?\s*(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE|ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s*(?:DE|-|\/)?\s*([0-9]{4})/);
    
    if (dateMatch) {
        detectedDateStr = dateMatch[0].trim();
        const yearFound = parseInt(dateMatch[3], 10);
        // Si es comprobadamente menor a hace 1 año, sugerimos rechazo riguroso.
        if (yearFound < currentYear - 1) {
            isExpired = true;
        }
    }

    return {
        provider,
        detectedDateStr,
        isExpired,
        isValidDocument: provider !== 'DESCONOCIDO',
        rawText: text
    };
}

/**
 * Extrae datos del Acta Constitutiva
 */
export function processActaResults(results: any) {
    const text = results.rawText.toUpperCase();
    
    // 1. Identificar si es un documento notarial
    let isValidDocument = false;
    if (text.includes('ESCRITURA') || text.includes('NOTARIO') || text.includes('NOTARIA') || text.includes('ACTA CONSTITUTIVA') || text.includes('POLIZA')) {
        isValidDocument = true;
    }
    
    return {
        isValidDocument,
        isNotarial: isValidDocument,
        rawText: text
    };
}

// --- Helpers de Extracción idénticos a los anteriores ---

function extractRawText(response: any): string {
    if (!response.Blocks) return "";
    return response.Blocks
        .filter((block: any) => block.BlockType === "LINE")
        .map((block: any) => block.Text)
        .join("\n");
}

function extractKeyValues(response: any) {
    const blocks = response.Blocks;
    const keyMap: any = {};
    const valueMap: any = {};
    const blockMap: any = {};

    blocks.forEach((block: any) => {
        blockMap[block.Id] = block;
        if (block.BlockType === "KEY_VALUE_SET") {
            if (block.EntityTypes.includes("KEY")) {
                keyMap[block.Id] = block;
            } else {
                valueMap[block.Id] = block;
            }
        }
    });

    const kvPairs: any = {};
    Object.values(keyMap).forEach((keyBlock: any) => {
        const valueBlock = findValueBlock(keyBlock, valueMap);
        const key = getText(keyBlock, blockMap);
        const value = getText(valueBlock, blockMap);
        if (key) kvPairs[key] = value;
    });

    return kvPairs;
}

function findValueBlock(keyBlock: any, valueMap: any) {
    let valueBlock: any = null;
    keyBlock.Relationships?.forEach((rel: any) => {
        if (rel.Type === "VALUE") {
            rel.Ids.forEach((id: string) => {
                valueBlock = valueMap[id];
            });
        }
    });
    return valueBlock;
}

function getText(result: any, blockMap: any) {
    let text = "";
    if (result?.Relationships) {
        result.Relationships.forEach((rel: any) => {
            if (rel.Type === "CHILD") {
                rel.Ids.forEach((id: string) => {
                    const word = blockMap[id];
                    if (word.BlockType === "WORD") {
                        text += word.Text + " ";
                    }
                });
            }
        });
    }
    return text.trim();
}
