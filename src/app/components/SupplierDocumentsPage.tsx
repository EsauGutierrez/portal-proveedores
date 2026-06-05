"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Clock, UploadCloud, Download, AlertCircle, FileText, RefreshCw } from 'lucide-react';

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) return `El archivo no puede superar los ${MAX_FILE_SIZE_MB} MB.`;
  if (!ALLOWED_TYPES.has(file.type)) return 'Solo se aceptan archivos PDF, JPG o PNG.';
  return null;
}

type DocStatus = 'PENDING' | 'UPLOADED' | 'APPROVED' | 'REJECTED';

interface DocRow {
  requirementId: string;
  documentType: string;
  name: string;
  isRequired: boolean;
  uploadedDocId: string | null;
  fileName: string | null;
  fileUrl: string | null;
  status: DocStatus;
  rejectionReason: string | null;
  approvedAt: string | null;
}

const StatusBadge = ({ status, isRequired }: { status: DocStatus; isRequired: boolean }) => {
  if (status === 'APPROVED') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
      <CheckCircle className="w-3.5 h-3.5" /> Aprobado
    </span>
  );
  if (status === 'REJECTED') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
      <XCircle className="w-3.5 h-3.5" /> Rechazado
    </span>
  );
  if (status === 'UPLOADED') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
      <Clock className="w-3.5 h-3.5" /> En revisión
    </span>
  );
  // PENDING
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${
      isRequired
        ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
        : 'text-gray-500 bg-gray-50 border-gray-200'
    }`}>
      <Clock className="w-3.5 h-3.5" />
      {isRequired ? 'Pendiente' : 'Sin subir'}
    </span>
  );
};

const SupplierDocumentsPage = ({ user }: { user: any }) => {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isApproved = user?.supplierStatus === 'ACTIVE';

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchDocs = async () => {
    setIsLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');

      // Cargar requerimientos y documentos subidos en paralelo
      const [reqRes, uploadedRes] = await Promise.all([
        fetch('/api/settings/documents', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/documents', { headers: { 'Authorization': `Bearer ${token}` } }),
      ]);

      if (!reqRes.ok) throw new Error('No se pudieron cargar los documentos requeridos.');
      const requirements = await reqRes.json();
      const uploadedDocs = uploadedRes.ok ? await uploadedRes.json() : [];

      const rows: DocRow[] = requirements.map((req: any) => {
        const uploaded = uploadedDocs.find((d: any) => d.documentType === req.documentType);
        return {
          requirementId: req.id,
          documentType: req.documentType,
          name: req.name || req.documentType,
          isRequired: req.isRequired,
          uploadedDocId: uploaded?.id ?? null,
          fileName: uploaded?.fileName ?? null,
          fileUrl: uploaded?.fileUrl ?? null,
          status: uploaded?.status ?? 'PENDING',
          rejectionReason: uploaded?.rejectionReason ?? null,
          approvedAt: uploaded?.approvedAt ?? null,
        };
      });

      setDocs(rows);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchDocs(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, documentType: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const fileError = validateFile(file);
    if (fileError) {
      showNotification('error', fileError);
      return;
    }

    setUploading(prev => ({ ...prev, [documentType]: true }));
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
      showNotification('success', 'Documento subido correctamente. Está en revisión.');
      await fetchDocs();
    } catch {
      showNotification('error', 'No se pudo subir el documento. Intenta de nuevo.');
    } finally {
      setUploading(prev => ({ ...prev, [documentType]: false }));
    }
  };

  if (isLoading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
      <AlertCircle className="w-5 h-5 flex-shrink-0" />
      {error}
    </div>
  );

  const required = docs.filter(d => d.isRequired);
  const optional = docs.filter(d => !d.isRequired);
  const pendingCount = required.filter(d => d.status === 'PENDING' || d.status === 'REJECTED').length;

  return (
    <div className="space-y-6">
      {/* Notificación */}
      {notification && (
        <div className={`flex items-center gap-3 p-4 rounded-lg border text-sm font-medium ${
          notification.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {notification.message}
        </div>
      )}

      {/* Encabezado */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Mis Documentos</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {isApproved
                  ? 'Tu cuenta está activa. Puedes actualizar tus documentos cuando lo necesites.'
                  : `${pendingCount} documento${pendingCount !== 1 ? 's' : ''} pendiente${pendingCount !== 1 ? 's' : ''} de entrega`}
              </p>
            </div>
          </div>
          <button
            onClick={fetchDocs}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Actualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {!isApproved && pendingCount > 0 && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2 text-sm text-yellow-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Debes subir todos los documentos requeridos para que tu cuenta sea aprobada.</span>
          </div>
        )}
      </div>

      {/* Documentos Requeridos */}
      {required.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
              Documentos Requeridos ({required.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {required.map(doc => (
              <DocRow
                key={doc.documentType}
                doc={doc}
                isUploading={uploading[doc.documentType] ?? false}
                onUpload={handleUpload}
              />
            ))}
          </div>
        </div>
      )}

      {/* Documentos Opcionales */}
      {optional.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
              Documentos Opcionales ({optional.length})
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">No son obligatorios, pero pueden agilizar procesos futuros.</p>
          </div>
          <div className="divide-y divide-gray-50">
            {optional.map(doc => (
              <DocRow
                key={doc.documentType}
                doc={doc}
                isUploading={uploading[doc.documentType] ?? false}
                onUpload={handleUpload}
              />
            ))}
          </div>
        </div>
      )}

      {docs.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No hay documentos configurados en este momento.</p>
        </div>
      )}
    </div>
  );
};

