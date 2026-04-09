// app/components/SupplierApprovalPage.tsx

"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, Check, X, Eye, Download, AlertTriangle, Clock, CheckCircle, XCircle, Edit, Power, PowerOff, Search, ChevronUp, ChevronDown, Mail } from 'lucide-react';

const EditSupplierModal = ({ supplier, isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({ companyName: '', rfc: '', contactName: '', email: '', password: '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (supplier) {
      setFormData({
        companyName: supplier.companyName || '',
        rfc: supplier.rfc || '',
        contactName: supplier.user?.name || '',
        email: supplier.user?.email || '',
        password: '', // Siempre vacío por seguridad, solo se envía si se escribe algo nuevo
      });
    }
  }, [supplier]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    // Eliminar password del payload si está vacío
    const payload = { ...formData };
    if (!payload.password || payload.password.trim() === '') {
      delete payload.password;
    }
    await onSave(supplier.id, payload);
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-800">Editar Perfil del Proveedor</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Razón Social</label>
              <input required type="text" value={formData.companyName} onChange={e => setFormData({ ...formData, companyName: e.target.value })} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 text-sm text-gray-900 font-medium bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">RFC</label>
              <input required type="text" value={formData.rfc} onChange={e => setFormData({ ...formData, rfc: e.target.value })} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 text-sm uppercase text-gray-900 font-medium bg-white" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre del Contacto</label>
              <input required type="text" value={formData.contactName} onChange={e => setFormData({ ...formData, contactName: e.target.value })} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 text-sm text-gray-900 font-medium bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Correo Electrónico</label>
              <input required type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 text-sm text-gray-900 font-medium bg-white" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Nueva Contraseña <span className="text-gray-400 font-normal text-xs">(Dejar en blanco para no cambiar)</span>
            </label>
            <input type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} placeholder="••••••••" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 text-sm text-gray-900 bg-white" />
          </div>
          <div className="flex justify-end pt-5 space-x-3 border-t mt-4 border-gray-100">
            <button type="button" disabled={isSaving} onClick={onClose} className="px-4 py-2 border rounded-md text-gray-600 hover:bg-gray-50 disabled:opacity-50 font-medium">Cancelar</button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center font-medium">
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Componente Modal Confirmación Cambio Estatus ---
const ConfirmToggleModal = ({ supplier, isOpen, onClose, onConfirm }) => {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen || !supplier) return null;

  const isCurrentlyActive = supplier.status === 'ACTIVE';

  const handleConfirm = async () => {
    setIsProcessing(true);
    await onConfirm(supplier);
    setIsProcessing(false);
  };

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md text-center">
        <div className="mb-4">
          {isCurrentlyActive ? (
            <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto" />
          ) : (
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
          )}
        </div>
        <h3 className="text-xl font-bold text-gray-800 mb-2">
          {isCurrentlyActive ? '¿Inactivar Proveedor?' : '¿Reactivar Proveedor?'}
        </h3>
        <p className="text-gray-600 mb-6 font-medium">
          {isCurrentlyActive ? (
            <>¿Estás seguro de que deseas INACTIVAR a <span className="text-gray-900 font-bold">"{supplier.companyName}"</span>? Perderán su acceso al portal inmediatamente.</>
          ) : (
            <>¿Estás seguro de que deseas REACTIVAR a <span className="text-gray-900 font-bold">"{supplier.companyName}"</span>?</>
          )}
        </p>
        <div className="flex justify-center space-x-3">
          <button type="button" disabled={isProcessing} onClick={onClose} className="px-5 py-2.5 border rounded-lg text-gray-600 hover:bg-gray-50 font-semibold disabled:opacity-50">Cancelar</button>
          <button type="button" disabled={isProcessing} onClick={handleConfirm} className={`px-5 py-2.5 text-white rounded-lg font-semibold disabled:opacity-50 flex items-center justify-center ${isCurrentlyActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
            {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isCurrentlyActive ? 'Sí, Inactivar' : 'Sí, Reactivar'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Componente Modal para Invitar Proveedor ---
const InviteSupplierModal = ({ isOpen, onClose, onInvite }) => {
  const [formData, setFormData] = useState({ name: '', email: '', subsidiaryId: '', requireDocuments: false });
  const [isSaving, setIsSaving] = useState(false);
  const [subsidiaries, setSubsidiaries] = useState<any[]>([]);
  const [loadingSubsidiaries, setLoadingSubsidiaries] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const fetchSubsidiaries = async () => {
      setLoadingSubsidiaries(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/subsidiaries', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          const active = data.filter((s: any) => s.isActive !== false);
          setSubsidiaries(active);
          // Pre-seleccionar la primera si solo hay una
          if (active.length === 1) setFormData(prev => ({ ...prev, subsidiaryId: active[0].id }));
        }
      } finally {
        setLoadingSubsidiaries(false);
      }
    };
    fetchSubsidiaries();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    await onInvite(formData);
    setIsSaving(false);
    setFormData({ name: '', email: '', subsidiaryId: '', requireDocuments: false });
  };

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-800">Invitar Nuevo Proveedor</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Nombre del Proveedor / Contacto</label>
            <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 text-sm text-gray-900 bg-white" placeholder="Ej. Juan Pérez o Empresa SA" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Correo Electrónico</label>
            <input required type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 text-sm text-gray-900 bg-white" placeholder="proveedor@ejemplo.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Subsidiaria</label>
            <select
              required
              value={formData.subsidiaryId}
              onChange={e => setFormData({ ...formData, subsidiaryId: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 text-sm text-gray-900 bg-white"
              disabled={loadingSubsidiaries}
            >
              <option value="" disabled>{loadingSubsidiaries ? 'Cargando...' : 'Selecciona una subsidiaria'}</option>
              {subsidiaries.map(s => (
                <option key={s.id} value={s.id}>{s.name} — {s.rfc}</option>
              ))}
            </select>
            {subsidiaries.length === 0 && !loadingSubsidiaries && (
              <p className="text-xs text-red-500 mt-1">No hay subsidiarias configuradas. Crea una primero.</p>
            )}
          </div>

          {/* Checkbox: Solicitar documentación */}
          <div
            onClick={() => setFormData({ ...formData, requireDocuments: !formData.requireDocuments })}
            className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${formData.requireDocuments ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'}`}
          >
            <div className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors ${formData.requireDocuments ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}>
              {formData.requireDocuments && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">Solicitar documentación</p>
              <p className="text-xs text-gray-500 mt-0.5">Al iniciar sesión por primera vez, el proveedor deberá subir los documentos requeridos antes de continuar.</p>
            </div>
          </div>

          <div className="flex justify-end pt-4 space-x-3 border-t border-gray-100">
            <button type="button" disabled={isSaving} onClick={onClose} className="px-4 py-2 border rounded-md text-gray-600 hover:bg-gray-50 font-medium">Cancelar</button>
            <button type="submit" disabled={isSaving || subsidiaries.length === 0} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center font-medium">
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Enviar Invitación
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Componente Modal para la Validación de Documentos ---
const DocumentValidationModal = ({ supplier, isOpen, onClose, onApprove, onReject, onValidateDocument, onRejectDocument, onApprovePending }) => {
  const [rejectingDocId, setRejectingDocId] = React.useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState('');
  const [isSubmittingReject, setIsSubmittingReject] = React.useState(false);

  if (!isOpen) return null;

  const documentTypes = [
    { type: 'CONSTANCIA_SITUACION_FISCAL', displayName: 'Constancia de Situación Fiscal' },
    { type: 'OPINION_CUMPLIMIENTO_SAT', displayName: 'Opinión de Cumplimiento (SAT)' },
    { type: 'IDENTIFICACION_OFICIAL', displayName: 'Identificación Oficial del Representante' },
    { type: 'COMPROBANTE_DOMICILIO', displayName: 'Comprobante de Domicilio' },
    { type: 'ACTA_CONSTITUTIVA', displayName: 'Acta Constitutiva' },
  ];

  const documentsToShow = documentTypes.map(reqDoc => {
    const uploadedDoc = supplier.documents?.find(doc => doc.documentType === reqDoc.type);
    return {
      id: uploadedDoc?.id,
      displayName: reqDoc.displayName,
      type: reqDoc.type,
      fileName: uploadedDoc?.fileName,
      fileUrl: uploadedDoc?.fileUrl,
      status: uploadedDoc?.status || 'PENDING',
      rejectionReason: uploadedDoc?.rejectionReason || null,
      approvedAt: uploadedDoc?.approvedAt || null,
      rejectedAt: uploadedDoc?.rejectedAt || null,
    };
  });

  const StatusBadge = ({ status }) => {
    const statusInfo = {
      PENDING: { text: 'Pendiente', icon: Clock, color: 'text-gray-500' },
      UPLOADED: { text: 'Cargado', icon: CheckCircle, color: 'text-blue-500' },
      APPROVED: { text: 'Aprobado', icon: CheckCircle, color: 'text-green-500' },
      REJECTED: { text: 'Rechazado', icon: XCircle, color: 'text-red-500' },
    };
    const currentStatus = statusInfo[status] || statusInfo.PENDING;
    const Icon = currentStatus.icon;
    return <span className={`flex items-center text-xs font-semibold ${currentStatus.color}`}><Icon className="w-4 h-4 mr-1.5" />{currentStatus.text}</span>;
  };

  const handleConfirmReject = async () => {
    if (!rejectionReason.trim() || !rejectingDocId) return;
    setIsSubmittingReject(true);
    await onRejectDocument(rejectingDocId, rejectionReason.trim());
    setIsSubmittingReject(false);
    setRejectingDocId(null);
    setRejectionReason('');
  };

  return (
    <>
      <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-3xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-2xl font-bold text-gray-800">{supplier.companyName}</h3>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X className="w-6 h-6" /></button>
          </div>
          <p className="text-gray-600 mb-6">RFC: {supplier.rfc} | Contacto: {supplier.user.name}</p>

          <h4 className="text-lg font-semibold text-gray-700 mb-4">Validación de Documentos</h4>
          <div className="space-y-3 border rounded-lg p-4 max-h-72 overflow-y-auto">
            {documentsToShow.map((doc) => (
              <div key={doc.type} className="flex items-start justify-between p-3 rounded-md hover:bg-gray-50 gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800">{doc.displayName}</p>
                  {doc.fileName && <p className="text-xs text-gray-500 truncate">{doc.fileName}</p>}
                  {doc.status === 'REJECTED' && doc.rejectionReason && (
                    <p className="text-xs text-red-600 mt-1 bg-red-50 px-2 py-1 rounded">
                      <span className="font-semibold">Motivo: </span>{doc.rejectionReason}
                    </p>
                  )}
                  {doc.status === 'APPROVED' && doc.approvedAt && (
                    <p className="text-xs text-green-600 mt-1">
                      Aprobado el {new Date(doc.approvedAt).toLocaleDateString('es-MX')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={doc.status} />
                  {doc.fileUrl && (
                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" title="Ver Documento"
                      className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors">
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                  {doc.status === 'UPLOADED' && (
                    <>
                      <button
                        onClick={() => onValidateDocument(doc.id, 'APPROVED')}
                        title="Aprobar documento"
                        className="flex items-center gap-1 px-2 py-1 bg-green-50 hover:bg-green-100 text-green-700 rounded text-xs font-medium transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" /> Aprobar
                      </button>
                      <button
                        onClick={() => setRejectingDocId(doc.id)}
                        title="Rechazar documento"
                        className="flex items-center gap-1 px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded text-xs font-medium transition-colors"
                      >
                        <X className="w-3.5 h-3.5" /> Rechazar
                      </button>
                    </>
                  )}
                  {doc.status === 'REJECTED' && (
                    <button
                      onClick={() => setRejectingDocId(doc.id)}
                      title="Rechazar de nuevo con otro motivo"
                      className="flex items-center gap-1 px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded text-xs font-medium transition-colors"
                    >
                      <X className="w-3.5 h-3.5" /> Editar motivo
                    </button>
                  )}
                  {doc.status === 'PENDING' && (
                    <button
                      onClick={() => onApprovePending(supplier.id, doc.type)}
                      title="Aprobar sin archivo"
                      className="flex items-center gap-1 px-2 py-1 bg-green-50 hover:bg-green-100 text-green-700 rounded text-xs font-medium transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" /> Aprobar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-end space-x-3">
            <button onClick={() => onReject(supplier.id)} className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg">Rechazar Proveedor</button>
            <button onClick={() => onApprove(supplier.id)} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg">Aprobar Proveedor</button>
          </div>
        </div>
      </div>

      {/* Sub-modal: Motivo de rechazo del documento */}
      {rejectingDocId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800">Motivo del Rechazo</h3>
                <p className="text-xs text-gray-500">Se notificará al proveedor por email</p>
              </div>
            </div>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Explica claramente por qué se rechaza el documento y qué correcciones se necesitan..."
              className="w-full border border-gray-300 rounded-lg p-3 mb-4 h-28 text-sm text-gray-900 focus:ring-2 focus:ring-red-400 focus:border-red-400 resize-none"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setRejectingDocId(null); setRejectionReason(''); }}
                disabled={isSubmittingReject}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmReject}
                disabled={isSubmittingReject || !rejectionReason.trim()}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium text-sm transition disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmittingReject && <Loader2 className="w-4 h-4 animate-spin" />}
                Rechazar y Notificar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// --- Componente Principal de la Página ---
const SupplierApprovalPage = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [supplierToToggle, setSupplierToToggle] = useState(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; title: string; message: string; tempPassword?: string } | null>(null);

  // Estados para búsqueda, ordenamiento y paginación
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'companyName', direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const pageOptions = [10, 50, 100, 500];

  const fetchSuppliers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/suppliers');
      if (!response.ok) throw new Error('No se pudieron cargar los proveedores.');
      const data = await response.json();
      setSuppliers(Array.isArray(data) ? data : (data.data ?? []));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  // Lógica de filtrado y ordenamiento
  const filteredAndSortedSuppliers = React.useMemo(() => {
    let result = [...suppliers];

    // Filtrado
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(supplier =>
        supplier.companyName?.toLowerCase().includes(lowerSearch) ||
        supplier.rfc?.toLowerCase().includes(lowerSearch)
      );
    }

    // Ordenamiento
    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Manejar campos anidados si es necesario (ej. user.name)
        if (sortConfig.key === 'contact') {
          aValue = a.user?.name || '';
          bValue = b.user?.name || '';
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [suppliers, searchTerm, sortConfig]);

  // Resetear página cuando cambia la búsqueda o el orden
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortConfig, itemsPerPage]);

  // Paginación final
  const totalPages = Math.ceil(filteredAndSortedSuppliers.length / itemsPerPage);
  const paginatedSuppliers = filteredAndSortedSuppliers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const requestSort = (key: string) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig.key !== columnKey) return <div className="w-4 h-4 ml-1 opacity-20"><ChevronUp className="w-3 h-3" /></div>;
    return sortConfig.direction === 'asc' ?
      <ChevronUp className="w-4 h-4 ml-1 text-blue-600" /> :
      <ChevronDown className="w-4 h-4 ml-1 text-blue-600" />;
  };

  const handleApprove = async (supplierId: string) => {
    try {
      const response = await fetch(`/api/suppliers/${supplierId}/approve`, { method: 'PATCH' });
      if (!response.ok) throw new Error('Error al aprobar el proveedor.');
      fetchSuppliers();
      setIsModalOpen(false);
      setNotification({ type: 'success', title: 'Proveedor aprobado', message: 'El proveedor ha sido aprobado. Se envió el enlace para establecer su contraseña (revisa la terminal si no hay email configurado).' });
    } catch (err: any) {
      setNotification({ type: 'error', title: 'Error', message: err.message });
    }
  };

  const handleReject = (supplierId: string) => {
    setIsModalOpen(false);
    setNotification({ type: 'info', title: 'No implementado', message: 'La lógica para rechazar proveedores aún no está implementada.' });
  };

  const handleValidateDocument = async (documentId: string, status: 'APPROVED' | 'REJECTED') => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`/api/documents/${documentId}/validate`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });

      if (!response.ok) throw new Error('No se pudo actualizar el estado del documento.');

      if (status === 'APPROVED') {
        setNotification({ type: 'success', title: 'Documento aprobado', message: 'El proveedor ha sido notificado por email.' });
      }

      const raw = await (await fetch('/api/suppliers')).json();
      const updatedSuppliers = Array.isArray(raw) ? raw : (raw.data ?? []);
      const updatedSelectedSupplier = updatedSuppliers.find(s => s.id === selectedSupplier.id);
      setSelectedSupplier(updatedSelectedSupplier);
      setSuppliers(updatedSuppliers);

    } catch (err: any) {
      setNotification({ type: 'error', title: 'Error', message: err.message });
    }
  };

  const handleRejectDocument = async (documentId: string, rejectionReason: string) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`/api/documents/${documentId}/reject`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ rejectionReason })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'No se pudo rechazar el documento.');
      }

      setNotification({ type: 'info', title: 'Documento rechazado', message: 'El proveedor ha sido notificado con el motivo del rechazo.' });

      const raw = await (await fetch('/api/suppliers')).json();
      const updatedSuppliers = Array.isArray(raw) ? raw : (raw.data ?? []);
      const updatedSelectedSupplier = updatedSuppliers.find(s => s.id === selectedSupplier.id);
      setSelectedSupplier(updatedSelectedSupplier);
      setSuppliers(updatedSuppliers);

    } catch (err: any) {
      setNotification({ type: 'error', title: 'Error', message: err.message });
    }
  };

  const handleApprovePending = async (supplierProfileId: string, documentType: string) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`/api/documents/approve-pending`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ supplierProfileId, documentType })
      });

      if (!response.ok) throw new Error('No se pudo aprobar el documento.');

      const raw = await (await fetch('/api/suppliers')).json();
      const updatedSuppliers = Array.isArray(raw) ? raw : (raw.data ?? []);
      const updatedSelectedSupplier = updatedSuppliers.find(s => s.id === selectedSupplier.id);
      setSelectedSupplier(updatedSelectedSupplier);
      setSuppliers(updatedSuppliers);

    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleOpenModal = (supplier) => {
    setSelectedSupplier(supplier);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (supplier) => {
    setEditingSupplier(supplier);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (supplierId: string, formData: any) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/api/suppliers/${supplierId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData)
      });
      if (!res.ok) throw new Error('Error al actualizar.');
      await fetchSuppliers();
      setIsEditModalOpen(false);
    } catch (err: any) {
      setNotification({ type: 'error', title: 'Error', message: err.message });
    }
  };

  const handleToggleStatus = (supplier: any) => {
    setSupplierToToggle(supplier);
    setIsConfirmModalOpen(true);
  };

  const confirmToggleStatus = async (supplier: any) => {
    const isCurrentlyActive = supplier.status === 'ACTIVE';
    const newStatus = isCurrentlyActive ? 'REJECTED' : 'ACTIVE';

    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error('Error al cambiar el estatus del proveedor.');
      await fetchSuppliers();
      setIsConfirmModalOpen(false);
      setSupplierToToggle(null);
    } catch (err: any) {
      setNotification({ type: 'error', title: 'Error', message: err.message });
    }
  };

  const handleInvite = async (inviteData: any) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(inviteData)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Error al invitar.');

      await fetchSuppliers();
      setIsInviteModalOpen(false);
      setNotification({
        type: 'success',
        title: '¡Invitación creada!',
        message: `El proveedor "${inviteData.name}" fue registrado. Comparte estas credenciales con el proveedor para su primer acceso. El proveedor tendrá que cambiar su contraseña al iniciar sesión.`,
        tempPassword: result.tempPassword,
      });
    } catch (err: any) {
      setNotification({ type: 'error', title: 'Error al invitar', message: err.message });
    }
  };

  if (isLoading) return <div className="flex justify-center items-center h-96"><Loader2 className="w-16 h-16 text-blue-600 animate-spin" /></div>;
  if (error) return <div className="text-red-600 text-center">{error}</div>;

  return (
    <>
    <div className="bg-white rounded-lg shadow-md p-6">

        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-gray-800">Gestión de Proveedores</h2>
            <button 
              onClick={() => setIsInviteModalOpen(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm flex items-center"
            >
              Envía Invitación
            </button>
          </div>

          {/* Barra de Búsqueda */}
          <div className="relative max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por Razón Social o RFC..."
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm shadow-sm transition-all text-gray-900"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto border border-gray-100 rounded-lg mb-4">
          <table className="w-full text-left table-auto">
            <thead className="bg-gray-50/50 border-b border-gray-100">
              <tr>
                <th
                  className="px-4 py-3 text-sm font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => requestSort('companyName')}
                >
                  <div className="flex items-center">
                    Razón Social <SortIcon columnKey="companyName" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-sm font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => requestSort('rfc')}
                >
                  <div className="flex items-center">
                    RFC <SortIcon columnKey="rfc" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-sm font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => requestSort('contact')}
                >
                  <div className="flex items-center">
                    Contacto <SortIcon columnKey="contact" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-sm font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => requestSort('status')}
                >
                  <div className="flex items-center">
                    Estado <SortIcon columnKey="status" />
                  </div>
                </th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-600 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-900">
              {paginatedSuppliers.length > 0 ? (
                paginatedSuppliers.map((supplier: any) => (
                  <tr key={supplier.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-4 text-sm font-medium text-gray-800">{supplier.companyName}</td>
                    <td className="px-4 py-4 text-sm text-gray-700 font-mono">{supplier.rfc}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{supplier.user?.name || '---'}</td>
                    <td className="px-4 py-4 text-sm">
                      <span className={`inline-flex px-2.5 py-1 text-xs rounded-full font-semibold ${supplier.status === 'ACTIVE' ? 'bg-green-50 text-green-700 border border-green-100' :
                        supplier.status === 'PENDING' ? 'bg-yellow-50 text-yellow-700 border border-yellow-100' :
                          'bg-red-50 text-red-700 border border-red-100'
                        }`}>
                        {supplier.status === 'REJECTED' ? 'INACTIVO' : supplier.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button onClick={() => handleOpenModal(supplier)} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded text-xs font-semibold hover:bg-blue-100 flex items-center transition-colors border border-blue-200 shadow-sm" title="Validar Documentos">
                          <Eye className="w-4 h-4 mr-1" /> Validar
                        </button>
                        <button onClick={() => handleOpenEditModal(supplier)} className="bg-white text-gray-600 p-1.5 rounded hover:bg-gray-100 hover:text-indigo-600 transition-colors border border-gray-200 shadow-sm" title="Editar">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleToggleStatus(supplier)} className={`p-1.5 rounded border transition-colors shadow-sm ${supplier.status === 'ACTIVE' ? 'bg-white text-red-500 border-gray-200 hover:bg-red-50' : 'bg-red-50 text-green-600 border-red-200 hover:bg-green-50'}`} title={supplier.status === 'ACTIVE' ? "Inactivar Acceso" : "Reactivar Acceso"}>
                          {supplier.status === 'ACTIVE' ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                    No se encontraron proveedores que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Controles de Paginación Estandarizados */}
        {filteredAndSortedSuppliers.length > 0 && (
          <div className="flex flex-col sm:flex-row justify-between items-center mt-6 text-sm text-gray-600">
            <div className="flex items-center space-x-2 mb-4 sm:mb-0">
              <span>Mostrar</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              >
                {pageOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <span>registros por página</span>
            </div>

            <div className="flex items-center space-x-4">
              <span>
                Mostrando del {filteredAndSortedSuppliers.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} al {Math.min(currentPage * itemsPerPage, filteredAndSortedSuppliers.length)} de {filteredAndSortedSuppliers.length} registros
              </span>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded-md bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Anterior
                </button>
                <div className="px-3 py-1 font-semibold text-gray-800 border border-transparent">
                  Página {currentPage} de {totalPages || 1}
                </div>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="px-3 py-1 border border-gray-300 rounded-md bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <DocumentValidationModal
        supplier={selectedSupplier}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onApprove={handleApprove}
        onReject={handleReject}
        onValidateDocument={handleValidateDocument}
        onRejectDocument={handleRejectDocument}
        onApprovePending={handleApprovePending}
      />

      <EditSupplierModal
        supplier={editingSupplier}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSaveEdit}
      />

      <ConfirmToggleModal
        supplier={supplierToToggle}
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={confirmToggleStatus}
      />

      <InviteSupplierModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInvite={handleInvite}
      />

      {/* Modal de Notificación (reemplaza todos los alert()) */}
      {notification && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex justify-center items-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm text-center">
            {notification.type === 'success' && (
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            )}
            {notification.type === 'error' && (
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
            )}
            {notification.type === 'info' && (
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-blue-600" />
              </div>
            )}
            <h3 className="text-lg font-bold text-gray-800 mb-2">{notification.title}</h3>
            <p className="text-sm text-gray-600 mb-4">{notification.message}</p>
            {notification.tempPassword && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-5 text-left">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Credenciales de primer acceso</p>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-gray-500">Contraseña temporal</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="flex-1 bg-white border border-gray-300 rounded px-3 py-1.5 text-sm font-mono text-gray-900 select-all">{notification.tempPassword}</code>
                      <button
                        onClick={() => navigator.clipboard.writeText(notification.tempPassword!)}
                        className="text-xs px-2 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 transition-colors font-medium"
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-amber-600 mt-3 flex items-start gap-1">
                  <span>⚠</span>
                  <span>Guarda esta contraseña ahora, no se volverá a mostrar.</span>
                </p>
              </div>
            )}
            <button
              onClick={() => setNotification(null)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default SupplierApprovalPage;
