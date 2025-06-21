import React from 'react';
import { Paperclip } from 'lucide-react';

const DocumentationPage = () => (
    <div className="bg-white rounded-lg shadow-md p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Documentación y Recursos</h2>
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">Manual de Usuario</h3>
                <p className="text-gray-600 mb-3">Guía completa sobre cómo utilizar todas las funcionalidades del portal de clientes.</p>
                <a href="#" className="text-blue-600 hover:text-blue-800 font-medium flex items-center">
                    <Paperclip className="w-4 h-4 mr-2" /> Descargar Manual (PDF)
                </a>
            </div>
            <div className="border-t pt-6">
                <h3 className="text-xl font-semibold text-gray-700 mb-2">Políticas de Facturación</h3>
                <p className="text-gray-600 mb-3">Información importante sobre nuestros procesos y políticas para la emisión y recepción de facturas.</p>
                <a href="#" className="text-blue-600 hover:text-blue-800 font-medium flex items-center">
                   <Paperclip className="w-4 h-4 mr-2" /> Leer Políticas (Enlace)
                </a>
            </div>
            <div className="border-t pt-6">
                <h3 className="text-xl font-semibold text-gray-700 mb-2">Guías Rápidas</h3>
                <ul className="list-disc list-inside text-gray-600 space-y-2">
                    <li>Cómo subir una orden de compra.</li>
                    <li>Consultar el estado de una factura.</li>
                    <li>Generar un complemento de pago.</li>
                </ul>
            </div>
        </div>
    </div>
);

export default DocumentationPage;
