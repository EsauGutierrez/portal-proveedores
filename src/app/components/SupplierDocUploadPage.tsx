"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle, FileText, AlertCircle, ArrowRight } from 'lucide-react';

<<<<<<< HEAD
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) return `El archivo no puede superar los ${MAX_FILE_SIZE_MB} MB.`;
  if (!ALLOWED_TYPES.has(file.type)) return 'Solo se aceptan archivos PDF, JPG o PNG.';
  return null;
}

=======
>>>>>>> 3707048 (feat: agregar gestión de documentos por tipo de proveedor)
const SupplierDocUploadPage = ({ onDocumentsUploaded }: { user: any; onDocumentsUploaded: () => void }) => {
    const [docRequirements, setDocRequirements] = useState<any[]>([]);
    const [uploadedDocs, setUploadedDocs] = useState<Record<string, 'idle' | 'uploading' | 'done' | 'error'>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [globalError, setGlobalError] = useState('');

    useEffect(() => {
        const fetchRequirements = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/settings/documents', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error('No se pudieron cargar los documentos requeridos.');
                const data = await res.json();
                const required = data.filter((d: any) => d.isRequired);
                setDocRequirements(required);
                const initial: Record<string, 'idle'> = {};
                required.forEach((d: any) => { initial[d.documentType] = 'idle'; });
                setUploadedDocs(initial);
            } catch (err: any) {
                setGlobalError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchRequirements();
    }, []);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, documentType: string) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';

        const fileError = validateFile(file);
        if (fileError) {
            setGlobalError(fileError);
            return;
        }
        setGlobalError('');

        setUploadedDocs(prev => ({ ...prev, [documentType]: 'uploading' }));

        try {
            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('file', file);
            formData.append('documentType', documentType);

            const res = await fetch('/api/documents', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
            });

            if (!res.ok) throw new Error('Error al subir el documento.');
            setUploadedDocs(prev => ({ ...prev, [documentType]: 'done' }));
        } catch {
            setUploadedDocs(prev => ({ ...prev, [documentType]: 'error' }));
        }
        // Reset input to allow re-upload
        e.target.value = '';
    };

    const allRequired = docRequirements.filter(d => d.isRequired);
    const allUploaded = allRequired.length > 0 && allRequired.every(d => uploadedDocs[d.documentType] === 'done');

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-8">
                {/* Logo */}
                <div className="flex justify-center mb-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo-imr.png" alt="IMR" className="h-10 w-auto object-contain" />
                </div>

                <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <FileText className="w-6 h-6 text-blue-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-800">Documentación requerida</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Para completar tu registro, sube los siguientes documentos. Puedes continuar al subir todos los requeridos.
                    </p>
                </div>

                {globalError && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {globalError}
                    </div>
                )}

                <div className="space-y-3 mb-6">
                    {docRequirements.map((doc) => {
                        const state = uploadedDocs[doc.documentType] ?? 'idle';
                        const label = doc.name || doc.documentType;

                        return (
                            <div
                                key={doc.documentType}
                                className={`flex items-center justify-between p-3 rounded-lg border-2 transition-colors ${
                                    state === 'done' ? 'border-green-300 bg-green-50'
                                    : state === 'error' ? 'border-red-300 bg-red-50'
                                    : 'border-gray-200 bg-gray-50'
                                }`}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    {state === 'done' ? (
                                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                                    ) : state === 'uploading' ? (
                                        <Loader2 className="w-5 h-5 text-blue-500 flex-shrink-0 animate-spin" />
                                    ) : state === 'error' ? (
                                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                    ) : (
                                        <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                                    )}
                                    <span className={`text-sm font-medium truncate ${state === 'done' ? 'text-green-800' : 'text-gray-700'}`}>
                                        {label}
                                    </span>
                                </div>

                                <label className={`ml-3 flex-shrink-0 cursor-pointer px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                    state === 'done' ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                    : state === 'uploading' ? 'bg-gray-100 text-gray-400 pointer-events-none'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}>
                                    {state === 'done' ? 'Cambiar' : state === 'uploading' ? 'Subiendo...' : 'Subir'}
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        disabled={state === 'uploading'}
                                        onChange={(e) => handleFileChange(e, doc.documentType)}
                                    />
                                </label>
                            </div>
                        );
                    })}
                </div>

                <button
                    onClick={onDocumentsUploaded}
                    disabled={!allUploaded}
                    className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-200 disabled:text-gray-400 flex items-center justify-center gap-2"
                >
                    Continuar
                    <ArrowRight className="w-4 h-4" />
                </button>

                {!allUploaded && allRequired.length > 0 && (
                    <p className="text-center text-xs text-gray-400 mt-3">
                        Sube todos los documentos requeridos para continuar
                    </p>
                )}
            </div>
        </div>
    );
};

export default SupplierDocUploadPage;
