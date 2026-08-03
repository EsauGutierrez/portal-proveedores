import React, { useState, useEffect } from 'react';
import { Loader2, Search, Filter, FileText, Download, AlertCircle, FileDigit, RefreshCw } from 'lucide-react';

const AdminInvoicesPage = () => {
    // --- Estado principal ---
    const [documents, setDocuments] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDownloading, setIsDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // --- Estado de retry de complementos de pago ---
    const [retryLoadingId, setRetryLoadingId] = useState<string | null>(null);

    // Filtros
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [supplierId, setSupplierId] = useState('');
    const [docType, setDocType] = useState('ALL');

    // --- Paginación (server-side) ---
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);

    const totalPages = Math.ceil(total / pageSize) || 1;

    const fetchDocuments = async (overrides: {
        page?: number;
        limit?: number;
        startDate?: string;
        endDate?: string;
        supplierId?: string;
        docType?: string;
    } = {}) => {
        setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const params = new URLSearchParams();

            const effectiveStartDate = 'startDate' in overrides ? overrides.startDate! : startDate;
            const effectiveEndDate = 'endDate' in overrides ? overrides.endDate! : endDate;
            const effectiveSupplierId = 'supplierId' in overrides ? overrides.supplierId! : supplierId;
            const effectiveDocType = overrides.docType ?? docType;
            const effectivePage = overrides.page ?? currentPage;
            const effectiveLimit = overrides.limit ?? pageSize;

            if (effectiveStartDate) params.append('startDate', effectiveStartDate);
            if (effectiveEndDate) params.append('endDate', effectiveEndDate);
            if (effectiveSupplierId) params.append('supplierId', effectiveSupplierId);
            if (effectiveDocType) params.append('docType', effectiveDocType);
            params.append('page', effectivePage.toString());
            params.append('limit', effectiveLimit.toString());

            const res = await fetch(`/api/admin/documents?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Error al cargar la información.');
            const data = await res.json();

            setDocuments(data.documents || []);
            setTotal(data.total ?? 0);

            if (data.suppliers && suppliers.length === 0) {
                setSuppliers(data.suppliers);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Initial load
    useEffect(() => {
        fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setCurrentPage(1);
        fetchDocuments({ page: 1 });
    };

    const handleClearFilters = () => {
        setStartDate('');
        setEndDate('');
        setSupplierId('');
        setDocType('ALL');
        setCurrentPage(1);
        fetchDocuments({ page: 1, startDate: '', endDate: '', supplierId: '', docType: 'ALL' });
    };

    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        fetchDocuments({ page: newPage });
    };

    const handlePageSizeChange = (newSize: number) => {
        setPageSize(newSize);
        setCurrentPage(1);
        fetchDocuments({ page: 1, limit: newSize });
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

    const handleRetryInvoice = async (id: string) => {
        setRetryLoadingId(id);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/invoices/retry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ invoiceId: id }),
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
                headers: { 'Authorization': `Bearer ${token}` },
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
            currency: 'MXN',
        }).format(amount);
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '—';
        return new Date(dateString).toLocaleDateString('es-MX', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    };

    const isPurchaseOrderView = docType === 'PURCHASE_ORDER';

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
            {total > 0 && (
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
                                documents.map(doc => (
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
                                                        <div className="flex flex-col items-center gap-1">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">Sincronizado</span>
                                                            {doc.tipo === 'Factura' && doc.paidAt && (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">💰 Pagada</span>
                                                            )}
                                                        </div>
                                                    ) : doc.estadoCentral === 'PENDING_SYNC' ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">Pendiente ERP</span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200">Falló ERP</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-3 whitespace-nowrap text-right text-sm">
                                                    <div className="flex items-center justify-end gap-1">
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
                                                        {doc.tipo === 'Factura' && doc.estadoCentral === 'FAILED' && (
                                                            <button
                                                                onClick={() => handleRetryInvoice(doc.id)}
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

                {/* --- Controles de Paginación (server-side) --- */}
                {total > 0 && (
                    <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-t border-gray-200 text-sm text-gray-600 bg-white">
                        <div className="flex items-center space-x-2 mb-4 sm:mb-0">
                            <span>Mostrar</span>
                            <select
                                value={pageSize}
                                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
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
                                Mostrando del {total === 0 ? 0 : (currentPage - 1) * pageSize + 1} al {Math.min(currentPage * pageSize, total)} de {total} registros
                            </span>
                            <div className="flex items-center space-x-1">
                                <button
                                    onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
                                    disabled={currentPage === 1 || isLoading}
                                    className="px-3 py-1 border border-gray-300 rounded-md bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Anterior
                                </button>
                                <div className="px-3 py-1 font-semibold text-gray-800 border border-transparent">
                                    Página {currentPage} de {totalPages}
                                </div>
                                <button
                                    onClick={() => handlePageChange(Math.min(currentPage + 1, totalPages))}
                                    disabled={currentPage === totalPages || isLoading}
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
