// app/components/DataTable.tsx

"use client";

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export const DataTable = ({ title, data }) => {
  // Estado para mantener un registro de las filas expandidas
  const [expandedRows, setExpandedRows] = useState([]);

  // Función para manejar el clic en una fila
  const handleRowClick = (folio) => {
    setExpandedRows(prev => 
      // Si la fila ya está en la lista, la quitamos (colapsar). Si no, la agregamos (expandir).
      prev.includes(folio) ? prev.filter(f => f !== folio) : [...prev, folio]
    );
  };

  // Verificamos si la tabla debe ser expandible.
  // Esto solo será cierto para "Órdenes de Compra" porque sus datos tienen la propiedad `recepciones`.
  const isExpandable = data && data.length > 0 && data[0]?.recepciones !== undefined;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left table-auto">
          <thead className="bg-gray-50 border-b">
            <tr>
              {/* Agregamos una columna vacía para el ícono de expansión */}
              {isExpandable && <th className="px-2 py-3 w-12"></th>}
              <th className="px-4 py-3 text-sm font-semibold text-gray-600">Folio</th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-600">Fecha</th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-600">Subsidiaria</th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-600 text-right">Monto Subtotal</th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-600 text-right">Monto Total</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => {
              const isExpanded = expandedRows.includes(item.folio);
              const canExpand = isExpandable && item.recepciones && item.recepciones.length > 0;

              return (
                // Usamos React.Fragment para agrupar la fila principal y su fila de desglose
                <React.Fragment key={item.folio}>
                  {/* Fila Principal */}
                  <tr 
                    className={`border-b ${canExpand ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                    onClick={() => canExpand && handleRowClick(item.folio)}
                  >
                    {isExpandable && (
                      <td className="px-2 py-3 text-center">
                        {/* Mostramos el ícono solo si la fila puede expandirse */}
                        {canExpand && (
                          isExpanded ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronRight className="w-5 h-5 text-gray-500" />
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-gray-700 font-medium">{item.folio}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{item.fecha}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{item.subsidiaria}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-right">${item.subtotal}</td>
                    <td className="px-4 py-3 text-sm text-gray-800 font-bold text-right">${item.total}</td>
                  </tr>
                  
                  {/* Fila de Desglose (renderizado condicional) */}
                  {canExpand && isExpanded && (
                    <tr className="bg-gray-50">
                      <td colSpan={6} className="p-0">
                        <div className="p-4 pl-16">
                          <h4 className="text-md font-semibold text-gray-700 mb-2">Detalle de Recepciones</h4>
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100 rounded-lg">
                                <tr>
                                    <th className="px-4 py-2 font-semibold text-left text-gray-600">ID Recepción</th>
                                    <th className="px-4 py-2 font-semibold text-left text-gray-600">Fecha de Recepción</th>
                                    <th className="px-4 py-2 font-semibold text-right text-gray-600">Cantidad Recibida</th>
                                    {/* Columnas para los botones de acción */}
                                    <th className="px-4 py-2 font-semibold text-center text-gray-600"></th>
                                    <th className="px-4 py-2 font-semibold text-center text-gray-600"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {item.recepciones.map(recepcion => (
                                    <tr key={recepcion.id} className="border-b border-gray-200 last:border-b-0">
                                        <td className="px-4 py-2 text-gray-600">{recepcion.id}</td>
                                        <td className="px-4 py-2 text-gray-600">{recepcion.fecha}</td>
                                        <td className="px-4 py-2 text-gray-600 text-right">{recepcion.cantidad} unidades</td>
                                        {/* Celda para el botón "Ver detalles" */}
                                        <td className="px-4 py-2 text-center">
                                            <button 
                                                onClick={() => alert(`Viendo detalles de ${recepcion.id}`)}
                                                className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1 px-3 rounded-md transition-colors duration-200"
                                            >
                                                Ver detalles
                                            </button>
                                        </td>
                                        {/* Celda para el botón "Subir factura" */}
                                        <td className="px-4 py-2 text-center">
                                            <button 
                                                onClick={() => alert(`Subiendo factura para ${recepcion.id}`)}
                                                className="bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-1 px-3 rounded-md transition-colors duration-200"
                                            >
                                                Subir factura
                                            </button>
                                        </td>
                                    </tr>
                                ))}
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
    </div>
  );
};

export default DataTable;
