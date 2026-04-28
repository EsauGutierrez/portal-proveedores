import React, { useState, useEffect } from 'react';
import { Loader2, Search, Filter, FileText, Download, AlertCircle, FileDigit, RefreshCw, ShoppingCart, CheckCircle, XCircle, History, ChevronUp, ChevronDown, Calendar, Zap, CheckSquare, Activity, X, AlertCircle as AlertCircleIcon } from 'lucide-react';

// --- Helpers ---
const formatDuration = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
const formatLogDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const AdminInvoicesPage = () => {
    // --- Estado principal ---
    const [documents, setDocuments] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDownloading, setIsDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // --- Estado del panel de sync ---
    const [syncLogs, setSyncLogs] = useState<any[]>([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<any>(null);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [syncHistoryExpanded, setSyncHistoryExpanded] = useState(false);

    // --- Estado de retry de complementos de pago ---
    const [retryLoadingId, setRetryLoadingId] = useState<string | null>(null);

    const syncStatusConfig: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
        SUCCESS: { color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: <CheckCircle className="w-4 h-4" />, label: 'Exitosa' },
        PARTIAL: { color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', icon: <AlertCircleIcon className="w-4 h-4" />, label: 'Parcial' },
        FAILED:  { color: 'text-red-700',   bg: 'bg-red-50 border-red-200',      icon: <XCircle className="w-4 h-4" />,   label: 'Fallida' },
    };

    const fetchSyncLogs = async () => {
        setIsLoadingLogs(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/admin/sync/purchase-orders', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setSyncLogs(await res.json());
        } catch { /* silencioso */ } finally { setIsLoadingLogs(false); }
    };

    const handleSyncNow = async () => {
        setIsSyncing(true);
        setSyncResult(null);
        setSyncError(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/admin/sync/purchase-orders', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (!res.ok) { setSyncError(data.message || 'Error durante la sincronización.'); }
            else { setSyncResult(data); fetchSyncLogs(); }
        } catch (err: any) { setSyncError(err.message); }
        finally { setIsSyncing(false); }
    };

    // Filtros
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [supplierId, setSupplierId] = useState('');
    const [docType, setDocType] = useState('ALL');

    const fetchDocuments = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            // Construir Query Params para los filtros
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (supplierId) params.append('supplierId', supplierId);
            if (docType) params.append('docType', docType);

            const res = await fetch(`/api/admin/documents?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Error al cargar la información.');
            const data = await res.json();

            // Expected that the API returns { documents: [...], suppliers: [...] } (only on initial fetch we might save suppliers)
            setDocuments(data.documents || []);

            // Only update suppliers if it's the first time or they are returned
            if (data.suppliers && suppliers.length === 0) {
                setSuppliers(data.suppliers);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-fetch on component load
    useEffect(() => {
        fetchDocuments();
        fetchSyncLogs();
    }, []);

    // Also fetch when a filter button is clicked (handled explicitly below)

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchDocuments();
    };

    const handleClearFilters = () => {
        setStartDate('');
        setEndDate('');
        setSupplierId('');
        setDocType('ALL');
        // Usar setTimeout para permitir que el estado se actualice antes de re-hacer fetchDocuments.
        setTimeout(() => fetchDocuments(), 0);
    };

    const handleRetryComplement = async (id: string) => {
        setRetryLoadingId(id);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/payment-complements/${id}/retry`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const d = await res.json();
            if (!res.ok) {
                setError(d.message || 'Error al reintentar la sincronización.');
            } else {
                fetchDocuments();
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setRetryLoadingId(null);
        }
    };

    const handleDownloadZip = async () => {
        setIsDownloading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (supplierId) params.append('supplierId', supplierId);
            if (docType) params.append('docType', docType);

            const res = await fetch(`/api/admin/documents/export-zip?${params.toString()}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.message || 'Error al descargar el ZIP');
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Documentos_${new Date().getTime()}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsDownloading(false);
        }
    };



    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(amount);
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '—';
        return new Date(dateString).toLocaleDateString('es-MX', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const lastSyncLog = syncLogs[0];
    const isPurchaseOrderView = docType === 'PURCHASE_ORDER';

    // --- Paginación ---
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    useEffect(() => { setCurrentPage(1); }, [startDate, endDate, supplierId, docType, pageSize]);
    const totalItems = documents.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const paginatedDocuments = documents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                    <FileDigit className="w-8 h-8 mr-3 text-indigo-600" />
                    Búsqueda de Transacciones
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                    Consulta facturas, complementos de pago y órdenes de compra de los proveedores registrados en el portal.
                </p>
            </div>

            {/* ===== Panel de Sincronización de OC ===== */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-lg">
                            <ShoppingCart className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-gray-800">Sincronización de Órdenes de Compra</h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Solo se sincronizan OC de proveedores <span className="font-semibold text-green-600">activos</span> registrados en el portal
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {lastSyncLog && !isLoadingLogs && (
                            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${syncStatusConfig[lastSyncLog.status]?.bg} ${syncStatusConfig[lastSyncLog.status]?.color}`}>
                                {syncStatusConfig[lastSyncLog.status]?.icon}
                                Último: {formatLogDate(lastSyncLog.createdAt)}
                            </div>
                        )}
                        <button
                            onClick={() => setSyncHistoryExpanded(!syncHistoryExpanded)}
                            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                            <History className="w-3.5 h-3.5" />
                            Historial
                            {syncHistoryExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        <button
                            onClick={handleSyncNow}
                            disabled={isSyncing}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-all shadow-sm"
                        >
                            {isSyncing
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Sincronizando...</>
                                : <><RefreshCw className="w-4 h-4" /> Sincronizar ahora</>
                            }
                        </button>
                    </div>
                </div>

                {/* Resultado de sync */}
                {syncResult && (
                    <div className="mx-5 mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex flex-wrap items-center gap-4">
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                        <p className="text-sm font-semibold text-green-800 flex-1">{syncResult.message}</p>
                        <div className="flex gap-4 text-xs font-medium text-green-700">
                            <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> {syncResult.totalFound ?? 0} encontradas</span>
                            <span className="flex items-center gap-1"><CheckSquare className="w-3 h-3" /> {syncResult.createdCount ?? 0} nuevas</span>
                            <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" /> {syncResult.updatedCount ?? 0} actualizadas</span>
                            {syncResult.durationMs > 0 && <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {formatDuration(syncResult.durationMs)}</span>}
                        </div>
                        <button onClick={() => setSyncResult(null)} className="text-green-500 hover:text-green-700"><X className="w-4 h-4" /></button>
                    </div>
                )}
                {syncError && (
                    <div className="mx-5 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
                        <AlertCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
                        <p className="text-sm font-medium text-red-700 flex-1">{syncError}</p>
                        <button onClick={() => setSyncError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                    </div>
                )}

                {/* Historial de logs */}
                {syncHistoryExpanded && (
                    <div className="p-5 border-t border-gray-100 bg-gray-50/50">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Últimas 10 sincronizaciones</h4>
                        {isLoadingLogs ? (
                            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
                        ) : syncLogs.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-4">No hay registros de sincronización aún.</p>
                        ) : (
                            <div className="space-y-2">
                                {syncLogs.map((log) => {
                                    const cfg = syncStatusConfig[log.status] || syncStatusConfig.FAILED;
                                    return (
                                        <div key={log.id} className={`flex flex-wrap items-center gap-3 p-3 rounded-lg border text-xs ${cfg.bg}`}>
                                            <span className={`flex items-center gap-1 font-semibold ${cfg.color}`}>{cfg.icon} {cfg.label}</span>
                                            <span className={`px-2 py-0.5 rounded-full font-medium ${log.type === 'MANUAL' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600'}`}>
                                                {log.type === 'MANUAL' ? '⚡ Manual' : '⏰ Programado'}
                                            </span>
                                            <span className="text-gray-600 flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatLogDate(log.createdAt)}</span>
                                            <span className="text-gray-600">
                                                {log.totalFound} encontradas · <span className="text-green-700">{log.createdCount} nuevas</span> · <span className="text-blue-600">{log.updatedCount} actualizadas</span>
                                                {log.skippedCount > 0 && <span className="text-yellow-700"> · {log.skippedCount} omitidas</span>}
                                            </span>
                                            {log.durationMs > 0 && <span className="text-gray-500 flex items-center gap-1 ml-auto"><Activity className="w-3 h-3" /> {formatDuration(log.durationMs)}</span>}
                                            {log.triggeredBy && <span className="text-gray-400">por: {log.triggeredBy}</span>}
                                            {log.errorMessage && <span className="text-red-600 w-full mt-1 pl-1 border-l-2 border-red-300">{log.errorMessage}</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Panel de Filtros */}
            <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                <form onSubmit={handleSearch} className="flex gap-4 items-end flex-wrap md:flex-nowrap">
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Fecha Inicio</label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full text-sm rounded border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-gray-900 bg-white font-medium" />
                    </div>
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Fecha Fin</label>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full text-sm rounded border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-gray-900 bg-white font-medium" />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Proveedor (RFC / Nombre)</label>
                        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full text-sm rounded border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-gray-900 bg-white font-medium">
                            <option value="">-- Todos los Proveedores --</option>
                            {suppliers.map(sup => (
                                <option key={sup.id} value={sup.id}>{sup.name} ({sup.rfc})</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[180px]">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Tipo de Transacción</label>
                        <select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full text-sm rounded border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-gray-900 bg-white font-medium">
                            <option value="ALL">Ambos (Facturas y Complementos)</option>
                            <option value="INVOICE">Solo Facturas</option>
                            <option value="PAYMENT">Solo Complementos de Pago</option>
                            <option value="PURCHASE_ORDER">Órdenes de Compra</option>
                        </select>
                    </div>
                    <div className="flex space-x-2">
                        <button type="submit" disabled={isLoading || isDownloading} className="bg-indigo-600 text-white p-2 px-4 rounded hover:bg-indigo-700 shadow flex items-center justify-center font-medium transition-colors disabled:opacity-50">
                            <Search className="w-4 h-4 mr-2" /> Buscar
                        </button>
                    </div>
                </form>
            </div>

            {/* Panel de Acciones Adicionales - Solo descarga ZIP */}
            {documents.length > 0 && (
                <div className="flex justify-end">
                    <button
                        onClick={handleDownloadZip}
                        disabled={isDownloading || isLoading}
                        className="bg-green-600 hover:bg-green-700 text-white p-2 px-4 rounded shadow flex items-center justify-center font-medium transition-colors disabled:opacity-50"
                    >
                        {isDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        {isDownloading ? 'Generando ZIP...' : 'Descargar Resultados (ZIP)'}
                    </button>
                </div>
            )}

            {/* Error handling */}
            {error && <div className="text-red-500 flex items-center bg-red-50 p-3 rounded-md border border-red-200"><AlertCircle className="w-5 h-5 mr-2" /> {error}</div>}

            {/* Resultados / Tabla */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden relative min-h-[300px]">
                {isLoading && (
                    <div className="absolute inset-0 bg-white/70 z-10 flex items-center justify-center backdrop-blur-sm">
                        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                    {isPurchaseOrderView ? 'Tipo' : 'Documento'}
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    {isPurchaseOrderView ? 'No. OC / Folio' : 'Folio / UUID'}
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    {isPurchaseOrderView ? 'Proveedor' : 'Proveedor emisor'}
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Subsidiaria R.</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                                {!isPurchaseOrderView && (
                                    <>
                                        <th scope="col" className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Estatus Sync</th>
                                        <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Archivos</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {!isLoading && documents.length === 0 ? (
                                <tr>
                                    <td colSpan={isPurchaseOrderView ? 6 : 8} className="px-6 py-12 text-center text-gray-500">
                                        <Filter className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                        <p className="text-sm">No se encontraron {isPurchaseOrderView ? 'órdenes de compra' : 'documentos'} bajo esos filtros de búsqueda.</p>
                                        <button onClick={handleClearFilters} className="mt-4 text-sm text-indigo-600 hover:underline">Limpiar filtros</button>
                                    </td>
                                </tr>
                            ) : (
                                paginatedDocuments.map(doc => (
                                    <tr key={doc.id} className="hover:bg-indigo-50/30 transition-colors">
                                        <td className="px-6 py-3 whitespace-nowrap">
                                            <span className={`inline-flex px-2 py-1 text-xs rounded-md border font-medium ${
                                                isPurchaseOrderView
                                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                    : doc.tipo === 'Factura'
                                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                        : 'bg-orange-50 text-orange-700 border-orange-200'
                                            }`}>
                                                {isPurchaseOrderView ? 'OC' : doc.tipo}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-sm text-gray-900 font-mono text-xs">{doc.folio}</td>
                                        <td className="px-6 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDate(doc.fecha)}</td>
                                        <td className="px-6 py-3">
                                            <div className="text-sm font-medium text-gray-900 whitespace-nowrap truncate max-w-[200px]" title={doc.proveedor}>{doc.proveedor}</div>
                                            <div className="text-xs text-gray-500">{doc.rfc}</div>
                                        </td>
                                        <td className="px-6 py-3 text-sm text-gray-500 truncate max-w-[150px]">{doc.subsidiaria}</td>
                                        <td className="px-6 py-3 text-sm font-medium text-gray-900 text-right whitespace-nowrap">{formatCurrency(doc.total)}</td>
                                        {!isPurchaseOrderView && (
                                            <>
                                                <td className="px-6 py-3 text-center whitespace-nowrap">
                                                    {doc.estadoCentral === 'SYNCED' ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">Sincronizado</span>
                                                    ) : doc.estadoCentral === 'PENDING_SYNC' ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">Pendiente ERP</span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200">Falló ERP</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-3 whitespace-nowrap text-right text-sm">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {/* Retry para complementos con sync fallido */}
                                                        {doc.tipo === 'Complemento de Pago' && doc.estadoCentral === 'FAILED' && (
                                                            <button
                                                                onClick={() => handleRetryComplement(doc.id)}
                                                                disabled={retryLoadingId === doc.id}
                                                                className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 text-xs font-semibold rounded disabled:opacity-50 transition-colors"
                                                                title="Reintentar sincronización con NetSuite"
                                                            >
                                                                {retryLoadingId === doc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                                                Reintentar
                                                            </button>
                                                        )}
                                                        {doc.pdfUrl && (
                                                            <a href={doc.pdfUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-500 hover:bg-gray-100 rounded hover:text-red-500 transition-colors" title="Ver PDF">
                                                                <FileText className="w-5 h-5" />
                                                            </a>
                                                        )}
                                                        {doc.xmlUrl && (
                                                            <a href={doc.xmlUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-500 hover:bg-gray-100 rounded hover:text-green-600 transition-colors" title="Descargar XML">
                                                                <Download className="w-5 h-5" />
                                                            </a>
                                                        )}
                                                    </div>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* --- Controles de Paginación --- */}
                {documents.length > 0 && (
                    <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-t border-gray-200 text-sm text-gray-600 bg-white">
                        <div className="flex items-center space-x-2 mb-4 sm:mb-0">
                            <span>Mostrar</span>
                            <select
                                value={pageSize}
                                onChange={(e) => setPageSize(Number(e.target.value))}
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

        </div>
    );
};

export default AdminInvoicesPage;
