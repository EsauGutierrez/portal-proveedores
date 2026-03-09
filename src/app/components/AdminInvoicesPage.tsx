import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Search, Filter, FileText, Download, Eye, AlertCircle, FileDigit } from 'lucide-react';

const AdminInvoicesPage = () => {
    const [documents, setDocuments] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDownloading, setIsDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                    <FileDigit className="w-8 h-8 mr-3 text-indigo-600" />
                    Búsqueda de Facturas y Complementos
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                    Consulta todo el historial de comprobantes enviados por los proveedores del Tenant.
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
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Tipo de Documento</label>
                        <select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full text-sm rounded border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-gray-900 bg-white font-medium">
                            <option value="ALL">Ambos</option>
                            <option value="INVOICE">Solo Facturas</option>
                            <option value="PAYMENT">Solo Complementos de Pago</option>
                        </select>
                    </div>
                    <div className="flex space-x-2">
                        <button type="submit" disabled={isLoading || isDownloading} className="bg-indigo-600 text-white p-2 px-4 rounded hover:bg-indigo-700 shadow flex items-center justify-center font-medium transition-colors disabled:opacity-50">
                            <Search className="w-4 h-4 mr-2" /> Buscar
                        </button>
                    </div>
                </form>
            </div>

            {/* Panel de Acciones Adicionales */}
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
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Documento</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Folio / UUID</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha de Emisión</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Proveedor emisor</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Subsidiaria R.</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                                <th scope="col" className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Estatus Sync</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Archivos</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {!isLoading && documents.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                                        <Filter className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                        <p className="text-sm">No se encontraron documentos bajo esos filtros de búsqueda.</p>
                                        <button onClick={handleClearFilters} className="mt-4 text-sm text-indigo-600 hover:underline">Limpiar filtros</button>
                                    </td>
                                </tr>
                            ) : (
                                documents.map(doc => (
                                    <tr key={doc.id} className="hover:bg-indigo-50/30 transition-colors">
                                        <td className="px-6 py-3 whitespace-nowrap">
                                            <span className={`inline-flex px-2 py-1 text-xs rounded-md border font-medium ${doc.tipo === 'Factura' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                                                {doc.tipo}
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
                                        <td className="px-6 py-3 text-center whitespace-nowrap">
                                            {doc.estadoCentral === 'SYNCED' ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">Sincronizado</span>
                                            ) : doc.estadoCentral === 'PENDING_SYNC' ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">Pendiente ERP</span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200">Falló ERP</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-3 whitespace-nowrap text-right text-sm space-x-2 flex justify-end">
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
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {documents.length > 0 && (
                    <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex justify-between items-center text-sm text-gray-500">
                        <span>Mostrando {documents.length} documentos encontrados.</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminInvoicesPage;
