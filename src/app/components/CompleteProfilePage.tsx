// app/components/CompleteProfilePage.tsx

"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle, Upload, CheckCircle, XCircle, Clock, ArrowLeft } from 'lucide-react';

const DocumentRow = ({ doc, onFileSelect }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const statusInfo = {
    PENDING: { text: 'Pendiente', icon: Clock, color: 'text-yellow-500' },
    UPLOADED: { text: 'Cargado', icon: CheckCircle, color: 'text-blue-500' },
    APPROVED: { text: 'Aprobado', icon: CheckCircle, color: 'text-green-500' },
    REJECTED: { text: 'Rechazado', icon: XCircle, color: 'text-red-500' },
  };
  const currentStatus = statusInfo[doc.status] || statusInfo.PENDING;
  const Icon = currentStatus.icon;

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
      <div>
        <p className="font-semibold text-gray-800">{doc.displayName}</p>
        {doc.fileName && <p className="text-sm text-gray-500 mt-1">{doc.fileName}</p>}
      </div>
      <div className="flex items-center space-x-4">
        <span className={`flex items-center text-sm font-semibold ${currentStatus.color}`}>
          <Icon className="w-4 h-4 mr-2" />
          {currentStatus.text}
        </span>
        <input type="file" ref={fileInputRef} onChange={(e) => onFileSelect(e, doc.type)} className="hidden" accept="application/pdf" />
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-300">
          <Upload className="w-4 h-4 mr-2" />
          {doc.status === 'PENDING' ? 'Cargar' : 'Reemplazar'}
        </button>
      </div>
    </div>
  );
};

const CompleteProfilePage = ({ supplierProfileId, onBackToLogin }) => {
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requiredDocuments = [
    { type: 'CONSTANCIA_SITUACION_FISCAL', displayName: 'Constancia de Situación Fiscal' },
    { type: 'OPINION_CUMPLIMIENTO_SAT', displayName: 'Opinión de Cumplimiento (SAT)' },
    { type: 'IDENTIFICACION_OFICIAL', displayName: 'Identificación Oficial del Representante' },
    { type: 'COMPROBANTE_DOMICILIO', displayName: 'Comprobante de Domicilio' },
    { type: 'ACTA_CONSTITUTIVA', displayName: 'Acta Constitutiva' },
  ];

  const fetchProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/suppliers/${supplierProfileId}`);
      if (!response.ok) throw new Error('No se pudo cargar tu perfil.');
      const data = await response.json();
      setProfile(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (supplierProfileId) {
      fetchProfile();
    }
  }, [supplierProfileId]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, documentType: string) => {
    // Esta función requiere un token, pero el usuario no está logueado.
    // Para una app real, se necesitaría un token temporal (como el que se envió por correo).
    // Por ahora, mostraremos una alerta.
    alert("La carga de archivos en esta página requiere una implementación de token temporal.");
  };

  const documentsToShow = profile ? requiredDocuments.map(reqDoc => {
    const uploadedDoc = profile.documents?.find(doc => doc.documentType === reqDoc.type);
    return { ...reqDoc, status: uploadedDoc?.status || 'PENDING', fileName: uploadedDoc?.fileName || null };
  }) : [];

  if (isLoading) return <div className="flex justify-center items-center h-screen"><Loader2 className="w-16 h-16 text-blue-600 animate-spin" /></div>;
  if (error) return <div className="text-red-600 text-center p-4">{error}</div>;
  if (!profile) return <div className="text-center p-4">No se encontraron datos del perfil.</div>;

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-8 m-4">
        <h2 className="text-3xl font-bold text-gray-800">Completar Registro</h2>
        <p className="text-gray-500 mt-2">Tu cuenta está pendiente de aprobación. Por favor, asegúrate de haber subido todos los documentos requeridos.</p>
        
        <div className="mt-8 border-t pt-8">
            <h4 className="text-lg font-semibold text-gray-700 mb-4">Estado de tus Documentos</h4>
            <div className="space-y-3">
                {documentsToShow.map(doc => (
                    <DocumentRow key={doc.type} doc={doc} onFileSelect={handleFileSelect} />
                ))}
            </div>
        </div>

        <div className="text-center mt-8">
            <button onClick={onBackToLogin} className="text-sm text-blue-600 hover:underline flex items-center justify-center mx-auto">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Volver
            </button>
        </div>
      </div>
    </div>
  );
};

export default CompleteProfilePage;
