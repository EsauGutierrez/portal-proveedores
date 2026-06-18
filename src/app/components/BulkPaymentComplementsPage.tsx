"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload, CheckCircle, XCircle, Loader2, AlertCircle,
  FileArchive, ChevronDown, ChevronRight, RefreshCw, Package,
  ChevronLeft, ChevronRight as ChevronRightIcon,
} from 'lucide-react';

interface BulkFileResult {
  filename: string;
  complementUUID: string | null;
  invoiceUUID: string | null;
  status: 'success' | 'error';
  error?: string;
  netsuiteSyncStatus?: string;
  netsuitePaymentId?: string;
  paymentComplementId?: string;
}

interface BulkLog {
  id: string;
  zipFilename: string | null;
  status: string;
  totalFiles: number;
  successCount: number;
  failedCount: number;
  createdAt: string;
  results?: BulkFileResult[];
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; Icon: any }> = {
  PROCESSING:            { label: 'Procesando…',            color: 'text-amber-700',  bg: 'bg-amber-50',  Icon: Loader2 },
  COMPLETED:             { label: 'Completado',             color: 'text-green-700',  bg: 'bg-green-50',  Icon: CheckCircle },
  COMPLETED_WITH_ERRORS: { label: 'Completado con errores', color: 'text-orange-700', bg: 'bg-orange-50', Icon: AlertCircle },
  FAILED:                { label: 'Fallido',                color: 'text-red-700',    bg: 'bg-red-50',    Icon: XCircle },
};

const NS_STATUS_MAP: Record<string, { label: string; color: string }> = {
  SYNCED:       { label: 'En NetSuite',  color: 'text-green-700' },
  PENDING_SYNC: { label: 'Pendiente',    color: 'text-amber-700' },
  FAILED:       { label: 'Error NS',     color: 'text-red-700' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || STATUS_MAP.PROCESSING;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.color} ${s.bg}`}>
      <s.Icon className={`w-3.5 h-3.5 ${status === 'PROCESSING' ? 'animate-spin' : ''}`} />
      {s.label}
    </span>
  );
}

function ShortUUID({ uuid }: { uuid: string | null }) {
  if (!uuid) return <span className="text-gray-400">—</span>;
  const short = uuid.length > 8 ? `${uuid.slice(0, 8)}…` : uuid;
  return (
    <span className="font-mono text-xs text-gray-500" title={uuid}>
      {short}
    </span>
  );
}

function ResultRow({ r }: { r: BulkFileResult }) {
  const nsStatus = r.netsuiteSyncStatus ? NS_STATUS_MAP[r.netsuiteSyncStatus] : null;
  const isSuccess = r.status === 'success';

  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50 align-top">
      {/* Archivo */}
      <td className="py-2.5 px-3 text-xs font-mono text-gray-700 max-w-[140px]">
        <span className="block truncate" title={r.filename}>{r.filename}</span>
      </td>

      {/* Estado */}
      <td className="py-2.5 px-3 whitespace-nowrap">
        {isSuccess ? (
          <span className="inline-flex items-center gap-1 text-green-700 text-xs font-semibold">
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> OK
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-red-700 text-xs font-semibold">
            <XCircle className="w-3.5 h-3.5 flex-shrink-0" /> Error
          </span>
        )}
      </td>

      {/* UUIDs — se ocultan en pantallas muy pequeñas */}
      <td className="py-2.5 px-3 hidden sm:table-cell">
        <ShortUUID uuid={r.invoiceUUID} />
      </td>
      <td className="py-2.5 px-3 hidden md:table-cell">
        <ShortUUID uuid={r.complementUUID} />
      </td>

      {/* NetSuite */}
      <td className="py-2.5 px-3 whitespace-nowrap hidden sm:table-cell">
        {nsStatus ? (
          <span className={`text-xs font-medium ${nsStatus.color}`}>{nsStatus.label}</span>
        ) : <span className="text-gray-400 text-xs">—</span>}
      </td>

      {/* Detalle / error */}
      <td className="py-2.5 px-3 text-xs max-w-[200px]">
        {r.error ? (
          <span className="text-red-600 break-words">{r.error}</span>
        ) : r.netsuitePaymentId ? (
          <span className="text-green-700 font-mono">ID {r.netsuitePaymentId}</span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
    </tr>
  );
}

// Paginación local de la tabla interna de resultados
const RESULTS_PAGE_SIZE = 15;

function ResultsTable({ results }: { results: BulkFileResult[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(results.length / RESULTS_PAGE_SIZE);
  const slice = results.slice(page * RESULTS_PAGE_SIZE, (page + 1) * RESULTS_PAGE_SIZE);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-left min-w-[480px]">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="py-2 px-3">Archivo</th>
              <th className="py-2 px-3">Estado</th>
              <th className="py-2 px-3 hidden sm:table-cell">UUID Factura</th>
              <th className="py-2 px-3 hidden md:table-cell">UUID Complemento</th>
              <th className="py-2 px-3 hidden sm:table-cell">NetSuite</th>
              <th className="py-2 px-3">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => <ResultRow key={i} r={r} />)}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500 px-1">
          <span>
            {page * RESULTS_PAGE_SIZE + 1}–{Math.min((page + 1) * RESULTS_PAGE_SIZE, results.length)} de {results.length} archivos
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-1 tabular-nums">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LogDetail({ logId, token, onStatusChange }: { logId: string; token: string; onStatusChange?: (status: string) => void }) {
  const [log, setLog] = useState<BulkLog | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchLog = useCallback(async () => {
    try {
      const res = await fetch(`/api/payment-complements/bulk/${logId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setLog(data);
      onStatusChange?.(data.status);
      if (data.status === 'PROCESSING') {
        pollRef.current = setTimeout(fetchLog, 4000);
      }
    } catch { /* ignore */ }
  }, [logId, token, onStatusChange]);

  useEffect(() => {
    fetchLog();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [fetchLog]);

  if (!log) return (
    <div className="flex items-center gap-2 py-4 px-4 text-sm text-gray-500">
      <Loader2 className="w-4 h-4 animate-spin" /> Cargando detalle…
    </div>
  );

  const results: BulkFileResult[] = Array.isArray(log.results) ? log.results : [];

  return (
    <div className="px-4 pb-4 pt-1">
      {results.length > 0 ? (
        <ResultsTable results={results} />
      ) : (
        <p className="text-sm text-gray-400 italic py-2">
          {log.status === 'PROCESSING' ? 'Esperando resultados…' : 'Sin resultados registrados.'}
        </p>
      )}
    </div>
  );
}

