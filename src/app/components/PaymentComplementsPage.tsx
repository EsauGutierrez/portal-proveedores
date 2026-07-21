// app/components/PaymentComplementsPage.tsx

"use client";

import React, { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle, XCircle, Clock, Download, Plus, X, Loader2, AlertCircle, ChevronDown, RefreshCw } from 'lucide-react';

const SYNC_STATUS_MAP: Record<string, { label: string; color: string; bg: string; Icon: any }> = {
  SYNCED:       { label: 'Registrado en NetSuite', color: 'text-green-700',  bg: 'bg-green-50',  Icon: CheckCircle },
  PENDING_SYNC: { label: 'Procesando…',            color: 'text-amber-700',  bg: 'bg-amber-50',  Icon: Clock },
  FAILED:       { label: 'Error al sincronizar',   color: 'text-red-700',    bg: 'bg-red-50',    Icon: XCircle },
};

const SyncStatusBadge = ({ status }: { status: string }) => {
  const s = SYNC_STATUS_MAP[status] || SYNC_STATUS_MAP.PENDING_SYNC;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${s.color} ${s.bg}`}>
      <s.Icon className="w-3.5 h-3.5" />
      {s.label}
    </span>
  );
};

const FileInput = ({ label, accept, file, onChange }: {
  label: string;
  accept: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <label className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-gray-50 transition-colors">
      {file ? (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onChange(null); }}
            className="ml-1 text-gray-400 hover:text-red-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="text-center">
          <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
          <p className="text-sm text-gray-500">{label.includes('PDF') ? 'PDF' : 'XML'}</p>
        </div>
      )}
      <input
        type="file"
        className="hidden"
        accept={accept}
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
    </label>
  </div>
);

const fmt = (iso: string) => (iso ? iso.substring(0, 10) : '—');

const PaymentComplementsPage = ({ user }: { user: any }) => {
  const [complements, setComplements] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [xmlValidationError, setXmlValidationError] = useState<string | null>(null);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const toggleInvoice = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const getXmlUuids = async (file: File): Promise<Set<string>> => {
    const text = await file.text();
    // Regex directo al texto — funciona con cualquier namespace (pago20:, pago:, sin prefijo)
    const uuids = new Set<string>();
    const matches = text.matchAll(/IdDocumento="([^"]+)"/g);
    for (const m of matches) uuids.add(m[1].toUpperCase());
    return uuids;
  };

  const runXmlValidation = async (file: File | null, ids: Set<string>) => {
    if (!file || ids.size === 0) { setXmlValidationError(null); return; }
    try {
      const xmlUuids = await getXmlUuids(file);
      const selected = invoices.filter((inv: any) => ids.has(inv.id));
      const missing = selected.filter((inv: any) => !xmlUuids.has((inv.folio || '').toUpperCase()));
      if (missing.length > 0) {
        const folios = missing.map((inv: any) => {
          const f = inv.folio || '';
          return f.length > 16 ? f.substring(0, 8) + '…' + f.slice(-4) : f;
        });
        setXmlValidationError(
          `El XML no referencia ${missing.length === 1 ? 'la factura' : 'las facturas'}: ${folios.join(', ')}`
        );
      } else {
        setXmlValidationError(null);
      }
    } catch { setXmlValidationError(null); }
  };

  const handleXmlChange = (file: File | null) => {
    setXmlFile(file);
    runXmlValidation(file, selectedIds);
  };

  useEffect(() => {
    runXmlValidation(xmlFile, selectedIds);
  }, [selectedIds]);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = { Authorization: `Bearer ${token}` };

  const load = async () => {
    setIsLoading(true);
    try {
      const [compRes, invRes] = await Promise.all([
        fetch('/api/payment-complements', { headers }),
        fetch('/api/invoices', { headers }),
      ]);
      if (compRes.ok) { const d = await compRes.json(); setComplements(Array.isArray(d) ? d : (d.data ?? [])); }
      if (invRes.ok) { const d = await invRes.json(); setInvoices(Array.isArray(d) ? d : (d.data ?? [])); }
    } catch {}
    setIsLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    setNotification(null);
    try {
      const res = await fetch(`/api/payment-complements/${id}/retry`, { method: 'POST', headers });
      const d = await res.json();
      if (!res.ok || d.success === false) {
        setNotification({ type: 'error', message: d.message || 'No se pudo reenviar el complemento.' });
      } else {
        setNotification({ type: 'success', message: 'Complemento reenviado y sincronizado con NetSuite.' });
      }
      await load();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error al reenviar el complemento.' });
    } finally {
      setRetryingId(null);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setSelectedIds(new Set());
    setXmlFile(null);
    setPdfFile(null);
    setDropdownOpen(false);
    setXmlValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.size === 0) {
      setNotification({ type: 'error', message: 'Selecciona al menos una factura.' });
      return;
    }
    if (!xmlFile) {
      setNotification({ type: 'error', message: 'El archivo XML es requerido.' });
      return;
    }
    if (xmlValidationError) {
      setNotification({ type: 'error', message: xmlValidationError });
      return;
    }

    setIsSubmitting(true);
    try {
      const results = await Promise.all(Array.from(selectedIds).map(async (invoiceId) => {
        const fd = new FormData();
        fd.append('invoiceId', invoiceId);
        fd.append('xmlFile', xmlFile);
        if (pdfFile) fd.append('pdfFile', pdfFile);
        const res = await fetch('/api/payment-complements', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Error al subir el complemento.');
        return data;
      }));

      const allSynced = results.every(d => d.netsuiteSyncStatus === 'SYNCED');
      const anyFailed = results.some(d => d.netsuiteSyncStatus === 'FAILED');
      const syncMsg = allSynced
        ? `${results.length} complemento(s) registrado(s) y sincronizado(s) correctamente con NetSuite.`
        : anyFailed
        ? `Algunos complementos fallaron al sincronizar con NetSuite.`
        : `${results.length} complemento(s) registrado(s) correctamente.`;

      setNotification({ type: anyFailed ? 'error' : 'success', message: syncMsg });
      resetForm();
      load();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSupplierActive = user?.supplierStatus === 'ACTIVE';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Complementos de Pago</h1>
          <p className="text-sm text-gray-500 mt-1">Sube los XML y PDF de tus complementos de pago vinculados a facturas.</p>
        </div>
        {isSupplierActive && (
          <button
            onClick={() => showForm ? resetForm() : setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo complemento
          </button>
        )}
      </div>

      {/* Notificación */}
      {notification && (
        <div className={`flex items-start gap-3 p-4 rounded-lg mb-6 ${notification.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {notification.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <div className="flex-1 text-sm">{notification.message}</div>
          <button onClick={() => setNotification(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Formulario de carga */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Subir nuevo complemento de pago</h2>
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Selector de facturas (dropdown con checkboxes) */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Factura(s) relacionada(s) *
              </label>
              <button
                type="button"
                onClick={() => setDropdownOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 border border-gray-300 rounded-lg bg-white text-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <span className={selectedIds.size === 0 ? 'text-gray-400' : 'text-gray-900'}>
                  {selectedIds.size === 0
                    ? 'Selecciona una o varias facturas'
                    : `${selectedIds.size} factura${selectedIds.size > 1 ? 's' : ''} seleccionada${selectedIds.size > 1 ? 's' : ''}`}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <>
                  {/* Capa para cerrar al hacer clic fuera */}
                  <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {invoices.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-gray-400 italic">No tienes facturas registradas.</p>
                    ) : (
                      invoices.map((inv: any) => {
                        const folio = inv.folio || '';
                        const shortFolio = folio.length > 20 ? folio.substring(0, 8) + '…' + folio.slice(-4) : folio;
                        const fecha = fmt(inv.fecha || '');
                        const total = Number(inv.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
                        const checked = selectedIds.has(inv.id);
                        return (
                          <label
                            key={inv.id}
                            className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleInvoice(inv.id)}
                              className="w-4 h-4 rounded accent-blue-600 flex-shrink-0"
                            />
                            <span className="text-sm text-gray-800">
                              <span className="font-mono">{shortFolio}</span>
                              <span className="text-gray-400 mx-2">—</span>
                              <span className="text-gray-500">{fecha}</span>
                              <span className="text-gray-400 mx-2">—</span>
                              <span>${total}</span>
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </>
              )}
              {selectedIds.size > 0 && (
                <p className="text-xs text-blue-600 mt-1.5 font-medium">
                  {selectedIds.size} factura{selectedIds.size > 1 ? 's' : ''} seleccionada{selectedIds.size > 1 ? 's' : ''}
                </p>
              )}
            </div>

            {/* Un solo bloque de archivos para todas las facturas seleccionadas */}
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FileInput
                  label="Archivo XML *"
                  accept=".xml,text/xml,application/xml"
                  file={xmlFile}
                  onChange={handleXmlChange}
                />
                <FileInput
                  label="Archivo PDF (opcional)"
                  accept="application/pdf"
                  file={pdfFile}
                  onChange={setPdfFile}
                />
              </div>
              {xmlValidationError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{xmlValidationError}</p>
                </div>
              )}
              {xmlFile && !xmlValidationError && selectedIds.size > 0 && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <p className="text-xs text-green-700">
                    El XML referencia correctamente {selectedIds.size === 1 ? 'la factura seleccionada' : `las ${selectedIds.size} facturas seleccionadas`}.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={isSubmitting || selectedIds.size === 0 || !!xmlValidationError}
                className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {selectedIds.size > 1 ? `Enviar complemento (${selectedIds.size} facturas)` : 'Enviar complemento'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de complementos */}
      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        </div>
      ) : complements.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No has subido ningún complemento de pago aún.</p>
          {isSupplierActive && (
            <p className="text-sm text-gray-400 mt-1">Haz clic en "Nuevo complemento" para empezar.</p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Factura</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">NetSuite</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Archivos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {complements.map((c) => (
                <React.Fragment key={c.id}>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600">{c.invoiceFolio || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.fecha}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">
                      ${Number(c.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <SyncStatusBadge status={c.netsuiteSyncStatus} />
                      {c.netsuiteSyncStatus === 'FAILED' && c.netsuiteSyncError && (
                        <button
                          type="button"
                          onClick={() => setErrorModal(c.netsuiteSyncError)}
                          className="text-xs text-red-600 hover:text-red-800 underline mt-1 max-w-[200px] truncate block mx-auto"
                          title="Ver error completo"
                        >
                          {c.netsuiteSyncError}
                        </button>
                      )}
                      {c.netsuiteSyncStatus === 'FAILED' && (
                        <button
                          type="button"
                          onClick={() => handleRetry(c.id)}
                          disabled={retryingId === c.id}
                          className="inline-flex items-center gap-1 px-2 py-1 mt-1.5 bg-orange-100 hover:bg-orange-200 text-orange-700 text-xs font-semibold rounded disabled:opacity-50 transition-colors mx-auto"
                          title="Reenviar el complemento a NetSuite"
                        >
                          {retryingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Reenviar
                        </button>
                      )}
                      {c.netsuiteSyncStatus === 'SYNCED' && c.netsuitePaymentId && (
                        <p className="text-xs text-green-700 mt-1">
                          <span className="font-semibold">ID: </span>{c.netsuitePaymentId}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {c.xmlUrl && (
                          <a href={c.xmlUrl} target="_blank" rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" /> XML
                          </a>
                        )}
                        {c.pdfUrl && (
                          <a href={c.pdfUrl} target="_blank" rel="noopener noreferrer"
                            className="text-red-600 hover:text-red-800 text-xs font-medium flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" /> PDF
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                  {c.netsuiteSyncStatus === 'SYNCED' && c.netsuitePaymentId && (
                    <tr className="bg-green-50/50">
                      <td colSpan={5} className="px-4 py-1.5">
                        <p className="text-xs text-green-700">
                          <span className="font-semibold">ID NetSuite: </span>{c.netsuitePaymentId}
                        </p>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: detalle completo del error de sincronización */}
      {errorModal && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={() => setErrorModal(null)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" /> Detalle del Error
              </h3>
              <button onClick={() => setErrorModal(null)} className="text-gray-500 hover:text-gray-800"><X className="w-6 h-6" /></button>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-md p-4">
              <p className="text-sm text-red-800 whitespace-pre-wrap break-words">{errorModal}</p>
            </div>
            <div className="flex justify-end mt-5">
              <button onClick={() => setErrorModal(null)} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentComplementsPage;
