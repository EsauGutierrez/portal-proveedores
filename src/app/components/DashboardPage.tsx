// app/components/DashboardPage.tsx

"use client";

import React, { useState } from 'react';
import { FileText, Home, DollarSign, LogOut, User, Book } from 'lucide-react';
import DataTable from './DataTable';
import ProfilePage from './ProfilePage';
import DocumentationPage from './DocumentationPage';
import ChatWidget from './ChatWidget';

// --- Helper para formatear moneda ---
const formatCurrency = (number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
};

// --- Mock Data ---

const generateDummyOrders = () => {
  return Array.from({ length: 10 }, (_, i) => {
    const orderSubtotal = Math.random() * 5000 + 1000;
    const orderTotal = orderSubtotal * 1.16;

    const mockArticles = [
      { id: 'ART-001', nombre: 'Laptop Gamer XYZ', precioUnitario: 1500 },
      { id: 'ART-002', nombre: 'Monitor Curvo 27"', precioUnitario: 350 },
      { id: 'ART-003', nombre: 'Teclado Mecánico RGB', precioUnitario: 120 },
      { id: 'ART-004', nombre: 'Mouse Inalámbrico Pro', precioUnitario: 80 },
      { id: 'ART-005', nombre: 'Audífonos con Micrófono', precioUnitario: 95 },
    ];

    return {
      folio: `OC-${String(1001 + i)}`,
      fecha: new Date(2023, 10, Math.floor(Math.random() * 30) + 1).toLocaleDateString('es-MX'),
      subsidiaria: `Sucursal ${['Norte', 'Sur', 'Centro'][i % 3]}`,
      subtotal: formatCurrency(orderSubtotal),
      total: formatCurrency(orderTotal),
      recepciones: Array.from({ length: Math.floor(Math.random() * 2) + 1 }, (v, j) => {
        
        let receptionSubtotal = 0;
        let cantidadTotal = 0;
        
        const articlesInReception = Array.from({ length: Math.floor(Math.random() * 3) + 1 }, (a, k) => {
          const article = mockArticles[Math.floor(Math.random() * mockArticles.length)];
          const cantidad = Math.floor(Math.random() * 10) + 1;
          const subtotal = article.precioUnitario * cantidad;
          const impuestos = subtotal * 0.16;
          const total = subtotal + impuestos;
          
          receptionSubtotal += subtotal;
          cantidadTotal += cantidad;
          
          return { ...article, id: `${article.id}-${k}`, cantidad, impuestos, subtotal, total };
        });

        const receptionTotal = receptionSubtotal * 1.16;

        return {
          id: `REC-${String(1001 + i)}-${j+1}`,
          fecha: new Date(2023, 11, Math.floor(Math.random() * 28) + 1).toLocaleDateString('es-MX'),
          cantidadTotal: cantidadTotal,
          subtotal: formatCurrency(receptionSubtotal),
          total: formatCurrency(receptionTotal),
          articles: articlesInReception,
        };
      })
    };
  });
};

const generateDummyData = (title) => {
    const baseData = Array.from({ length: 10 }, (_, i) => {
        const subtotal = Math.random() * 5000 + 1000;
        const total = subtotal * 1.16;
        return {
            folio: `${title.slice(0, 2).toUpperCase()}-${String(1001 + i)}`,
            fecha: new Date(2023, 10, Math.floor(Math.random() * 30) + 1).toLocaleDateString('es-MX'),
            subsidiaria: `Sucursal ${['Norte', 'Sur', 'Centro'][i % 3]}`,
            subtotal: formatCurrency(subtotal),
            total: formatCurrency(total),
        };
    });

    if (title === 'Facturas') {
        return baseData.map(item => ({
            ...item,
            ordenDeCompra: `OC-${item.folio.split('-')[1]}`,
            recepcion: `REC-${item.folio.split('-')[1]}-1`,
            pdfUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            xmlUrl: 'https://www.w3.org/TR/2004/REC-xml-20040204/REC-xml-20040204.xml'
        }));
    }

    if (title === 'Complementos de Pago') {
        return baseData.map(item => ({
            ...item,
            facturaRelacionada: `FA-${item.folio.split('-')[1]}`,
        }));
    }

    return baseData;
};

const ordenesData = generateDummyOrders();
const facturasData = generateDummyData("Facturas");
const pagosData = generateDummyData("Complementos de Pago");

const DashboardPage = ({ onLogout }) => {
    const [activeView, setActiveView] = useState('ordenes');

    const renderContent = () => {
        switch (activeView) {
            case 'ordenes': return <DataTable title="Órdenes de Compra" data={ordenesData} />;
            case 'facturas': return <DataTable title="Facturas" data={facturasData} />;
            case 'pagos': return <DataTable title="Complementos de Pago" data={pagosData} />;
            case 'perfil': return <ProfilePage />;
            case 'documentacion': return <DocumentationPage />;
            default: return <DataTable title="Órdenes de Compra" data={ordenesData} />;
        }
    };

    const NavLink = ({ view, icon: Icon, label }) => ( <button onClick={() => setActiveView(view)} className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${ activeView === view ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800' }`}> <Icon className="w-5 h-5 mr-3" /> {label} </button> );

    return (
        <div className="min-h-screen bg-gray-100 flex">
            <aside className="w-64 bg-white shadow-lg flex flex-col p-4">
                <div className="flex items-center mb-8"> <DollarSign className="w-8 h-8 text-blue-600" /> <h1 className="text-xl font-bold ml-2 text-gray-800">Portal proveedores</h1> </div>
                <nav className="flex-grow space-y-2">
                    <NavLink view="ordenes" icon={Home} label="Órdenes de Compra" />
                    <NavLink view="facturas" icon={FileText} label="Facturas" />
                    <NavLink view="pagos" icon={FileText} label="Complemento de Pagos" />
                    <NavLink view="perfil" icon={User} label="Perfil" />
                    <NavLink view="documentacion" icon={Book} label="Documentación" />
                </nav>
                <div className="mt-auto"> <button onClick={onLogout} className="w-full flex items-center px-4 py-3 text-sm font-medium text-gray-600 hover:bg-red-100 hover:text-red-700 rounded-lg transition-colors duration-200"> <LogOut className="w-5 h-5 mr-3" /> Cerrar Sesión </button> </div>
            </aside>
            <main className="flex-1 p-8 overflow-y-auto">{renderContent()}</main>
            <ChatWidget />
        </div>
    );
};

export default DashboardPage;
