// app/components/ProfilePage.tsx

"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle, Upload, CheckCircle, XCircle, Clock } from 'lucide-react';

// --- Componente para una fila de documento ---
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
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => onFileSelect(e, doc.type)}
          className="hidden"
          accept="application/pdf"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-300"
        >
          <Upload className="w-4 h-4 mr-2" />
          {doc.status === 'PENDING' ? 'Cargar' : 'Reemplazar'}
        </button>
      </div>
    </div>
  );
};


// --- Componente Principal de la Página de Perfil ---
const ProfilePage = () => {
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async () => {
    setIsLoading(true);
    setError(null);
    const token = localStorage.getItem('token');

    if (!token) {
      setError("No estás autenticado.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/profile', {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'No se pudo cargar el perfil.');
      }
      
      const data = await response.json();
      setProfile(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, documentType: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', documentType);

    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al subir el archivo.');
      }
      
      fetchProfile();

    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // --- CORRECCIÓN: La lógica de los documentos se mueve dentro de su propia sección ---
  const renderDocumentsSection = () => {
    if (!profile || profile.role !== 'SUPPLIER' || !profile.supplierProfile) {
        return null;
    }

    const requiredDocuments = [
        { type: 'CONSTANCIA_SITUACION_FISCAL', displayName: 'Constancia de Situación Fiscal' },
        { type: 'OPINION_CUMPLIMIENTO_SAT', displayName: 'Opinión de Cumplimiento (SAT)' },
        { type: 'IDENTIFICACION_OFICIAL', displayName: 'Identificación Oficial del Representante' },
        { type: 'COMPROBANTE_DOMICILIO', displayName: 'Comprobante de Domicilio' },
        { type: 'ACTA_CONSTITUTIVA', displayName: 'Acta Constitutiva' },
    ];

    const documentsToShow = requiredDocuments.map(reqDoc => {
        const uploadedDoc = profile.supplierProfile.documents?.find(doc => doc.documentType === reqDoc.type);
        return {
          ...reqDoc,
          status: uploadedDoc?.status || 'PENDING',
          fileName: uploadedDoc?.fileName || null,
        };
    });

    return (
        <div className="mt-10 border-t pt-8">
            <h4 className="text-lg font-semibold text-gray-700 mb-4">Mis Documentos</h4>
            <div className="space-y-3">
                {documentsToShow.map(doc => (
                    <DocumentRow key={doc.type} doc={doc} onFileSelect={handleFileSelect} />
                ))}
            </div>
        </div>
    );
  };

  if (isLoading) return <div className="flex justify-center items-center h-96"><Loader2 className="w-16 h-16 text-blue-600 animate-spin" /></div>;
  if (error) return <div className="bg-red-100 text-red-700 p-4 rounded-md text-center">{error}</div>;
  if (!profile) return <div className="text-center">No se encontraron datos del perfil.</div>;

  return (
    <div className="bg-white rounded-lg shadow-md p-8 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Perfil de Usuario</h2>
      <div className="flex items-center space-x-6">
        <img className="w-24 h-24 rounded-full object-cover border-4 border-blue-500" src={profile.image || `https://placehold.co/100x100/E2E8F0/4A5568?text=${profile.name?.charAt(0)}`} alt="Avatar de usuario" />
        <div>
          <h3 className="text-xl font-semibold text-gray-900">{profile.name}</h3>
          <p className="text-gray-500">{profile.email}</p>
          <p className="text-sm text-gray-400 mt-1">Miembro desde: {new Date(profile.createdAt).toLocaleDateString('es-MX')}</p>
        </div>
      </div>

      <div className="mt-8 border-t pt-6">
        <h4 className="text-lg font-semibold text-gray-700 mb-4">Información de la Cuenta</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {profile.role === 'SUPPLIER' && profile.supplierProfile ? (
            <>
              <div><label className="block text-sm font-medium text-gray-500">Razón Social</label><p className="text-gray-800">{profile.supplierProfile.companyName}</p></div>
              <div><label className="block text-sm font-medium text-gray-500">RFC</label><p className="text-gray-800">{profile.supplierProfile.rfc}</p></div>
              <div className="col-span-2"><label className="block text-sm font-medium text-gray-500">Dirección Fiscal</label><p className="text-gray-800">{profile.supplierProfile.taxAddress}</p></div>
              {profile.supplierProfile.subsidiary && (
                <div><label className="block text-sm font-medium text-gray-500">Subsidiaria Asignada</label><p className="text-gray-800">{profile.supplierProfile.subsidiary.name}</p></div>
              )}
              <div><label className="block text-sm font-medium text-gray-500">Estado de la Cuenta</label><p className={`font-semibold ${profile.supplierProfile.status === 'ACTIVE' ? 'text-green-600' : 'text-yellow-600'}`}>{profile.supplierProfile.status}</p></div>
            </>
          ) : (
            <div><label className="block text-sm font-medium text-gray-500">Rol</label><p className="text-gray-800">{profile.role}</p></div>
          )}
        </div>
        <button className="mt-8 w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
          Editar Perfil
        </button>
      </div>

      {/* Se llama a la nueva función para renderizar la sección de documentos */}
      {renderDocumentsSection()}
    </div>
  );
};

export default ProfilePage;
