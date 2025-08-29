// app/components/DashboardPage.tsx

"use client";

import React, { useState, useEffect } from 'react';
import { FileText, Home, DollarSign, LogOut, User, Book, Loader2, AlertCircle, Users, Building2 } from 'lucide-react';
import DataTable from './DataTable';
import ProfilePage from './ProfilePage';
import DocumentationPage from './DocumentationPage';
import ChatWidget from './ChatWidget';
import SupplierApprovalPage from './SupplierApprovalPage';
import SubsidiariesPage from './SubsidiariesPage';

const DashboardPage = ({ user, onLogout }) => {
    // La vista inicial ahora depende del rol del usuario.
    const [activeView, setActiveView] = useState(user.role === 'ADMIN' ? 'proveedores' : 'ordenes');
    const [data, setData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Si la vista no requiere datos de una tabla, no hacemos la llamada a la API.
        if (['perfil', 'documentacion', 'proveedores', 'subsidiarias'].includes(activeView)) {
            setIsLoading(false);
            return;
        }

        const fetchData = async () => {
            setIsLoading(true);
            setError(null);
            
            const token = localStorage.getItem('token');
            if (!token) {
                setError('No se encontró el token de autenticación. Por favor, inicia sesión de nuevo.');
                setIsLoading(false);
                return;
            }

            let endpoint = '';
            switch(activeView) {
                case 'ordenes': 
                    endpoint = '/api/purchase-orders'; 
                    break;
                case 'facturas': 
                    endpoint = '/api/invoices'; 
                    break;
                case 'pagos': 
                    setData([]); 
                    setIsLoading(false); 
                    return;
                default: 
                    setIsLoading(false); 
                    return;
            }

            try {
                const response = await fetch(endpoint, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Error al obtener los datos');
                }
                const result = await response.json();
                setData(result);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [activeView]);

    const renderContent = () => {
        if (isLoading) {
            return <div className="flex justify-center items-center h-96"><Loader2 className="w-16 h-16 text-blue-600 animate-spin" /></div>;
        }
        if (error) {
            return <div className="text-red-600 text-center p-4 bg-red-50 rounded-md">{error}</div>;
        }

        switch (activeView) {
            case 'ordenes': return <DataTable title="Órdenes de Compra" data={data} />;
            case 'facturas': return <DataTable title="Facturas" data={data} />;
            case 'pagos': return <DataTable title="Complementos de Pago" data={[]} />;
            case 'perfil': return <ProfilePage />;
            case 'documentacion': return <DocumentationPage />;
            case 'proveedores': return <SupplierApprovalPage />;
            case 'subsidiarias': return <SubsidiariesPage />;
            default: return <DataTable title="Órdenes de Compra" data={data} />;
        }
    };

    const NavLink = ({ view, icon: Icon, label }) => (
        <button
            onClick={() => setActiveView(view)}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${ activeView === view ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800' }`}
        >
            <Icon className="w-5 h-5 mr-3" />
            {label}
        </button>
    );

    return (
        <div className="min-h-screen bg-gray-100 flex">
            <aside className="w-64 bg-white shadow-lg flex flex-col p-4">
                {/* CAMBIO: Se actualiza el título y se elimina el ícono */}
                <div className="flex items-center mb-8">
                    <h1 className="text-xl font-bold text-gray-800">Portal de proveedores</h1>
                </div>
                <nav className="flex-grow space-y-2">
                    
                    {user && user.role === 'SUPPLIER' && (
                        <>
                            <NavLink view="ordenes" icon={Home} label="Órdenes de Compra" />
                            <NavLink view="facturas" icon={FileText} label="Facturas" />
                            <NavLink view="pagos" icon={FileText} label="Complemento de Pagos" />
                        </>
                    )}
                    
                    {user && user.role === 'ADMIN' && (
                        <>
                            <NavLink view="proveedores" icon={Users} label="Proveedores" />
                            <NavLink view="subsidiarias" icon={Building2} label="Gestionar Subsidiarias" />
                        </>
                    )}

                    <NavLink view="perfil" icon={User} label="Perfil" />
                    <NavLink view="documentacion" icon={Book} label="Documentación" />
                </nav>
                <div className="mt-auto"><button onClick={onLogout} className="w-full flex items-center px-4 py-3 text-sm font-medium text-gray-600 hover:bg-red-100 hover:text-red-700 rounded-lg transition-colors duration-200"><LogOut className="w-5 h-5 mr-3" />Cerrar Sesión</button></div>
            </aside>
            <main className="flex-1 p-8 overflow-y-auto">{renderContent()}</main>
            <ChatWidget />
        </div>
    );
};

export default DashboardPage;
