// app/components/ProfilePage.tsx

"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle, Upload, CheckCircle, XCircle, Clock, Check, X } from 'lucide-react';

// --- Componente para una fila de documento ---
const DocumentRow = ({ doc, onFileSelect, isUploading }) => {
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
          disabled={isUploading}
          className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-300 disabled:opacity-50"
        >
          {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          {isUploading ? 'Procesando...' : (doc.status === 'PENDING' ? 'Cargar' : 'Reemplazar')}
        </button>
      </div>
    </div>
  );
};

// --- Componente Modal para Resultados de OCR ---
const OcrResultModal = ({ isOpen, onClose, config, currentProfile, isEditing, onApplyData }) => {
  if (!isOpen) return null;

  const ocrData = config.data || {};
  const isMatch = config.isMatch;
  const wasRejected = config.wasRejected; // True si el documento fue eliminado
  const documentType = config.documentType; // CONSTANCIA_SITUACION_FISCAL | OPINION_CUMPLIMIENTO_SAT

  const extractedRfc = ocrData.rfc || '';
  const extractedName = ocrData.companyName || '';
  const extractedStatus = ocrData.status || '';
  const targetRfc = currentProfile.rfc || '';
  const targetName = currentProfile.companyName || '';

  // Mensajes de rechazo específicos
  let rejectionMessage = 'Los datos del documento no coinciden con tu Perfil. El archivo no fue almacenado y permanece como pendiente.';
  if (documentType === 'OPINION_CUMPLIMIENTO_SAT' && extractedStatus === 'NEGATIVO') {
    rejectionMessage = 'La Opinión de Cumplimiento detectada es NEGATIVA. Debes regularizar tu situación fiscal. El archivo no fue almacenado.';
  } else if (documentType === 'OPINION_CUMPLIMIENTO_SAT' && ocrData.isExpired) {
    rejectionMessage = `La Opinión de Cumplimiento tiene más de 30 días de antigüedad (Expedida el: ${ocrData.emissionDate || 'Desconocido'}). El archivo no fue almacenado.`;
  } else if (documentType === 'OPINION_CUMPLIMIENTO_SAT' && extractedRfc !== targetRfc) {
    rejectionMessage = 'El RFC de la Opinión de Cumplimiento no coincide con tu perfil. El archivo no fue almacenado.';
  } else if (documentType === 'IDENTIFICACION_OFICIAL') {
    if (!ocrData.isValidDocument) {
      rejectionMessage = 'El documento no fue reconocido como una Identificación Oficial válida (INE o Pasaporte mexicano).';
    } else if (ocrData.isExpired) {
      rejectionMessage = `La identificación oficial ha expirado (Vigencia/Caducidad: ${ocrData.expirationYear}). El documento fue rechazado.`;
    }
  } else if (documentType === 'COMPROBANTE_DOMICILIO') {
    if (!ocrData.isValidDocument) {
      rejectionMessage = 'El documento no parece ser un comprobante de domicilio válido (CFE, Telmex, Banco, etc.).';
    } else if (ocrData.isExpired) {
      rejectionMessage = 'El comprobante de domicilio parece tener más de un año de antigüedad. Se requiere uno preferentemente de los últimos 3 meses.';
    }
  } else if (documentType === 'ACTA_CONSTITUTIVA') {
    if (!ocrData.isValidDocument) {
      rejectionMessage = 'El documento no parece contener sellos o etiquetas de una Escritura o Acta Constitutiva notariada.';
    } else if (!isMatch) {
      rejectionMessage = `La razón social registrada de tu perfil ("${targetName}") no se encontró de manera legible en el Acta.`;
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className={`p-6 ${isMatch ? 'bg-green-50' : 'bg-red-50'} border-b flex flex-col items-center justify-center text-center`}>
          {isMatch ? (
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
          ) : (
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
          )}
          <h3 className="text-xl font-bold text-gray-900">
            {isMatch ? 'Validación Exitosa' : 'Validación Rechazada'}
          </h3>
          <p className={`text-sm mt-2 ${isMatch ? 'text-green-700' : 'text-red-700'}`}>
            {isMatch 
              ? 'Los datos de la constancia coinciden perfectamente con tu perfil.' 
              : wasRejected 
                ? rejectionMessage 
                : 'Se detectaron datos válidos para completar tu perfil inicial.'}
          </p>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 space-y-3">
            <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Datos Detectados (OCR)</h4>
            {documentType !== 'IDENTIFICACION_OFICIAL' && documentType !== 'COMPROBANTE_DOMICILIO' && documentType !== 'ACTA_CONSTITUTIVA' && (
              <div>
                <p className="text-xs text-gray-500">RFC</p>
                <p className="font-semibold text-gray-800 flex items-center">
                  {extractedRfc || 'No detectado'} 
                  {extractedRfc && !isMatch && !targetRfc.startsWith('INVITE-') && <XCircle className="w-4 h-4 ml-2 text-red-500" />}
                  {extractedRfc && extractedRfc === targetRfc && <CheckCircle className="w-4 h-4 ml-2 text-green-500" />}
                </p>
              </div>
            )}
            {documentType === 'CONSTANCIA_SITUACION_FISCAL' && (
              <div>
                <p className="text-xs text-gray-500">Razón Social</p>
                <p className="font-semibold text-gray-800">{extractedName || 'No detectada'}</p>
              </div>
            )}
            {documentType === 'OPINION_CUMPLIMIENTO_SAT' && (
              <>
                <div>
                  <p className="text-xs text-gray-500">Sentido de la Opinión</p>
                  <p className={`font-semibold text-gray-800 flex items-center`}>
                    {extractedStatus || 'Desconocido'}
                    {extractedStatus === 'POSITIVO' && <CheckCircle className="w-4 h-4 ml-2 text-green-500" />}
                    {extractedStatus === 'NEGATIVO' && <XCircle className="w-4 h-4 ml-2 text-red-500" />}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Antigüedad (Expedición)</p>
                  <p className={`font-semibold text-gray-800 flex items-center`}>
                    {ocrData.emissionDate || 'No detectada'}
                    {ocrData.emissionDate && !ocrData.isExpired && <CheckCircle className="w-4 h-4 ml-2 text-green-500" />}
                    {ocrData.isExpired && <XCircle className="w-4 h-4 ml-2 text-red-500" />}
                  </p>
                </div>
              </>
            )}
            {documentType === 'IDENTIFICACION_OFICIAL' && (
              <>
                <div>
                  <p className="text-xs text-gray-500">Tipo de Documento</p>
                  <p className={`font-semibold text-gray-800 flex items-center`}>
                    {ocrData.idType || 'No detectado'}
                    {ocrData.isValidDocument ? <CheckCircle className="w-4 h-4 ml-2 text-green-500" /> : <XCircle className="w-4 h-4 ml-2 text-red-500" />}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">CURP (Detectado)</p>
                  <p className={`font-semibold text-gray-800`}>
                    {ocrData.curp || 'No detectado en la imagen'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Vigencia</p>
                  <p className={`font-semibold text-gray-800 flex items-center`}>
                    {ocrData.expirationYear || 'No detectada / Permanente'}
                    {ocrData.expirationYear && !ocrData.isExpired && <CheckCircle className="w-4 h-4 ml-2 text-green-500" />}
                    {ocrData.isExpired && <XCircle className="w-4 h-4 ml-2 text-red-500" />}
                  </p>
                </div>
              </>
            )}
            {documentType === 'COMPROBANTE_DOMICILIO' && (
              <>
                <div>
                  <p className="text-xs text-gray-500">Proveedor Detectado</p>
                  <p className={`font-semibold text-gray-800 flex items-center`}>
                    {ocrData.provider || 'Desconocido'}
                    {ocrData.isValidDocument ? <CheckCircle className="w-4 h-4 ml-2 text-green-500" /> : <XCircle className="w-4 h-4 ml-2 text-red-500" />}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Antigüedad (Referencia)</p>
                  <p className={`font-semibold text-gray-800 flex items-center`}>
                    {ocrData.detectedDateStr || 'No se detectó un periodo/fecha claro'}
                    {ocrData.detectedDateStr && !ocrData.isExpired && <CheckCircle className="w-4 h-4 ml-2 text-green-500" />}
                    {ocrData.isExpired && <XCircle className="w-4 h-4 ml-2 text-red-500" />}
                  </p>
                </div>
              </>
            )}
            {documentType === 'ACTA_CONSTITUTIVA' && (
              <>
                <div>
                  <p className="text-xs text-gray-500">Tipo de Documento Legal</p>
                  <p className={`font-semibold text-gray-800 flex items-center`}>
                    {ocrData.isNotarial ? 'Acta o Póliza Notarial' : 'Documento no reconocido'}
                    {ocrData.isValidDocument ? <CheckCircle className="w-4 h-4 ml-2 text-green-500" /> : <XCircle className="w-4 h-4 ml-2 text-red-500" />}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Razón Social en el Documento</p>
                  <p className={`font-semibold text-gray-800 flex items-center`}>
                    {isMatch ? targetName + ' (Coincide)' : 'No detectada la Razón Social: ' + targetName}
                    {isMatch ? <CheckCircle className="w-4 h-4 ml-2 text-green-500" /> : <XCircle className="w-4 h-4 ml-2 text-red-500" />}
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="pt-4 flex justify-end space-x-3">
            {!wasRejected && isEditing && (extractedRfc || extractedName) && !isMatch && documentType === 'CONSTANCIA_SITUACION_FISCAL' && (
              <button 
                onClick={() => {
                  onApplyData(extractedRfc, extractedName);
                  onClose();
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
              >
                Actualizar Perfil con OCR
              </button>
            )}
            <button 
              onClick={onClose} 
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


// --- Componente Modal de Error ---
const ErrorModal = ({ isOpen, message, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="p-6 bg-red-50 border-b flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-3">
            <AlertCircle className="w-7 h-7 text-red-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">Ocurrió un error</h3>
        </div>
        <div className="p-6">
          <p className="text-gray-700 text-sm text-center">{message}</p>
          <div className="mt-6 flex justify-center">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Componente Principal de la Página de Perfil ---
const ProfilePage = () => {
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState<Record<string, boolean>>({});
  const [errorModal, setErrorModal] = useState({ isOpen: false, message: '' });
  const [ocrModalConfig, setOcrModalConfig] = useState({ isOpen: false, data: null, isMatch: false, wasRejected: false, documentType: '' });
  const [docRequirements, setDocRequirements] = useState<any[]>([]);
  const [editFormData, setEditFormData] = useState({
    name: '',
    companyName: '',
    rfc: '',
    taxAddress: '',
  });

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

      try {
        const reqResponse = await fetch('/api/settings/documents', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (reqResponse.ok) {
          const reqs = await reqResponse.json();
          setDocRequirements(reqs);
        }
      } catch (reqErr) {
        console.error("Error fetching doc settings:", reqErr);
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleEditClick = () => {
    if (profile?.supplierProfile) {
      const isInvited = profile.supplierProfile.rfc?.startsWith('INVITE-');
      setEditFormData({
        name: profile.name || '',
        companyName: profile.supplierProfile.companyName || '',
        rfc: isInvited ? '' : (profile.supplierProfile.rfc || ''),
        taxAddress: isInvited ? '' : (profile.supplierProfile.taxAddress === 'Pendiente de completar' ? '' : (profile.supplierProfile.taxAddress || '')),
      });
    } else {
      setEditFormData({ name: profile?.name || '', companyName: '', rfc: '', taxAddress: '' });
    }
    setIsEditing(true);
  };

  const handleSaveProfile = async () => {
    setIsLoading(true);
    const token = localStorage.getItem('token');
    try {
      const isSupplier = profile?.role === 'SUPPLIER' && profile?.supplierProfile;
      const payload = isSupplier
        ? { companyName: editFormData.companyName, rfc: editFormData.rfc, taxAddress: editFormData.taxAddress }
        : { name: editFormData.name };
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al guardar el perfil.');
      }

      await fetchProfile();
      setIsEditing(false);
    } catch (err: any) {
      setErrorModal({ isOpen: true, message: err.message });
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, documentType: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingDocs(prev => ({ ...prev, [documentType]: true }));
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

      // --- OCR INTEGRATION ---
      const validTypesForOcr = ['CONSTANCIA_SITUACION_FISCAL', 'OPINION_CUMPLIMIENTO_SAT', 'IDENTIFICACION_OFICIAL', 'COMPROBANTE_DOMICILIO', 'ACTA_CONSTITUTIVA'];
      
      const docSetting = docRequirements.find(r => r.documentType === documentType);
      const isOcrEnabled = docSetting ? docSetting.isOcrEnabled : true; // Por defecto encendido si no hay setting

      if (validTypesForOcr.includes(documentType) && response.ok && isOcrEnabled) {
        try {
          const uploadResult = await response.json();
          const s3Key = uploadResult.fileUrl || uploadResult.s3Key || uploadResult.fileKey; 

          const ocrFormData = new FormData();
          ocrFormData.append('s3Key', s3Key);
          ocrFormData.append('documentType', documentType);

          const ocrResponse = await fetch('/api/ocr', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: ocrFormData,
          });

          if (ocrResponse.ok) {
            const ocrResult = await ocrResponse.json();
            const extractedRfc = ocrResult.data.rfc || '';
            const extractedName = ocrResult.data.companyName || '';
            const extractedStatus = ocrResult.data.status || '';
            
            const targetRfc = profile.supplierProfile?.rfc || '';
            const targetName = profile.supplierProfile?.companyName || '';

            const isNewUser = targetRfc.startsWith('INVITE-');
            const rfcMatch = extractedRfc === targetRfc;
            const nameMatch = extractedName && targetName && (extractedName.includes(targetName.toUpperCase()) || targetName.toUpperCase().includes(extractedName));
            
            let isMatch = false;
            
            if (documentType === 'CONSTANCIA_SITUACION_FISCAL') {
              isMatch = rfcMatch && nameMatch;
            } else if (documentType === 'OPINION_CUMPLIMIENTO_SAT') {
              // Para la opinión, lo vital es RFC, que sea Positiva y que no expida los 30 días
              isMatch = rfcMatch && extractedStatus === 'POSITIVO' && !ocrResult.data.isExpired;
            } else if (documentType === 'IDENTIFICACION_OFICIAL') {
              // Verificamos que sea un documento reconocido (INE/Pasaporte) y que no esté vencido
              isMatch = ocrResult.data.isValidDocument && !ocrResult.data.isExpired;
            } else if (documentType === 'COMPROBANTE_DOMICILIO') {
              isMatch = ocrResult.data.isValidDocument && !ocrResult.data.isExpired;
            } else if (documentType === 'ACTA_CONSTITUTIVA') {
              const partsName = targetName.toUpperCase().split(' ').filter((p: string) => p.length > 3);
              const foundParts = partsName.filter((p: string) => ocrResult.data.rawText?.includes(p));
              // Si su nombre tiene al menos 2 palabras grandes, ocupamos detectar 1 o más
              const actaNameMatch = partsName.length > 0 && foundParts.length >= Math.min(2, partsName.length);
              
              // Verificamos que sea un documento notarial válido Y contenga el nombre de la empresa
              isMatch = ocrResult.data.isValidDocument && actaNameMatch;
            }

            if (!isMatch && !isNewUser) {
              // Si no coincide y es un usuario existente, borramos el documento para no almacenarlo
              await fetch(`/api/documents?documentType=${documentType}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              setOcrModalConfig({ isOpen: true, data: ocrResult.data, isMatch: false, wasRejected: true, documentType });
            } else if (!isMatch && isNewUser) {
              // Si es nuevo usuario, permitimos la discrepancia para que puedan auto-rellenar su perfil
              setOcrModalConfig({ isOpen: true, data: ocrResult.data, isMatch: false, wasRejected: false, documentType });
            } else {
              setOcrModalConfig({ isOpen: true, data: ocrResult.data, isMatch: true, wasRejected: false, documentType });
            }
          }
        } catch (ocrErr) {
          console.error("Error al ejecutar OCR:", ocrErr);
        }
      }

      await fetchProfile();

    } catch (err: any) {
      setErrorModal({ isOpen: true, message: err.message });
    } finally {
      setUploadingDocs(prev => ({ ...prev, [documentType]: false }));
      // Reseteamos el input de file para permitir volver a subir el mismo archivo
      e.target.value = '';
    }
  };

  // --- CORRECCIÓN: La lógica de los documentos se mueve dentro de su propia sección ---
  const renderDocumentsSection = () => {
    if (!profile || profile.role !== 'SUPPLIER' || !profile.supplierProfile) {
      return null;
    }

    const baseDocuments = [
      { type: 'CONSTANCIA_SITUACION_FISCAL', displayName: 'Constancia de Situación Fiscal' },
      { type: 'OPINION_CUMPLIMIENTO_SAT', displayName: 'Opinión de Cumplimiento (SAT)' },
      { type: 'IDENTIFICACION_OFICIAL', displayName: 'Identificación Oficial del Representante' },
      { type: 'COMPROBANTE_DOMICILIO', displayName: 'Comprobante de Domicilio' },
      { type: 'ACTA_CONSTITUTIVA', displayName: 'Acta Constitutiva' },
    ];

    // Ocultar documentos no requeridos según la config del Admin
    const requiredDocs = docRequirements.length > 0 
      ? baseDocuments.filter(bd => docRequirements.find(dr => dr.documentType === bd.type)?.isRequired !== false)
      : baseDocuments;

    const documentsToShow = requiredDocs.map(reqDoc => {
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
            <DocumentRow key={doc.type} doc={doc} onFileSelect={handleFileSelect} isUploading={uploadingDocs[doc.type]} />
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

      {profile.role === 'SUPPLIER' && profile.supplierProfile?.rfc?.startsWith('INVITE-') && (
        <div className="mt-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700 font-medium">
                Tu perfil fiscal está incompleto. 
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                Por favor, haz clic en "Completar Perfil Fiscal" para ingresar tu RFC, Razón Social y subir tus documentos.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 border-t pt-6">
        <h4 className="text-lg font-semibold text-gray-700 mb-4">Información de la Cuenta</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {profile.role === 'SUPPLIER' && profile.supplierProfile ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-500">Razón Social</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editFormData.companyName}
                    onChange={(e) => setEditFormData({ ...editFormData, companyName: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-gray-800"
                  />
                ) : (
                  <p className="text-gray-800">{profile.supplierProfile.companyName}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">RFC</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editFormData.rfc}
                    onChange={(e) => setEditFormData({ ...editFormData, rfc: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-gray-800"
                  />
                ) : (
                  <p className="text-gray-800">{profile.supplierProfile.rfc}</p>
                )}
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-500">Dirección Fiscal</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editFormData.taxAddress}
                    onChange={(e) => setEditFormData({ ...editFormData, taxAddress: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-gray-800"
                  />
                ) : (
                  <p className="text-gray-800">{profile.supplierProfile.taxAddress}</p>
                )}
              </div>
              {profile.supplierProfile.subsidiary && (
                <div><label className="block text-sm font-medium text-gray-500">Subsidiaria Asignada</label><p className="text-gray-800">{profile.supplierProfile.subsidiary.name}</p></div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-500">Estado de la Cuenta</label>
                <p className={`font-semibold ${
                  profile.supplierProfile.status === 'ACTIVE' ? 'text-green-600' :
                  profile.supplierProfile.status === 'REJECTED' ? 'text-red-600' : 'text-yellow-600'
                }`}>
                  {{ ACTIVE: 'Activo', PENDING: 'Pendiente de aprobación', REJECTED: 'Rechazado' }[profile.supplierProfile.status] ?? profile.supplierProfile.status}
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-500">Nombre</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-gray-800"
                  />
                ) : (
                  <p className="text-gray-800">{profile.name}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Rol</label>
                <p className="text-gray-800">{{ CARGADOR: 'Cargador', ADMIN: 'Administrador', TENANT_ADMIN: 'Administrador', SUPERADMIN: 'Super Administrador' }[profile.role as string] ?? profile.role}</p>
              </div>
            </>
          )}
        </div>
        <div className="mt-8 flex gap-4">
          {isEditing ? (
            <>
              <button onClick={handleSaveProfile} className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                Guardar Cambios
              </button>
              <button onClick={() => setIsEditing(false)} className="w-full md:w-auto bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                Cancelar
              </button>
            </>
          ) : (
            <button onClick={handleEditClick} className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
              {profile.supplierProfile?.rfc?.startsWith('INVITE-') ? 'Completar Perfil Fiscal' : 'Editar Perfil'}
            </button>
          )}
        </div>
      </div>

      {/* Se llama a la nueva función para renderizar la sección de documentos */}
      {renderDocumentsSection()}

      <ErrorModal
        isOpen={errorModal.isOpen}
        message={errorModal.message}
        onClose={() => setErrorModal({ isOpen: false, message: '' })}
      />

      <OcrResultModal
        isOpen={ocrModalConfig.isOpen}
        onClose={() => setOcrModalConfig({ isOpen: false, data: null, isMatch: false, wasRejected: false, documentType: '' })}
        config={ocrModalConfig}
        currentProfile={profile?.supplierProfile || {}}
        isEditing={isEditing}
        onApplyData={(rfc: string, companyName: string) => {
          setEditFormData(prev => ({
            ...prev,
            rfc: rfc || prev.rfc,
            companyName: companyName || prev.companyName
          }));
        }}
      />
    </div>
  );
};

export default ProfilePage;
