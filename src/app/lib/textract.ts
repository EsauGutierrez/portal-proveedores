import { TextractClient, DetectDocumentTextCommand, AnalyzeDocumentCommand, FeatureType } from "@aws-sdk/client-textract";

const textractClient = new TextractClient({
    region: process.env.APP_AWS_REGION || 'us-east-2',
    credentials: {
        accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
    },
});

export const extractTextFromDocument = async (fileBuffer: Buffer) => {
    try {
        const command = new DetectDocumentTextCommand({
            Document: {
                Bytes: fileBuffer,
            },
        });

        const response = await textractClient.send(command);

        // Concatenar todo el texto detectado
        let fullText = '';
        if (response.Blocks) {
            response.Blocks.forEach(block => {
                if (block.BlockType === 'LINE' && block.Text) {
                    fullText += block.Text + '\n';
                }
            });
        }

        return fullText;
    } catch (error) {
        console.error("Error OCR con Textract:", error);
        throw new Error("No se pudo extraer texto del documento utilizando el motor OCR.");
    }
};

export const analyzeDocumentData = async (fileBuffer: Buffer) => {
    try {
        const command = new AnalyzeDocumentCommand({
            Document: {
                Bytes: fileBuffer,
            },
            FeatureTypes: [FeatureType.FORMS, FeatureType.TABLES],
        });

        const response = await textractClient.send(command);
        return response.Blocks;
    } catch (error) {
        console.error("Error AnalyzeDocument con Textract:", error);
        throw new Error("No se pudo analizar la estructura del documento con OCR.");
    }
};
