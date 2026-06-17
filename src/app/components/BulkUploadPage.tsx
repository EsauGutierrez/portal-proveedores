"use client";

import React, { useState, useEffect, useRef } from 'react';
import { UploadCloud, CheckCircle, AlertTriangle, Clock, Loader2, X, Search, ChevronDown } from 'lucide-react';

const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('token') : null;
const authFetch = (url: string, opts: RequestInit = {}) => fetch(url, {
  ...opts,
  headers: { 'Authorization': `Bearer ${getToken()}`, ...(opts.headers || {}) },
});

// Colores por estado
const statusConfig = {
  success: { icon: <CheckCircle className="w-4 h-4 text-green-500" />, label: 'Procesada', bg: 'bg-green-50 border-green-200' },
  pending: { icon: <Clock className="w-4 h-4 text-amber-500" />, label: 'Sin OC asignada', bg: 'bg-amber-50 border-amber-200' },
  error: { icon: <AlertTriangle className="w-4 h-4 text-red-500" />, label: 'Error', bg: 'bg-red-50 border-red-200' },
};

// --- Bandeja de Pendientes ---
const PendingAssignmentPanel = () => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [poSearch, setPoSearch] = useState<Record<string, string>>({});
  const [poResults, setPoResults] = useState<Record<string, any[]>>({});
  const [assigning, setAssigning] = useState<string | null>(null);

  const fetchPending = () => {
    setLoading(true);
    authFetch('/api/invoices/pending-assignment')
      .then(r => r.json())
      .then(data => setInvoices(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPending(); }, []);

  const searchPO = async (invoiceId: string, term: string) => {
    setPoSearch(p => ({ ...p, [invoiceId]: term }));
    if (!term || term.length < 2) { setPoResults(p => ({ ...p, [invoiceId]: [] })); return; }
    const res = await authFetch(`/api/purchase-orders?search=${encodeURIComponent(term)}`);
    const data = await res.json();
    setPoResults(p => ({ ...p, [invoiceId]: Array.isArray(data) ? data : (data.data ?? []) }));
  };

  const assignPO = async (invoiceId: string, purchaseOrderId: string) => {
    setAssigning(invoiceId);
    const res = await authFetch('/api/invoices/pending-assignment', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId, purchaseOrderId }),
    });
    if (res.ok) {
      setInvoices(p => p.filter(inv => inv.id !== invoiceId));
      setPoSearch(p => { const n = { ...p }; delete n[invoiceId]; return n; });
      setPoResults(p => { const n = { ...p }; delete n[invoiceId]; return n; });
    }
    setAssigning(null);
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;

  if (invoices.length === 0) return (
    <div className="text-center py-8 text-gray-400">
      <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-400" />
      <p className="font-medium">No hay facturas pendientes de asignación.</p>
    </div>
  );

  return (
    <div className="space-y-3 mt-4">
      {invoices.map(inv => (
        <div key={inv.id} className="border border-amber-200 bg-amber-50 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800 font-mono truncate max-w-xs">{inv.folio}</p>
              <p className="text-xs text-gray-500">{inv.supplierName} · {inv.supplierRfc} · ${Number(inv.total).toFixed(2)}</p>
              <p className="text-xs text-gray-400">Subida por: {inv.uploadedBy}</p>
            </div>
            <div className="flex-1 max-w-sm relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={poSearch[inv.id] || ''}
                  onChange={e => searchPO(inv.id, e.target.value)}
                  placeholder="Buscar OC por folio..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {(poResults[inv.id] || []).length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {poResults[inv.id].map((po: any) => (
                    <button
                      key={po.id}
                      onClick={() => assignPO(inv.id, po.id)}
                      disabled={assigning === inv.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-0"
                    >
                      <span className="font-medium">{po.folio}</span>
                      <span className="text-gray-400 ml-2">${Number(po.total).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// --- Componente Principal ---
const BulkUploadPage = ({ user }) => {
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [supplierUserId, setSupplierUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'pending'>('upload');
  const inputRef = useRef<HTMLInputElement>(null);
  const isCargador = user?.role === 'CARGADOR';

  const handleUpload = async () => {
    if (!zipFile) return;
    setLoading(true);
    setResults(null);

    const formData = new FormData();
    formData.append('zipFile', zipFile);
    if (supplierUserId) formData.append('supplierUserId', supplierUserId);

    const res = await authFetch('/api/invoices/bulk', { method: 'POST', body: formData });
    const data = await res.json();
    setResults(data);
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          { key: 'upload', label: 'Carga Masiva' },
          { key: 'pending', label: 'Facturas sin OC' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'upload' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-1">Carga Masiva de Facturas</h2>
          <p className="text-sm text-gray-500 mb-6">
            Sube un archivo ZIP con pares XML+PDF. El sistema los empareja por nombre y busca la OC automáticamente.
            Puede tener subcarpetas por proveedor (RFC) u OC.
          </p>

          {/* Drop zone */}
          <label
            htmlFor="zip-upload"
            className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-500 hover:bg-gray-50 transition-colors"
          >
            {zipFile ? (
              <div className="text-center">
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
                <p className="mt-2 text-sm font-semibold text-gray-700">{zipFile.name}</p>
                <p className="text-xs text-gray-400">{(zipFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            ) : (
              <div className="text-center">
                <UploadCloud className="w-10 h-10 text-gray-400 mx-auto" />
                <p className="mt-2 text-sm text-gray-500">Arrastra tu ZIP aquí o <span className="text-blue-600 font-semibold">selecciona el archivo</span></p>
                <p className="text-xs text-gray-400 mt-1">Solo archivos .zip</p>
              </div>
            )}
          </label>
          <input
            id="zip-upload"
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={e => setZipFile(e.target.files?.[0] ?? null)}
          />

          <div className="mt-6 flex justify-end gap-3">
            {zipFile && (
              <button onClick={() => { setZipFile(null); setResults(null); }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-1">
                <X className="w-4 h-4" /> Quitar
              </button>
            )}
            <button
              onClick={handleUpload}
              disabled={!zipFile || loading}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</> : 'Procesar ZIP'}
            </button>
          </div>

          {/* Resultados */}
          {results && (
            <div className="mt-8">
              <div className="flex items-center gap-6 p-4 bg-gray-50 rounded-lg mb-4 text-sm">
                <span className="text-gray-600">Total: <strong>{results.total}</strong></span>
                <span className="text-green-700">Procesadas: <strong>{results.succeeded}</strong></span>
                <span className="text-amber-700">Sin OC: <strong>{results.pending}</strong></span>
                <span className="text-red-700">Errores: <strong>{results.failed}</strong></span>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {results.results?.map((r: any, i: number) => {
                  const cfg = statusConfig[r.status];
                  return (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${cfg.bg}`}>
                      {cfg.icon}
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-xs text-gray-500 truncate">{r.uuid || r.xmlName}</p>
                        <p className="text-gray-700 text-xs mt-0.5">{r.message}</p>
                      </div>
                      <span className="flex-shrink-0 text-xs font-semibold text-gray-500">{cfg.label}</span>
                    </div>
                  );
                })}
              </div>
              {results.pending > 0 && (
                <button
                  onClick={() => setActiveTab('pending')}
                  className="mt-4 text-sm text-amber-700 underline hover:text-amber-900"
                >
                  Ver {results.pending} factura(s) pendiente(s) de asignar OC →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'pending' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-1">Facturas sin OC Asignada</h2>
          <p className="text-sm text-gray-500">Busca la OC correspondiente para cada factura pendiente y asígnala manualmente.</p>
          <PendingAssignmentPanel />
        </div>
      )}
    </div>
  );
};

export default BulkUploadPage;
