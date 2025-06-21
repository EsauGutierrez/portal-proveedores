// app/components/DashboardPage.tsx

"use client";

import React, { useState } from 'react';
import { FileText, Home, DollarSign, LogOut, User, Book } from 'lucide-react';
import DataTable from './DataTable';
import ProfilePage from './ProfilePage';
import DocumentationPage from './DocumentationPage';
import ChatWidget from './ChatWidget';

// --- Mock Data ---
// Se actualiza esta sección para incluir recepciones en las órdenes.

// Datos para órdenes de compra con recepciones anidadas
const generateDummyOrders = () => {
  return Array.from({ length: 10 }, (_, i) => ({
    folio: `OC-${String(1001 + i)}`,
    fecha: new Date(2023, 10, Math.floor(Math.random() * 30) + 1).toLocaleDateString('es-MX'),
    subsidiaria: `Sucursal ${['Norte', 'Sur', 'Centro'][i % 3]}`,
    subtotal: (Math.random() * 5000 + 1000).toFixed(2),
    total: (Math.random() * 1000 + 5000).toFixed(2),
    // Array de recepciones para cada orden
    recepciones: Array.from({ length: Math.floor(Math.random() * 4) + 1 }, (v, j) => ({
        id: `REC-${String(1001 + i)}-${j+1}`,
        fecha: new Date(2023, 11, Math.floor(Math.random() * 28) + 1).toLocaleDateString('es-MX'),
        cantidad: Math.floor(Math.random() * 50) + 5,
    }))
  }));
};

// Datos para facturas y pagos (sin cambios)
const generateDummyData = (title) => {
    return Array.from({ length: 10 }, (_, i) => ({
        folio: `${title.slice(0, 2).toUpperCase()}-${String(1001 + i)}`,
        fecha: new Date(2023, 10, Math.floor(Math.random() * 30) + 1).toLocaleDateString('es-MX'),
        subsidiaria: `Sucursal ${['Norte', 'Sur', 'Centro'][i % 3]}`,
        subtotal: (Math.random() * 5000 + 1000).toFixed(2),
        total: (Math.random() * 1000 + 5000).toFixed(2),
    }));
};

const ordenesData = generateDummyOrders();
const facturasData = generateDummyData("Facturas");
const pagosData = generateDummyData("Pagos");


// Dashboard Component
const DashboardPage = ({ onLogout }) => {
    const [activeView, setActiveView] = useState('ordenes');

    const renderContent = () => {
        switch (activeView) {
            case 'ordenes':
                // Se pasa el nuevo set de datos a la tabla
                return <DataTable title="Órdenes de Compra" data={ordenesData} />;
            case 'facturas':
                return <DataTable title="Facturas" data={facturasData} />;
            case 'pagos':
                return <DataTable title="Complementos de Pago" data={pagosData} />;
            case 'perfil':
                return <ProfilePage />;
            case 'documentacion':
                return <DocumentationPage />;
            default:
                return <DataTable title="Órdenes de Compra" data={ordenesData} />;
        }
    };

    const NavLink = ({ view, icon: Icon, label }) => (
        <button
            onClick={() => setActiveView(view)}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
                activeView === view
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800'
            }`}
        >
            <Icon className="w-5 h-5 mr-3" />
            {label}
        </button>
    );

    return (
        <div className="min-h-screen bg-gray-100 flex">
            <aside className="w-64 bg-white shadow-lg flex flex-col p-4">
                <div className="flex items-center mb-8">
                    <DollarSign className="w-8 h-8 text-blue-600" />
                    <h1 className="text-xl font-bold ml-2 text-gray-800">PortalFin</h1>
                </div>
                <nav className="flex-grow space-y-2">
                    <NavLink view="ordenes" icon={Home} label="Órdenes de Compra" />
                    <NavLink view="facturas" icon={FileText} label="Facturas" />
                    <NavLink view="pagos" icon={FileText} label="Complemento de Pagos" />
                    <NavLink view="perfil" icon={User} label="Perfil" />
                    <NavLink view="documentacion" icon={Book} label="Documentación" />
                </nav>
                <div className="mt-auto">
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center px-4 py-3 text-sm font-medium text-gray-600 hover:bg-red-100 hover:text-red-700 rounded-lg transition-colors duration-200"
                    >
                        <LogOut className="w-5 h-5 mr-3" />
                        Cerrar Sesión
                    </button>
                </div>
            </aside>
            <main className="flex-1 p-8 overflow-y-auto">
                {renderContent()}
            </main>
            <ChatWidget />
        </div>
    );
};

export default DashboardPage;
