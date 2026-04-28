// app/components/PaymentComplementsPage.tsx

"use client";

import React, { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle, XCircle, Clock, Download, Plus, X, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

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

const PaymentComplementsPage = ({ user }: { user: any }) => {
  const [complements, setComplements] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [formData, setFormData] = useState({ invoiceId: '' });
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.invoiceId || !xmlFile) {
      setNotification({ type: 'error', message: 'La factura y el archivo XML son obligatorios.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('invoiceId', formData.invoiceId);
      fd.append('xmlFile', xmlFile);
      if (pdfFile) fd.append('pdfFile', pdfFile);

      const res = await fetch('/api/payment-complements', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Error al subir el complemento.');

      const syncMsg = data.netsuiteSyncStatus === 'SYNCED'
        ? 'Complemento registrado y sincronizado correctamente con NetSuite.'
        : data.netsuiteSyncStatus === 'FAILED'
        ? `Complemento registrado, pero falló la sincronización con NetSuite. ${data.message || ''}`
        : 'Complemento registrado correctamente.';
      setNotification({ type: data.netsuiteSyncStatus === 'FAILED' ? 'error' : 'success', message: syncMsg });
      setShowForm(false);
      setFormData({ invoiceId: '' });
      setXmlFile(null);
      setPdfFile(null);
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
            onClick={() => setShowForm(!showForm)}
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Factura relacionada *</label>
              <select
                required
                value={formData.invoiceId}
                onChange={(e) => setFormData({ ...formData, invoiceId: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-white text-sm"
              >
                <option value="">Selecciona una factura</option>
                {invoices.map((inv: any) => (
                  <option key={inv.id || inv.folio} value={inv.id || inv.folio}>
                    {inv.folio} — {inv.fecha} — ${Number(inv.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FileInput
                label="Archivo XML *"
                accept=".xml,text/xml,application/xml"
                file={xmlFile}
                onChange={setXmlFile}
              />
              <FileInput
                label="Archivo PDF (opcional)"
                accept="application/pdf"
                file={pdfFile}
                onChange={setPdfFile}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Enviar complemento
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setXmlFile(null); setPdfFile(null); }}
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Folio/UUID</th>
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
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 max-w-[180px] truncate" title={c.folio}>
                      {c.folio.length > 20 ? c.folio.substring(0, 8) + '...' + c.folio.slice(-4) : c.folio}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.invoiceFolio || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.fecha}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">
                      ${Number(c.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <SyncStatusBadge status={c.netsuiteSyncStatus} />
                      {c.netsuiteSyncStatus === 'FAILED' && c.netsuiteSyncError && (
                        <p className="text-xs text-red-600 mt-1 max-w-[200px] truncate" title={c.netsuiteSyncError}>
                          {c.netsuiteSyncError}
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
                      <td colSpan={6} className="px-4 py-1.5">
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
    </div>
  );
};

export default PaymentComplementsPage;
