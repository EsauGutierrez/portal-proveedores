// app/components/SupplierApprovalPage.tsx

"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, Check, X, Eye, Download, AlertTriangle, Clock, CheckCircle, XCircle, Edit, Power, PowerOff } from 'lucide-react';

const EditSupplierModal = ({ supplier, isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({ companyName: '', rfc: '', contactName: '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (supplier) {
      setFormData({
        companyName: supplier.companyName || '',
        rfc: supplier.rfc || '',
        contactName: supplier.user?.name || ''
      });
    }
  }, [supplier]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    await onSave(supplier.id, formData);
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
          <div>
            <label className="block text-sm font-medium text-gray-700">Razón Social</label>
            <input required type="text" value={formData.companyName} onChange={e => setFormData({ ...formData, companyName: e.target.value })} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2.5 text-gray-900 font-medium bg-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">RFC</label>
            <input required type="text" value={formData.rfc} onChange={e => setFormData({ ...formData, rfc: e.target.value })} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2.5 uppercase text-gray-900 font-medium bg-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Contacto</label>
            <input required type="text" value={formData.contactName} onChange={e => setFormData({ ...formData, contactName: e.target.value })} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2.5 text-gray-900 font-medium bg-white" />
          </div>
          <div className="flex justify-end pt-5 space-x-3">
            <button type="button" disabled={isSaving} onClick={onClose} className="px-4 py-2 border rounded-md text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center">
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

// --- Componente Modal para la Validación de Documentos ---
const DocumentValidationModal = ({ supplier, isOpen, onClose, onApprove, onReject, onValidateDocument, onApprovePending }) => {
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

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-3xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-bold text-gray-800">{supplier.companyName}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X className="w-6 h-6" /></button>
        </div>
        <p className="text-gray-600 mb-6">RFC: {supplier.rfc} | Contacto: {supplier.user.name}</p>

        <h4 className="text-lg font-semibold text-gray-700 mb-4">Validación de Documentos</h4>
        <div className="space-y-3 border rounded-lg p-4 max-h-64 overflow-y-auto">
          {documentsToShow.map((doc) => (
            <div key={doc.type} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50">
              <div>
                <p className="font-medium text-gray-800">{doc.displayName}</p>
                {doc.fileName && <p className="text-sm text-gray-500">{doc.fileName}</p>}
              </div>
              <div className="flex items-center space-x-2">
                <StatusBadge status={doc.status} />
                {doc.fileUrl && <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" title="Ver Documento" className="p-2 text-gray-500 hover:text-blue-600"><Download className="w-5 h-5" /></a>}
                {doc.status === 'UPLOADED' && (
                  <>
                    <button onClick={() => onValidateDocument(doc.id, 'APPROVED')} title="Aprobar" className="p-2 text-gray-500 hover:text-green-600"><Check className="w-5 h-5" /></button>
                    <button onClick={() => onValidateDocument(doc.id, 'REJECTED')} title="Rechazar" className="p-2 text-gray-500 hover:text-red-600"><X className="w-5 h-5" /></button>
                  </>
                )}
                {/* CAMBIO: Se añade un botón para aprobar documentos pendientes */}
                {doc.status === 'PENDING' && (
                  <button onClick={() => onApprovePending(supplier.id, doc.type)} title="Aprobar sin archivo" className="p-2 text-gray-500 hover:text-green-600"><Check className="w-5 h-5" /></button>
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

  const fetchSuppliers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/suppliers');
      if (!response.ok) throw new Error('No se pudieron cargar los proveedores.');
      const data = await response.json();
      setSuppliers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleApprove = async (supplierId: string) => {
    try {
      const response = await fetch(`/api/suppliers/${supplierId}/approve`, { method: 'PATCH' });
      if (!response.ok) throw new Error('Error al aprobar el proveedor.');
      fetchSuppliers();
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReject = (supplierId: string) => {
    alert(`Lógica para rechazar al proveedor ${supplierId} no implementada.`);
    setIsModalOpen(false);
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

      const updatedSuppliers = await (await fetch('/api/suppliers')).json();
      const updatedSelectedSupplier = updatedSuppliers.find(s => s.id === selectedSupplier.id);
      setSelectedSupplier(updatedSelectedSupplier);
      setSuppliers(updatedSuppliers);

    } catch (err: any) {
      alert(err.message);
    }
  };

  // CAMBIO: Se añade la función para manejar la aprobación de documentos pendientes
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

      const updatedSuppliers = await (await fetch('/api/suppliers')).json();
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
      alert(err.message);
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
      alert(err.message);
    }
  };

  if (isLoading) return <div className="flex justify-center items-center h-96"><Loader2 className="w-16 h-16 text-blue-600 animate-spin" /></div>;
  if (error) return <div className="text-red-600 text-center">{error}</div>;

  return (
    <>
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Gestión de Proveedores</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left table-auto">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-sm font-semibold text-gray-600">Razón Social</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-600">RFC</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-600">Contacto</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-600">Estado</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-600 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {suppliers.map((supplier: any) => (
                <tr key={supplier.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{supplier.companyName}</td>
                  <td className="px-4 py-3 text-gray-700">{supplier.rfc}</td>
                  <td className="px-4 py-3 text-gray-700">{supplier.user.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full font-medium ${supplier.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                      supplier.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                      {supplier.status === 'REJECTED' ? 'INACTIVO' : supplier.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <button onClick={() => handleOpenModal(supplier)} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded text-xs font-semibold hover:bg-blue-100 flex items-center transition-colors border border-blue-200" title="Validar Documentos">
                        <Eye className="w-4 h-4 mr-1" /> Validar
                      </button>
                      <button onClick={() => handleOpenEditModal(supplier)} className="bg-white text-gray-600 p-1.5 rounded hover:bg-gray-100 hover:text-indigo-600 transition-colors border border-gray-200" title="Editar">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleToggleStatus(supplier)} className={`p-1.5 rounded border transition-colors ${supplier.status === 'ACTIVE' ? 'bg-white text-red-500 border-gray-200 hover:bg-red-50' : 'bg-red-50 text-green-600 border-red-200 hover:bg-green-50'}`} title={supplier.status === 'ACTIVE' ? "Inactivar Acceso" : "Reactivar Acceso"}>
                        {supplier.status === 'ACTIVE' ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <DocumentValidationModal
        supplier={selectedSupplier}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onApprove={handleApprove}
        onReject={handleReject}
        onValidateDocument={handleValidateDocument}
        onApprovePending={handleApprovePending} // Se pasa la nueva función al modal
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
    </>
  );
};

export default SupplierApprovalPage;
