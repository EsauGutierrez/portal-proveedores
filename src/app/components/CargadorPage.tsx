"use client";

import React, { useState, useEffect } from 'react';
import { ChevronLeft, Building2, Loader2, AlertCircle, Users, ShoppingCart, FileText } from 'lucide-react';
import DataTable from './DataTable';
import SupplierDocumentsPage from './SupplierDocumentsPage';

const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('token') : null;
const authFetch = (url: string) => fetch(url, { headers: { 'Authorization': `Bearer ${getToken()}` } });

// --- Pantalla: Selector de Proveedor ---
const SupplierSelector = ({ onSelect }) => {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/cargador/suppliers')
      .then(r => r.json())
      .then(data => setSuppliers(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex justify-center items-center h-96">
      <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
    </div>
  );

  if (suppliers.length === 0) return (
    <div className="flex flex-col items-center justify-center h-96 text-gray-400 gap-3">
      <Users className="w-12 h-12" />
      <p className="text-lg font-medium">No tienes proveedores asignados.</p>
      <p className="text-sm">Contacta al administrador para que te asigne proveedores.</p>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Seleccionar Proveedor</h2>
      <p className="text-sm text-gray-500 mb-6">Selecciona el proveedor para cargar facturas en su nombre.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {suppliers.map((s: any) => (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className="flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-md hover:bg-blue-50 transition-all text-left group"
          >
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100">
              <Building2 className="w-6 h-6 text-gray-400 group-hover:text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate" title={s.companyName}>{s.companyName}</p>
              <p className="text-xs text-gray-500">{s.rfc}</p>
              <p className="text-xs text-gray-400">{s.subsidiary?.name}</p>
            </div>
            <span className={`ml-auto flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${
              s.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {s.status === 'ACTIVE' ? 'Activo' : 'Pendiente'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

// --- Pantalla: Vista de OCs del proveedor seleccionado ---
const SupplierContext = ({ supplier, onBack, cargadorUserId }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'ordenes' | 'documentos'>('ordenes');

  useEffect(() => {
    setLoading(true);
    authFetch(`/api/purchase-orders?supplierUserId=${supplier.userId}`)
      .then(r => r.json())
      .then(data => setOrders(Array.isArray(data) ? data : (data.data ?? [])))
      .catch(() => setError('Error al cargar las órdenes de compra.'))
      .finally(() => setLoading(false));
  }, [supplier.userId]);

  return (
    <div>
      {/* Header de contexto */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Cambiar proveedor
        </button>
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          <Building2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-800">{supplier.companyName}</p>
            <p className="text-xs text-blue-600">{supplier.rfc} · {supplier.subsidiary?.name}</p>
          </div>
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
          Cargando en nombre de este proveedor
        </span>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('ordenes')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
            activeTab === 'ordenes'
              ? 'border-blue-600 text-blue-600 bg-blue-50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <ShoppingCart className="w-4 h-4" /> Órdenes de Compra
        </button>
        <button
          onClick={() => setActiveTab('documentos')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
            activeTab === 'documentos'
              ? 'border-blue-600 text-blue-600 bg-blue-50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <FileText className="w-4 h-4" /> Documentos
        </button>
      </div>

      {activeTab === 'ordenes' && (
        loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
            <AlertCircle className="w-5 h-5" /> {error}
          </div>
        ) : (
          <DataTable
            title="Órdenes de Compra"
            data={orders}
            uploadedBy={cargadorUserId}
            supplierUserId={supplier.userId}
          />
        )
      )}

      {activeTab === 'documentos' && (
        <SupplierDocumentsPage
          user={null}
          supplierProfileId={supplier.id}
        />
      )}
    </div>
  );
};

// --- Componente Principal ---
const CargadorPage = ({ user }) => {
  const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);

  return selectedSupplier ? (
    <SupplierContext
      supplier={selectedSupplier}
      onBack={() => setSelectedSupplier(null)}
      cargadorUserId={user?.userId}
    />
  ) : (
    <SupplierSelector onSelect={setSelectedSupplier} />
  );
};

export default CargadorPage;
