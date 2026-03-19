// app/components/SubsidiariesPage.tsx

"use client";

import React, { useState, useEffect } from 'react';
import { PlusCircle, Edit, Loader2, X, Upload, Power, PowerOff, AlertTriangle, CheckCircle } from 'lucide-react';

// --- Componente Modal para Agregar/Editar Subsidiaria ---
const SubsidiaryModal = ({ isOpen, onClose, onSave, subsidiary }) => {
  if (!isOpen) return null;

  const taxRegimes = [
    { code: '601', name: 'General de Ley Personas Morales' },
    { code: '603', name: 'Personas Morales con Fines no Lucrativos' },
    { code: '620', name: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos' },
    { code: '623', name: 'Opcional para Grupos de Sociedades' },
    { code: '624', name: 'Coordinados' },
    { code: '626', name: 'Régimen Simplificado de Confianza' },
  ];

  const [formData, setFormData] = useState(
    subsidiary || {
      name: '',
      rfc: '',
      businessName: '',
      taxRegime: '',
      taxAddress: '',
      logo: null,
    }
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData((prev) => ({ ...prev, logo: e.target.files[0] }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    await onSave(formData);
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-gray-800">
            {subsidiary ? 'Editar Subsidiaria' : 'Agregar Nueva Subsidiaria'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input name="name" value={formData.name} onChange={handleChange} placeholder="Nombre de la Subsidiaria" className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900" required />
          <input name="rfc" value={formData.rfc} onChange={handleChange} placeholder="RFC" className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900" required />
          <input name="businessName" value={formData.businessName} onChange={handleChange} placeholder="Razón Social" className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900" required />

          <div>
            <label htmlFor="taxRegime" className="block text-sm font-medium text-gray-700 mb-1">Régimen Fiscal</label>
            <select
              id="taxRegime"
              name="taxRegime"
              value={formData.taxRegime}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
              required
            >
              <option value="" disabled>Selecciona un régimen</option>
              {taxRegimes.map((regime) => (
                <option key={regime.code} value={regime.name}>
                  {regime.code} - {regime.name}
                </option>
              ))}
            </select>
          </div>

          <input name="taxAddress" value={formData.taxAddress} onChange={handleChange} placeholder="Domicilio Fiscal" className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900" required />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
            <label htmlFor="logo-upload" className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500">
              <div className="text-center">
                <Upload className="mx-auto w-8 h-8 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">{formData.logo ? (formData.logo as File).name : 'Haz clic para adjuntar el logo'}</p>
              </div>
            </label>
            <input id="logo-upload" type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
          </div>
          <div className="flex justify-end space-x-4 pt-4">
            <button type="button" onClick={onClose} className="px-6 py-2 border rounded-lg">Cancelar</button>
            <button type="submit" disabled={isSaving} className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:bg-blue-300">
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Componente Modal Confirmación Cambio Estatus ---
const ConfirmToggleModal = ({ subsidiary, isOpen, onClose, onConfirm }) => {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen || !subsidiary) return null;

  const isCurrentlyActive = subsidiary.isActive;

  const handleConfirm = async () => {
    setIsProcessing(true);
    await onConfirm(subsidiary);
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
          {isCurrentlyActive ? '¿Inactivar Subsidiaria?' : '¿Reactivar Subsidiaria?'}
        </h3>
        <p className="text-gray-600 mb-6 font-medium">
          {isCurrentlyActive ? (
            <>¿Estás seguro de que deseas INACTIVAR a <span className="text-gray-900 font-bold">"{subsidiary.name}"</span>? {subsidiary.businessName}</>
          ) : (
            <>¿Estás seguro de que deseas REACTIVAR a <span className="text-gray-900 font-bold">"{subsidiary.name}"</span>?</>
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

// --- Componente Principal de la Página ---
const SubsidiariesPage = () => {
  const [subsidiaries, setSubsidiaries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubsidiary, setEditingSubsidiary] = useState(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [subsidiaryToToggle, setSubsidiaryToToggle] = useState(null);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchSubsidiaries = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/subsidiaries', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al cargar las subsidiarias.');
      }

      const data = await response.json();
      setSubsidiaries(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubsidiaries();
  }, []);

  const handleSave = async (formData) => {
    const data = new FormData();
    // Excluimos el ID del objeto formData para no añadirlo al FormData
    const { id, ...rest } = formData;
    Object.keys(rest).forEach(key => {
      if (rest[key]) {
        data.append(key, rest[key]);
      }
    });

    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const userObj = JSON.parse(userStr);
        if (userObj.tenantId) {
          data.append('tenantId', userObj.tenantId);
        }
      }
    } catch (e) { }

    // Lógica para crear (POST) o actualizar (PUT)
    const url = id ? `/api/subsidiaries/${id}` : '/api/subsidiaries';
    const method = id ? 'PUT' : 'POST';
    const token = localStorage.getItem('token');

    try {
      const response = await fetch(url, {
        method,
        body: data,
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      if (!response.ok) {
        throw new Error('No se pudo guardar la subsidiaria.');
      }
    } catch (error) {
      console.error("Error al guardar la subsidiaria:", error);
      alert("No se pudo guardar la subsidiaria.");
    }

    setIsModalOpen(false);
    setEditingSubsidiary(null);
    fetchSubsidiaries();
  };

  const handleToggleClick = (subsidiary: any) => {
    setSubsidiaryToToggle(subsidiary);
    setIsConfirmModalOpen(true);
  };

  const confirmToggleStatus = async (subsidiary: any) => {
    try {
      const response = await fetch(`/api/subsidiaries/${subsidiary.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !subsidiary.isActive }),
      });
      if (!response.ok) {
        throw new Error('No se pudo actualizar el estado.');
      }
      // Recargar la lista para mostrar el cambio
      fetchSubsidiaries();
      setIsConfirmModalOpen(false);
      setSubsidiaryToToggle(null);
    } catch (error) {
      console.error("Error al cambiar el estado de la subsidiaria:", error);
      alert("No se pudo actualizar el estado de la subsidiaria.");
    }
  };

  const handleEdit = (subsidiary) => {
    setEditingSubsidiary(subsidiary);
    setIsModalOpen(true);
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-96"><Loader2 className="w-16 h-16 text-blue-600 animate-spin" /></div>;
  }

  // --- Paginación ---
  const totalItems = subsidiaries.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedSubsidiaries = subsidiaries.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <>
      <div className="bg-white rounded-lg shadow-md p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Gestionar Subsidiarias</h2>
          <button onClick={() => { setEditingSubsidiary(null); setIsModalOpen(true); }} className="flex items-center bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700">
            <PlusCircle className="w-5 h-5 mr-2" />
            Agregar Nueva Subsidiaria
          </button>
        </div>

        {error && <div className="bg-red-100 text-red-700 p-4 rounded-md text-center mb-4">{error}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-left table-auto">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-sm font-semibold text-gray-600">Nombre</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-600">RFC</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-600">Razón Social</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-600">Estado</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-600 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginatedSubsidiaries.map((sub: any) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{sub.name}</td>
                  <td className="px-4 py-3 text-gray-700">{sub.rfc}</td>
                  <td className="px-4 py-3 text-gray-700">{sub.businessName}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${sub.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {sub.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <button onClick={() => handleEdit(sub)} className="bg-white text-gray-600 p-1.5 rounded hover:bg-gray-100 hover:text-blue-600 transition-colors border border-gray-200" title="Editar">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleToggleClick(sub)} className={`p-1.5 rounded border transition-colors ${sub.isActive ? 'bg-white text-red-500 border-gray-200 hover:bg-red-50' : 'bg-red-50 text-green-600 border-red-200 hover:bg-green-50'}`} title={sub.isActive ? "Inactivar" : "Reactivar"}>
                        {sub.isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* --- Controles de Paginación --- */}
        {subsidiaries.length > 0 && (
          <div className="flex flex-col sm:flex-row justify-between items-center mt-6 text-sm text-gray-600">
            <div className="flex items-center space-x-2 mb-4 sm:mb-0">
              <span>Mostrar</span>
              <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={10}>10</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={500}>500</option>
              </select>
              <span>registros por página</span>
            </div>

            <div className="flex items-center space-x-4">
              <span>
                Mostrando del {totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1} al {Math.min(currentPage * pageSize, totalItems)} de {totalItems} registros
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
      <SubsidiaryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        subsidiary={editingSubsidiary}
      />
      <ConfirmToggleModal
        subsidiary={subsidiaryToToggle}
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={confirmToggleStatus}
      />
    </>
  );
};

export default SubsidiariesPage;