function HistoryRow({ log, token, defaultOpen = false }: { log: BulkLog; token: string; defaultOpen?: boolean }) {
  const [expanded, setExpanded] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
            : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
          <FileArchive className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-700 truncate">{log.zipFilename || 'archivo.zip'}</span>
          <StatusBadge status={log.status} />
        </div>
        <div className="flex items-center gap-2 text-xs flex-shrink-0 ml-2">
          {log.successCount > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">
              <CheckCircle className="w-3 h-3" />{log.successCount} ok
            </span>
          )}
          {log.failedCount > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">
              <XCircle className="w-3 h-3" />{log.failedCount} error{log.failedCount !== 1 ? 'es' : ''}
            </span>
          )}
          <span className="text-gray-400">{new Date(log.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
      </button>
      {expanded && <LogDetail logId={log.id} token={token} />}
    </div>
  );
}

const HISTORY_PAGE_SIZE = 20;

interface AssignedSupplier {
  id: string;
  companyName: string;
  rfc: string;
  userId: string;
}

export default function BulkPaymentComplementsPage({ user: _user }: { user: any }) {
  const isCargador = _user?.role === 'CARGADOR';

  const [zipFile, setZipFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  const [activeLogStatus, setActiveLogStatus] = useState<string>('PROCESSING');
  const [history, setHistory] = useState<BulkLog[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [assignedSuppliers, setAssignedSuppliers] = useState<AssignedSupplier[]>([]);
  const [supplierUserId, setSupplierUserId] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';

  const fetchHistory = useCallback(async (page = 1, append = false) => {
    append ? setLoadingMore(true) : setLoadingHistory(true);
    try {
      const res = await fetch(`/api/payment-complements/bulk?page=${page}&limit=${HISTORY_PAGE_SIZE}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(prev => append ? [...prev, ...(data.data || [])] : (data.data || []));
        setHistoryTotal(data.total || 0);
        setHistoryPage(page);
      }
    } catch { /* ignore */ }
    append ? setLoadingMore(false) : setLoadingHistory(false);
  }, [token]);

  useEffect(() => { fetchHistory(1); }, [fetchHistory]);

  useEffect(() => {
    if (!isCargador) return;
    fetch('/api/cargador/suppliers', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((data: AssignedSupplier[]) => setAssignedSuppliers(data))
      .catch(() => {});
  }, [isCargador, token]);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(''), 5000);
    return () => clearTimeout(t);
  }, [success]);

  const handleUpload = async () => {
    if (!zipFile) return;
    if (isCargador && !supplierUserId) {
      setError('Debes seleccionar un proveedor antes de subir el ZIP.');
      return;
    }
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const form = new FormData();
      form.append('zipFile', zipFile);
      if (isCargador && supplierUserId) form.append('supplierUserId', supplierUserId);
      const res = await fetch('/api/payment-complements/bulk', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Error al iniciar la carga.');
      } else {
        setActiveLogId(data.logId);
        setActiveLogStatus('PROCESSING');
        setSuccess('ZIP enviado. El procesamiento inició en segundo plano — el resultado aparecerá en el historial de abajo.');
        setZipFile(null);
        await fetchHistory(1);
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    }
    setUploading(false);
  };

  // Logs visibles en historial — excluir el que ya se muestra arriba como activo
  const historyFiltered = activeLogId
    ? history.filter(l => l.id !== activeLogId)
    : history;

  const hasMore = history.length < historyTotal;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Carga masiva de complementos de pago</h1>
        <p className="text-sm text-gray-500 mt-1">
          Sube un ZIP con archivos XML y PDF nombrados igual (ej.{' '}
          <code className="bg-gray-100 px-1 rounded text-xs">uuid.xml</code>{' '}+{' '}
          <code className="bg-gray-100 px-1 rounded text-xs">uuid.pdf</code>). El PDF es opcional.
        </p>
      </div>

      {/* Upload card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Subir archivo ZIP</h2>

        {isCargador && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Proveedor <span className="text-red-500">*</span>
            </label>
            <select
              value={supplierUserId}
              onChange={e => setSupplierUserId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Selecciona un proveedor —</option>
              {assignedSuppliers.map(s => (
                <option key={s.userId} value={s.userId}>
                  {s.companyName} ({s.rfc})
                </option>
              ))}
            </select>
          </div>
        )}

        <label
          htmlFor="zip-input"
          className={`flex flex-col items-center justify-center w-full min-h-[140px] border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
            zipFile ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }`}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f?.name.toLowerCase().endsWith('.zip')) setZipFile(f);
            else setError('Solo se aceptan archivos .zip');
          }}
        >
          {zipFile ? (
            <div className="flex flex-col items-center gap-2 text-blue-700">
              <FileArchive className="w-10 h-10" />
              <span className="font-medium text-sm">{zipFile.name}</span>
              <span className="text-xs text-gray-500">{(zipFile.size / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                onClick={e => { e.preventDefault(); setZipFile(null); }}
                className="text-xs text-red-500 hover:underline mt-1"
              >
                Quitar archivo
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <Package className="w-10 h-10" />
              <span className="text-sm font-medium">Arrastra tu ZIP aquí o haz clic para seleccionar</span>
              <span className="text-xs">Solo archivos .zip</span>
            </div>
          )}
          <input
            id="zip-input"
            type="file"
            accept=".zip"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) setZipFile(f);
              e.target.value = '';
            }}
          />
        </label>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}
        {success && (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!zipFile || uploading}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Enviando…' : 'Iniciar procesamiento'}
        </button>
      </div>

      {/* Resultado activo (polling) — solo aparece después de subir */}
      {activeLogId && (() => {
        const isDone = activeLogStatus !== 'PROCESSING';
        const s = STATUS_MAP[activeLogStatus] || STATUS_MAP.PROCESSING;
        return (
          <div className={`bg-white rounded-xl shadow-sm overflow-hidden border ${isDone ? 'border-gray-200' : 'border-blue-200'}`}>
            <div className={`flex items-center justify-between px-4 py-3 border-b text-sm font-medium ${isDone ? 'bg-gray-50 border-gray-100' : 'bg-blue-50 border-blue-100'}`}>
              <div className="flex items-center gap-2">
                {isDone
                  ? <s.Icon className={`w-4 h-4 flex-shrink-0 ${s.color}`} />
                  : <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 text-blue-600" />}
                <span className={isDone ? s.color : 'text-blue-800'}>
                  {isDone ? s.label : 'Procesando carga — actualizando automáticamente…'}
                </span>
              </div>
              {isDone && (
                <button
                  onClick={() => { setActiveLogId(null); fetchHistory(1); }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Cerrar ✕
                </button>
              )}
            </div>
            <LogDetail logId={activeLogId} token={token} onStatusChange={setActiveLogStatus} />
          </div>
        );
      })()}

      {/* Historial */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800">Historial de cargas</h2>
            {historyTotal > 0 && (
              <span className="text-xs text-gray-400 tabular-nums">
                ({history.length} de {historyTotal})
              </span>
            )}
          </div>
          <button
            onClick={() => fetchHistory(1)}
            disabled={loadingHistory}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {loadingHistory && history.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando historial…
          </div>
        ) : historyFiltered.length === 0 && !activeLogId ? (
          <p className="text-sm text-gray-400 italic py-4 text-center">Aún no hay cargas masivas registradas.</p>
        ) : (
          <>
            <div className="space-y-2">
              {historyFiltered.map((log, i) => (
                <HistoryRow key={log.id} log={log} token={token} defaultOpen={i === 0 && !activeLogId} />
              ))}
            </div>

            {hasMore && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => fetchHistory(historyPage + 1, true)}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {loadingMore ? 'Cargando…' : `Ver más (${historyTotal - history.length} restantes)`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
