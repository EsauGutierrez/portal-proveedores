// app/components/SupplierApprovalPage.tsx

"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, Check, X, Eye, Download, AlertTriangle, Clock, CheckCircle, XCircle } from 'lucide-react';

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
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
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
                  <td className="px-4 py-3 text-gray-700">{supplier.status}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleOpenModal(supplier)} className="bg-blue-500 text-white px-3 py-1 rounded-lg text-sm font-semibold hover:bg-blue-600 flex items-center mx-auto">
                      <Eye className="w-4 h-4 mr-2" /> Gestionar
                    </button>
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
    </>
  );
};

export default SupplierApprovalPage;
