import React from 'react';
import { Download, FileText } from 'lucide-react';

const docs = [
    {
        title: 'Manual de Usuario',
        description: 'Guía completa sobre cómo utilizar todas las funcionalidades del portal de proveedores: registro, carga de documentos, facturas y más.',
        file: '/docs/manual-usuario.pdf',
        label: 'Descargar Manual',
    },
    {
        title: 'Políticas de Facturación',
        description: 'Información importante sobre los procesos y políticas para la emisión, recepción y validación de facturas en el portal.',
        file: '/docs/politicas-facturacion.pdf',
        label: 'Descargar Políticas',
    },
];

const guides = [
    {
        title: 'Guía: Órdenes de Compra',
        description: 'Cómo consultar, descargar y gestionar tus órdenes de compra asignadas.',
        file: '/docs/guia-ordenes-de-compra.pdf',
    },
    {
        title: 'Guía: Facturas',
        description: 'Cómo cargar una factura (XML + PDF), validar el CFDI y consultar el estado de sincronización.',
        file: '/docs/guia-facturas.pdf',
    },
    {
        title: 'Guía: Complemento de Pago',
        description: 'Cómo generar y subir un complemento de pago asociado a una factura existente.',
        file: '/docs/guia-complemento-pago.pdf',
    },
];

const DocumentationPage = () => (
    <div className="bg-white rounded-lg shadow-md p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Documentación y Recursos</h2>
        <p className="text-gray-500 mb-8">Descarga los manuales y guías rápidas para sacar el máximo provecho del portal.</p>

        {/* Documentos principales */}
        <div className="space-y-4 mb-10">
            {docs.map(doc => (
                <div key={doc.file} className="flex items-start justify-between p-5 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors">
                    <div className="flex items-start gap-4">
                        <div className="p-2 bg-blue-50 rounded-lg shrink-0">
                            <FileText className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-800">{doc.title}</h3>
                            <p className="text-sm text-gray-500 mt-0.5">{doc.description}</p>
                        </div>
                    </div>
                    <a
                        href={doc.file}
                        download
                        className="ml-6 shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        {doc.label}
                    </a>
                </div>
            ))}
        </div>

        {/* Guías rápidas */}
        <h3 className="text-lg font-semibold text-gray-700 mb-4 border-t pt-6">Guías Rápidas</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {guides.map(guide => (
                <a
                    key={guide.file}
                    href={guide.file}
                    download
                    className="group flex flex-col p-5 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
                >
                    <div className="p-2 bg-indigo-50 rounded-lg w-fit mb-3">
                        <FileText className="w-5 h-5 text-indigo-600" />
                    </div>
                    <h4 className="font-semibold text-gray-800 mb-1 group-hover:text-blue-700 transition-colors">{guide.title}</h4>
                    <p className="text-sm text-gray-500 flex-1">{guide.description}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 group-hover:text-blue-800">
                        <Download className="w-3.5 h-3.5" /> Descargar PDF
                    </span>
                </a>
            ))}
        </div>
    </div>
);

export default DocumentationPage;