// --- Fila de documento ---
const DocRow = ({
  doc,
  isUploading,
  onUpload,
}: {
  doc: DocRow;
  isUploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>, documentType: string) => void;
}) => {
  const canUpload = doc.status !== 'APPROVED';

  return (
    <div className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50/50 transition-colors">
      {/* Icono de estado */}
      <div className="mt-0.5 flex-shrink-0">
        {doc.status === 'APPROVED' && <CheckCircle className="w-5 h-5 text-green-500" />}
        {doc.status === 'UPLOADED' && <Clock className="w-5 h-5 text-blue-400" />}
        {doc.status === 'REJECTED' && <XCircle className="w-5 h-5 text-red-500" />}
        {doc.status === 'PENDING' && (
          <div className={`w-5 h-5 rounded-full border-2 ${doc.isRequired ? 'border-yellow-400' : 'border-gray-300'}`} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-gray-800">{doc.name}</p>
          <StatusBadge status={doc.status} isRequired={doc.isRequired} />
        </div>

        {doc.fileName && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{doc.fileName}</p>
        )}

        {doc.status === 'REJECTED' && doc.rejectionReason && (
          <p className="text-xs text-red-700 mt-1 bg-red-50 border border-red-100 px-2 py-1 rounded">
            <span className="font-semibold">Motivo: </span>{doc.rejectionReason}
          </p>
        )}

        {doc.status === 'APPROVED' && doc.approvedAt && (
          <p className="text-xs text-green-600 mt-0.5">
            Aprobado el {new Date(doc.approvedAt).toLocaleDateString('es-MX')}
          </p>
        )}
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {doc.fileUrl && (
          <a
            href={doc.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
            title="Descargar documento"
          >
            <Download className="w-4 h-4" />
          </a>
        )}

        {canUpload && (
          <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
            isUploading
              ? 'bg-gray-100 text-gray-400 pointer-events-none'
              : doc.status === 'REJECTED'
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}>
            {isUploading ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Subiendo...</>
            ) : (
              <><UploadCloud className="w-3.5 h-3.5" /> {doc.status === 'PENDING' ? 'Subir' : 'Reemplazar'}</>
            )}
            <input
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png"
              disabled={isUploading}
              onChange={(e) => onUpload(e, doc.documentType)}
            />
          </label>
        )}
      </div>
    </div>
  );
};

export default SupplierDocumentsPage;
