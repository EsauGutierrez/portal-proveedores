// app/components/DataTable.tsx

"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, Search, X, UploadCloud, FileText, CheckCircle, AlertTriangle, Loader2, ArrowUp, ArrowDown } from 'lucide-react';

// --- Helper para formatear moneda ---
const formatCurrency = (number) => {
  const num = typeof number === 'string' ? parseFloat(number.replace(/,/g, '')) : number;
  if (isNaN(num)) return number;
  return new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
};

// --- Componente: Modal para Detalles de Recepción ---
const ReceptionDetailsModal = ({ isOpen, onClose, reception }) => {
  if (!isOpen || !reception) return null;
  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-4xl flex flex-col">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-2xl font-bold text-gray-800">Detalles de la Recepción</h3>
            <p className="text-gray-500 mt-1">
              Folio Recepción: <span className="font-semibold text-gray-700">{reception.folio}</span> | Fecha: <span className="font-semibold text-gray-700">{new Date(reception.fecha).toLocaleDateString('es-MX')}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X className="w-6 h-6" /></button>
        </div>
        <div className="overflow-y-auto max-h-[60vh]">
          <table className="w-full text-left table-auto">
            <thead className="bg-gray-100 border-b sticky top-0">
              <tr>
                <th className="px-4 py-3 text-sm font-semibold text-gray-600">Artículo</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-600 text-right">Cantidad</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-600 text-right">Precio Unitario</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-600 text-right">Impuestos</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-600 text-right">Subtotal</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-600 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {reception.articles?.map(article => (
                <tr key={article.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-700 font-medium">{article.articleName}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-right">{article.quantity}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-right">${formatCurrency(article.unitPrice)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-right">${formatCurrency(article.tax)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-right">${formatCurrency(article.subtotal)}</td>
                  <td className="px-4 py-3 text-sm text-gray-800 font-bold text-right">${formatCurrency(article.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-8 flex justify-end"><button onClick={onClose} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">Cerrar</button></div>
      </div>
    </div>
  );
};

// --- Componente: Modal para Subir Factura ---
const UploadInvoiceModal = ({ isOpen, onClose, reception, order, receptionIds = [], isConsignment = false }: { isOpen: boolean, onClose: () => void, reception?: any, order?: any, receptionIds?: string[], isConsignment?: boolean }) => {
  if (!isOpen) return null;
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const resetState = () => { setXmlFile(null); setPdfFile(null); setStatus('idle'); setErrorMessage(''); };
  const handleClose = () => { resetState(); onClose(); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setFile: React.Dispatch<React.SetStateAction<File | null>>) => { if (e.target.files && e.target.files[0]) { setFile(e.target.files[0]); } };

  // Determinar modo: recepciones múltiples, 1 recepción, o OC entera
  const isMultiReception = receptionIds.length > 1;
  const isSingleReception = receptionIds.length === 1 && !reception;

  const handleSubmit = async () => {
    if (!xmlFile || !pdfFile) {
      alert("Por favor, adjunta ambos archivos (XML y PDF).");
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    const formData = new FormData();
    if (isConsignment) {
      formData.append('purchaseOrderId', order.id);
    } else if (receptionIds.length > 0) {
      formData.append('receptionIds', JSON.stringify(receptionIds));
    } else if (order?.id) {
      formData.append('purchaseOrderId', order.id);
    }
    formData.append('userId', order.userId);
    formData.append('xmlFile', xmlFile);
    formData.append('pdfFile', pdfFile);

    try {
      const response = await fetch('/api/invoices', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        const detailedErrors = result.errors ? result.errors.join('\n- ') : '';
        const finalMessage = `${result.message}\n${detailedErrors ? '- ' + detailedErrors : ''}`;
        throw new Error(finalMessage);
      }

      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message);
    }
  };

  const renderContent = () => {
    switch (status) {
      case 'loading': return (<div className="text-center py-12"><Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto" /><p className="mt-4 text-lg font-semibold text-gray-700">Validando factura...</p></div>);
      case 'success': return (<div className="text-center py-12"><CheckCircle className="w-20 h-20 text-green-500 mx-auto" /><h4 className="mt-4 text-2xl font-bold text-gray-800">¡Factura Recibida!</h4><p className="text-gray-600 mt-2">Tu factura ha sido validada y está en proceso de sincronización.</p><div className="mt-8"><button onClick={handleClose} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700">Finalizar</button></div></div>);
      case 'error': return (<div className="text-center py-12"><AlertTriangle className="w-20 h-20 text-red-500 mx-auto" /><h4 className="mt-4 text-2xl font-bold text-gray-800">Error de Validación</h4><p className="text-gray-600 mt-2 text-left whitespace-pre-wrap bg-red-50 p-4 rounded-md">{errorMessage}</p><div className="mt-8"><button onClick={resetState} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700">Reintentar</button></div></div>);
      default: return (<><div className="flex justify-between items-center mb-6"><h3 className="text-2xl font-bold text-gray-800">Subir Factura</h3><button onClick={handleClose} className="text-gray-500 hover:text-gray-800"><X className="w-6 h-6" /></button></div><div className="grid grid-cols-2 gap-y-4 gap-x-4 mb-6 bg-gray-50 p-4 rounded-lg"><div><label className="block text-sm font-medium text-gray-500">Folio Orden de Compra</label><p className="text-lg font-semibold text-gray-800">{order?.folio}</p></div>
        {isConsignment ? (
          <div className="col-span-2 mt-2">
            <p className="text-sm text-center text-amber-800 bg-amber-100 p-3 rounded-md border border-amber-200 font-medium">
              Factura parcial de <span className="font-bold">consignación</span> para la OC <span className="font-bold">{order?.folio}</span>.
              Saldo disponible: <span className="font-bold">${formatCurrency(order?.saldoDisponible ?? 0)}</span>
            </p>
          </div>
        ) : isMultiReception ? (
          <div className="col-span-2 mt-2">
            <p className="text-sm text-center text-purple-800 bg-purple-100 p-3 rounded-md border border-purple-200 font-medium">
              Estás cargando 1 factura para <span className="font-bold">{receptionIds.length} recepciones</span> seleccionadas.
            </p>
          </div>
        ) : reception ? (<><div><label className="block text-sm font-medium text-gray-500">Folio Recepción</label><p className="text-lg font-semibold text-gray-800">{reception.folio}</p></div><div><label className="block text-sm font-medium text-gray-500">Subtotal Recepción</label><p className="text-lg font-semibold text-gray-800">${formatCurrency(reception.subtotal)}</p></div><div><label className="block text-sm font-medium text-gray-500">Total Recepción</label><p className="text-lg font-semibold text-gray-800">${formatCurrency(reception.total)}</p></div></>) : (
          <div className="col-span-2 mt-2">
            <p className="text-sm text-center text-blue-800 bg-blue-100 p-3 rounded-md border border-blue-200 font-medium">
              Estás cargando 1 sola factura integral para la Orden de Compra <span className="font-bold">{order?.folio}</span>.
            </p>
          </div>
        )}</div><div className="space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Archivo XML</label><label htmlFor="xml-upload-invoice" className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-gray-50"><div className="text-center">{xmlFile ? <CheckCircle className="mx-auto w-10 h-10 text-green-500" /> : <UploadCloud className="mx-auto w-10 h-10 text-gray-400" />}<p className="mt-2 text-sm text-gray-600">{xmlFile ? <span className="font-semibold">{xmlFile.name}</span> : 'Adjuntar XML'}</p></div></label><input id="xml-upload-invoice" type="file" className="hidden" accept=".xml,text/xml" onChange={(e) => handleFileChange(e, setXmlFile)} /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Archivo PDF</label><label htmlFor="pdf-upload-invoice" className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-gray-50"><div className="text-center">{pdfFile ? <CheckCircle className="mx-auto w-10 h-10 text-green-500" /> : <UploadCloud className="mx-auto w-10 h-10 text-gray-400" />}<p className="mt-2 text-sm text-gray-600">{pdfFile ? <span className="font-semibold">{pdfFile.name}</span> : 'Adjuntar PDF'}</p></div></label><input id="pdf-upload-invoice" type="file" className="hidden" accept="application/pdf" onChange={(e) => handleFileChange(e, setPdfFile)} /></div></div><div className="mt-8 flex justify-end space-x-4"><button onClick={handleClose} className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-100">Cancelar</button><button onClick={handleSubmit} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-300" disabled={!xmlFile || !pdfFile}>Subir Factura</button></div></>);
    }
  };
  return <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex justify-center items-center z-50"><div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-lg">{renderContent()}</div></div>;
};

// --- Se añade la definición del componente que faltaba ---
const UploadPaymentProofModal = ({ isOpen, onClose, payment }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-lg">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-gray-800">Subir Comprobante de Pago</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X className="w-6 h-6" /></button>
        </div>
        <p>Formulario para subir comprobante de pago para la factura: {payment?.facturaRelacionada}</p>
      </div>
    </div>
  );
};


// --- Componente DataTable Principal ---
export const DataTable = ({ title, data }) => {
  const [expandedRows, setExpandedRows] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Receptions checkbox state
  const [selectedReceptionsId, setSelectedReceptionsId] = useState<Record<string, string[]>>({});

  const [selectedItem, setSelectedItem] = useState(null);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [isConsignmentUpload, setIsConsignmentUpload] = useState(false);

  const filteredData = useMemo(() => {
    return data.filter(item =>
      Object.values(item).some(val =>
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [searchTerm, data]);

  const sortedData = useMemo(() => {
    let sortableItems = [...filteredData];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        const parseCurrency = (value) => { if (typeof value === 'string') { return parseFloat(value.replace(/,/g, '')); } return value; };
        if (sortConfig.key === 'subtotal' || sortConfig.key === 'total') { aValue = parseCurrency(aValue); bValue = parseCurrency(bValue); }
        if (aValue < bValue) { return sortConfig.direction === 'ascending' ? -1 : 1; }
        if (aValue > bValue) { return sortConfig.direction === 'ascending' ? 1 : -1; }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredData, sortConfig]);

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') { direction = 'descending'; }
    setSortConfig({ key, direction });
  };

  const handleRowClick = (folio) => { setExpandedRows(prev => prev.includes(folio) ? prev.filter(f => f !== folio) : [...prev, folio]); };
  const handleOpenUploadModal = (recepcion, order) => {
    setSelectedItem(recepcion);
    setCurrentOrder(order);
    setIsUploadModalOpen(true);
  };
  const handleOpenUploadModalForOrder = (order) => {
    const selectedIds = selectedReceptionsId[order.folio] || [];
    setSelectedItem(null);
    setCurrentOrder({ ...order, selectedReceptionIds: selectedIds });
    setIsUploadModalOpen(true);
  };
  const handleOpenConsignmentUploadModal = (order) => {
    setSelectedItem(null);
    setCurrentOrder({ ...order, selectedReceptionIds: [] });
    setIsConsignmentUpload(true);
    setIsUploadModalOpen(true);
  };
  const handleCloseUploadModal = () => { setIsUploadModalOpen(false); setIsConsignmentUpload(false); };
  const handleOpenDetailsModal = (recepcion) => { setSelectedItem(recepcion); setIsDetailsModalOpen(true); };
  const handleCloseDetailsModal = () => setIsDetailsModalOpen(false);
  const handleOpenPaymentModal = (payment) => { setSelectedItem(payment); setIsPaymentModalOpen(true); };
  const handleClosePaymentModal = () => setIsPaymentModalOpen(false);

  const SortableHeader = ({ columnKey, children, className = '' }) => {
    const isSorted = sortConfig.key === columnKey;
    return (
      <th className={`px-4 py-3 text-sm font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 ${className}`} onClick={() => requestSort(columnKey)}>
        <div className={`flex items-center ${className.includes('text-right') ? 'justify-end' : 'justify-start'}`}>
          {children}
          <span className="ml-2">{isSorted ? (sortConfig.direction === 'ascending' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : null}</span>
        </div>
      </th>
    );
  };

  const isExpandable = title === 'Órdenes de Compra';
  const isInvoiceTable = title === 'Facturas';
  const isPaymentTable = title === 'Complementos de Pago';

  // Computed data para paginación
  const totalItems = sortedData.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedData = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <>
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold text-gray-800">{title}</h2><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" /><input type="text" placeholder="Buscar en la tabla..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full max-w-xs pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500 text-gray-900" /></div></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left table-auto">
            <thead className="bg-gray-50 border-b">
              <tr>
                {isExpandable && <th className="px-2 py-3 w-12"></th>}
                <SortableHeader columnKey="folio">Folio</SortableHeader>
                {isInvoiceTable && <><SortableHeader columnKey="ordenDeCompra">O. de Compra</SortableHeader><SortableHeader columnKey="recepcion">Recepción</SortableHeader></>}
                {isPaymentTable && <SortableHeader columnKey="facturaRelacionada">Factura Relacionada</SortableHeader>}
                <SortableHeader columnKey="fecha">Fecha</SortableHeader>
                <SortableHeader columnKey="subsidiaria">Subsidiaria</SortableHeader>
                <SortableHeader columnKey="subtotal" className="text-right">Monto Subtotal</SortableHeader>
                <SortableHeader columnKey="tax" className="text-right">Monto Impuestos</SortableHeader>
                <SortableHeader columnKey="total" className="text-right">Monto Total</SortableHeader>
                {isExpandable && <th className="px-4 py-3 w-32 text-center text-xs font-semibold text-gray-500">Facturación</th>}
                {isInvoiceTable && <><th className="px-4 py-3 w-36 text-center text-xs font-semibold text-gray-500">Estado</th><th className="px-4 py-3 w-28 text-center"></th><th className="px-4 py-3 w-28 text-center"></th></>}
                {isPaymentTable && <th className="px-4 py-3 w-28 text-center"></th>}
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((item) => {
                const isExpanded = expandedRows.includes(item.folio);
                const canExpand = isExpandable && item.recepciones && item.recepciones.length > 0;
                return (
                  <React.Fragment key={item.folio}>
                    <tr className={`border-b ${canExpand ? 'cursor-pointer hover:bg-gray-50' : ''}`} onClick={() => canExpand && handleRowClick(item.folio)}>
                      {isExpandable && (<td className="px-2 py-3 text-center">{canExpand && (isExpanded ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronRight className="w-5 h-5 text-gray-500" />)}</td>)}
                      <td className="px-4 py-3 text-sm text-gray-700 font-medium">
                        <div className="flex items-center gap-2">
                          {item.folio}
                          {item.isConsignment && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">
                              CONSIGNACIÓN
                            </span>
                          )}
                        </div>
                      </td>
                      {isInvoiceTable && <><td className="px-4 py-3 text-sm text-gray-500">{item.ordenDeCompra}</td><td className="px-4 py-3 text-sm text-gray-500">{item.recepcion}</td></>}
                      {isPaymentTable && <td className="px-4 py-3 text-sm text-gray-500">{item.facturaRelacionada}</td>}
                      {/* CORRECCIÓN: Se añade una validación para la fecha antes de formatearla */}
                      <td className="px-4 py-3 text-sm text-gray-500">{item.fecha ? new Date(item.fecha).toLocaleDateString('es-MX') : 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{item.subsidiaria}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 text-right">${formatCurrency(item.subtotal)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 text-right">${formatCurrency(item.tax || 0)}</td>
                      <td className="px-4 py-3 text-sm text-gray-800 font-bold text-right">${formatCurrency(item.total)}</td>
                      {isExpandable && (
                        <td className="px-4 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                          {item.isConsignment ? (
                            <div className="flex flex-col items-center gap-1 min-w-[140px]">
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div
                                  className="bg-amber-500 h-1.5 rounded-full transition-all"
                                  style={{ width: `${Math.min(100, ((item.totalFacturado || 0) / Number(item.total)) * 100)}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500">${formatCurrency(item.saldoDisponible ?? item.total)} disp.</span>
                              <button
                                onClick={() => handleOpenConsignmentUploadModal(item)}
                                className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-1 px-3 rounded-md transition-colors duration-200 shadow-sm whitespace-nowrap"
                              >
                                Subir factura parcial
                              </button>
                            </div>
                          ) : item.invoice?.syncStatus === 'SYNCED' ? (
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => window.open(item.invoice.pdfUrl, '_blank')} className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-1 px-2 rounded-md transition-colors duration-200">Ver PDF</button>
                              <button onClick={() => window.open(item.invoice.xmlUrl, '_blank')} className="bg-gray-600 hover:bg-gray-700 text-white text-xs font-bold py-1 px-2 rounded-md transition-colors duration-200">Ver XML</button>
                            </div>
                          ) : item.invoice?.syncStatus === 'PENDING_SYNC' ? (
                            <span className="text-yellow-700 italic text-xs font-semibold px-2 py-1 bg-yellow-100 rounded-md whitespace-nowrap">En validación...</span>
                          ) : item.invoice?.syncStatus === 'FAILED' ? (
                            <span className="text-red-700 italic text-xs font-semibold px-2 py-1 bg-red-100 rounded-md whitespace-nowrap">Factura con error</span>
                          ) : (
                            <button
                              onClick={() => handleOpenUploadModalForOrder(item)}
                              className="bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-1 px-3 rounded-md transition-colors duration-200 shadow-sm whitespace-nowrap"
                            >
                              {selectedReceptionsId[item.folio]?.length > 0 ? `Subir factura (${selectedReceptionsId[item.folio].length} rec.)` : 'Subir factura'}
                            </button>
                          )}
                        </td>
                      )}
                      {isInvoiceTable && <><td className="px-4 py-2 text-center">{item.syncStatus === 'SYNCED' ? (<span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>Validada</span>) : item.syncStatus === 'FAILED' ? (<span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>Con error</span>) : (<span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block animate-pulse"></span>En validación</span>)}</td><td className="px-4 py-2 text-center"><button onClick={(e) => { e.stopPropagation(); window.open(item.pdfUrl, '_blank'); }} className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-1 px-3 rounded-md transition-colors duration-200">Ver PDF</button></td><td className="px-4 py-2 text-center"><button onClick={(e) => { e.stopPropagation(); window.open(item.xmlUrl, '_blank'); }} className="bg-gray-600 hover:bg-gray-700 text-white text-xs font-bold py-1 px-3 rounded-md transition-colors duration-200">Ver XML</button></td></>}
                      {isPaymentTable && (<td className="px-4 py-2 text-center"><button onClick={(e) => { e.stopPropagation(); handleOpenPaymentModal(item); }} className="bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold py-1 px-3 rounded-md transition-colors duration-200">Subir Comprobante</button></td>)}
                    </tr>
                    {canExpand && isExpanded && (
                      <tr className="bg-gray-50">
                        <td colSpan={8} className="p-0">
                          <div className="p-4 pl-16">
                            <h4 className="text-md font-semibold text-gray-700 mb-2">Detalle de Recepciones</h4>
                            <table className="w-full text-sm">
                              <thead className="bg-gray-100 rounded-lg">
                                <tr>
                                  <th className="px-4 py-2 font-semibold text-center text-gray-600 w-10"></th>
                                  <th className="px-4 py-2 font-semibold text-left text-gray-600">Folio Recepción</th>
                                  <th className="px-4 py-2 font-semibold text-left text-gray-600">Fecha</th>
                                  <th className="px-4 py-2 font-semibold text-right text-gray-600">Cantidad</th>
                                  <th className="px-4 py-2 font-semibold text-right text-gray-600">Subtotal</th>
                                  <th className="px-4 py-2 font-semibold text-right text-gray-600">Impuestos</th>
                                  <th className="px-4 py-2 font-semibold text-right text-gray-600">Total</th>
                                  <th className="px-4 py-2 font-semibold text-center text-gray-600"></th>
                                  <th className="px-4 py-2 font-semibold text-center text-gray-600"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.recepciones.map(recepcion => {
                                  const cantidadTotal = recepcion.articles.reduce((sum, article) => sum + article.quantity, 0);
                                  const subtotal = recepcion.articles.reduce((sum, article) => sum + parseFloat(article.subtotal), 0);
                                  const tax = recepcion.articles.reduce((sum, article) => sum + parseFloat(article.tax), 0);
                                  const total = recepcion.articles.reduce((sum, article) => sum + parseFloat(article.total), 0);
                                  const recepcionConTotales = { ...recepcion, cantidadTotal, subtotal: formatCurrency(subtotal), tax: formatCurrency(tax), total: formatCurrency(total) };
                                  return (
                                    <tr key={recepcion.id} className="border-b border-gray-200 last:border-b-0">
                                      <td className="px-4 py-2 text-center">
                                        {!item.isConsignment && !recepcion.invoice && !item.invoice && (
                                          <input
                                            type="checkbox"
                                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                                            checked={(selectedReceptionsId[item.folio] || []).includes(recepcion.id)}
                                            onChange={(e) => {
                                              const checked = e.target.checked;
                                              setSelectedReceptionsId(prev => {
                                                const currentList = prev[item.folio] || [];
                                                if (checked) {
                                                  return { ...prev, [item.folio]: [...currentList, recepcion.id] };
                                                } else {
                                                  return { ...prev, [item.folio]: currentList.filter(id => id !== recepcion.id) };
                                                }
                                              });
                                            }}
                                          />
                                        )}
                                      </td>
                                      <td className="px-4 py-2 text-gray-600">{recepcion.folio}</td>
                                      <td className="px-4 py-2 text-gray-600">{new Date(recepcion.fecha).toLocaleDateString('es-MX')}</td>
                                      <td className="px-4 py-2 text-gray-600 text-right">{cantidadTotal} uds.</td>
                                      <td className="px-4 py-2 text-gray-600 text-right">${formatCurrency(subtotal)}</td>
                                      <td className="px-4 py-2 text-gray-600 text-right">${formatCurrency(tax)}</td>
                                      <td className="px-4 py-2 text-gray-800 font-semibold text-right">${formatCurrency(total)}</td>
                                      <td className="px-4 py-2 text-center">
                                        <button onClick={(e) => { e.stopPropagation(); handleOpenDetailsModal(recepcion); }} className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1 px-3 rounded-md transition-colors duration-200">Ver detalles</button>
                                      </td>
                                      <td className="px-4 py-2 text-center">
                                        {item.isConsignment ? null : item.invoice ? (
                                          <span className="text-gray-500 italic text-xs font-semibold px-2 py-1 bg-gray-200 rounded-md">Factura en OC</span>
                                        ) : !recepcion.invoice ? (
                                          <button onClick={(e) => { e.stopPropagation(); handleOpenUploadModal(recepcionConTotales, item); }} className="bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-1 px-3 rounded-md transition-colors duration-200">Subir factura</button>
                                        ) : (
                                          <span className="text-gray-500 italic text-xs font-semibold px-2 py-1 bg-gray-200 rounded-md">Factura Recibida</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* --- Controles de Paginación --- */}
        <div className="flex flex-col sm:flex-row justify-between items-center mt-6 text-sm text-gray-600">
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
      </div>
      <UploadInvoiceModal
        isOpen={isUploadModalOpen}
        onClose={handleCloseUploadModal}
        reception={selectedItem}
        order={currentOrder}
        receptionIds={currentOrder?.selectedReceptionIds || []}
        isConsignment={isConsignmentUpload}
      />
      <ReceptionDetailsModal isOpen={isDetailsModalOpen} onClose={handleCloseDetailsModal} reception={selectedItem} />
      <UploadPaymentProofModal isOpen={isPaymentModalOpen} onClose={handleClosePaymentModal} payment={selectedItem} />
    </>
  );
};

export default DataTable;
