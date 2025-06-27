"use client";

import React, { useState, useRef } from 'react';
import { Upload } from 'lucide-react';

// Lista inicial de documentos requeridos para el proveedor
const initialDocuments = [
    { id: 1, name: 'Constancia de Situación Fiscal', status: 'pending', file: null },
    { id: 2, name: 'Opinión de Cumplimiento (SAT)', status: 'uploaded', file: { name: 'opinion_cumplimiento_2025.pdf' } },
    { id: 3, name: 'Identificación Oficial del Representante', status: 'pending', file: null },
    { id: 4, name: 'Comprobante de Domicilio', status: 'expired', file: null },
    { id: 5, name: 'Acta Constitutiva', status: 'pending', file: null },
];

const ProfilePage = () => {
    const [documents, setDocuments] = useState(initialDocuments);
    // Se agrega el tipo correcto para el objeto de refs
    const fileInputRefs = useRef<{[key: number]: HTMLInputElement | null}>({});

    // Maneja la selección de un archivo
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, docId: number) => {
        const file = e.target.files?.[0];
        if (file) {
            setDocuments(docs => docs.map(doc => 
                doc.id === docId ? { ...doc, status: 'uploaded', file: file } : doc
            ));
        }
    };

    // Simula un clic en el input de archivo oculto
    const handleUploadClick = (docId: number) => {
        fileInputRefs.current[docId]?.click();
    };

    // Componente para mostrar el estado de un documento
    const StatusBadge = ({ status }: { status: string }) => {
        const statusStyles: { [key: string]: string } = {
            pending: 'bg-yellow-100 text-yellow-800',
            uploaded: 'bg-green-100 text-green-800',
            expired: 'bg-red-100 text-red-800',
        };
        const statusText: { [key: string]: string } = {
            pending: 'Pendiente',
            uploaded: 'Cargado',
            expired: 'Vencido',
        };
        return (
            <span className={`px-3 py-1 text-xs font-semibold rounded-full ${statusStyles[status]}`}>
                {statusText[status]}
            </span>
        );
    };

    return (
        <div className="bg-white rounded-lg shadow-md p-8 max-w-4xl mx-auto">
            {/* Sección de Información de Usuario */}
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Perfil de Usuario</h2>
            <div className="flex items-center space-x-6">
                <img 
                    className="w-24 h-24 rounded-full object-cover border-4 border-blue-500"
                    src={`https://placehold.co/100x100/E2E8F0/4A5568?text=AV`}
                    alt="Avatar de usuario"
                />
                <div>
                    <h3 className="text-xl font-semibold text-gray-900">Juan Pérez</h3>
                    <p className="text-gray-500">juan.perez@empresa.com</p>
                    <p className="text-sm text-gray-400 mt-1">Miembro desde: 15 de Enero, 2022</p>
                </div>
            </div>

            {/* Sección de Información de la Cuenta */}
            <div className="mt-8 border-t pt-6">
                 <h4 className="text-lg font-semibold text-gray-700 mb-4">Información de la Cuenta</h4>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                         <label className="block text-sm font-medium text-gray-500">Nombre Completo</label>
                         <p className="text-gray-800">Juan Pérez García</p>
                     </div>
                     <div>
                         <label className="block text-sm font-medium text-gray-500">Rol de Usuario</label>
                         <p className="text-gray-800">Administrador de Compras</p>
                     </div>
                     <div>
                         <label className="block text-sm font-medium text-gray-500">Teléfono</label>
                         <p className="text-gray-800">+52 55 1234 5678</p>
                     </div>
                     <div>
                         <label className="block text-sm font-medium text-gray-500">Empresa</label>
                         <p className="text-gray-800">Soluciones Creativas S.A. de C.V.</p>
                     </div>
                 </div>
                 <button className="mt-6 w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                    Editar Perfil
                </button>
            </div>
            
            {/* Nueva Sección de Documentos */}
            <div className="mt-10 border-t pt-8">
                <h4 className="text-lg font-semibold text-gray-700 mb-4">Mis Documentos</h4>
                <div className="space-y-3">
                    {documents.map(doc => (
                        <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                            <div className="flex-1">
                                <p className="font-semibold text-gray-800">{doc.name}</p>
                                {doc.status === 'uploaded' && doc.file && (
                                    <p className="text-sm text-green-600 mt-1">{doc.file.name}</p>
                                )}
                            </div>
                            <div className="flex items-center space-x-4">
                                <StatusBadge status={doc.status} />
                                <input
                                    type="file"
                                    // Se ajusta la función de callback para cumplir con el tipo esperado por `ref`
                                    ref={(el) => {
                                        fileInputRefs.current[doc.id] = el;
                                    }}
                                    onChange={(e) => handleFileChange(e, doc.id)}
                                    className="hidden"
                                    accept="application/pdf"
                                />
                                <button
                                    onClick={() => handleUploadClick(doc.id)}
                                    className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                                >
                                    <Upload className="w-4 h-4 mr-2" />
                                    {doc.status === 'uploaded' ? 'Reemplazar' : 'Cargar'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
