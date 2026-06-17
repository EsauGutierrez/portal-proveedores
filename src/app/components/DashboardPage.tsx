// app/components/DashboardPage.tsx

"use client";

import React, { useState, useEffect } from 'react';
import { FileText, Home, LogOut, User, Book, Loader2, AlertCircle, Users, Building2, Menu, HelpCircle } from 'lucide-react';
import DataTable from './DataTable';
import ProfilePage from './ProfilePage';
import DocumentationPage from './DocumentationPage';
import SupplierApprovalPage from './SupplierApprovalPage';
import SubsidiariesPage from './SubsidiariesPage';
import SuperAdminTenantsPage from './SuperAdminTenantsPage';
import AdminInvoicesPage from './AdminInvoicesPage';
import OverviewPage from './OverviewPage';
import DocumentSettingsPage from './DocumentSettingsPage';
import InvoiceSettingsPage from './InvoiceSettingsPage';
import PaymentComplementsPage from './PaymentComplementsPage';
import BulkPaymentComplementsPage from './BulkPaymentComplementsPage';
import SupportRequestPage from './SupportRequestPage';
import SyncLogsPage from './SyncLogsPage';
import SupplierDocumentsPage from './SupplierDocumentsPage';
import OperatorsPage from './OperatorsPage';
import CargadorPage from './CargadorPage';
import BulkUploadPage from './BulkUploadPage';
import { LayoutDashboard, Settings, DatabaseZap } from 'lucide-react';

const DashboardPage = ({ user, onLogout }) => {
    // La vista inicial depende del rol del usuario.
    // CARGADOR inicia directamente en su vista de selección de proveedor.
    const [activeView, setActiveView] = useState(user?.role === 'CARGADOR' ? 'cargador_home' : 'resumen');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [data, setData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [subsidiaryLogo, setSubsidiaryLogo] = useState<string | null>(null);

    useEffect(() => {
        // Si la vista no requiere datos de una tabla, no hacemos la llamada a la API.
        if (['resumen', 'perfil', 'documentacion', 'proveedores', 'subsidiarias', 'empresas', 'facturas_admin', 'ajustes_documentos', 'ajustes_facturas', 'pagos', 'pagos_masivos', 'soporte', 'sync_logs', 'mis_documentos', 'cargadores', 'cargador_home', 'carga_masiva'].includes(activeView)) {
            setIsLoading(false);
            return;
        }

        const fetchData = async () => {
            setIsLoading(true);
            setError(null);

            // Proveedor PENDING: no cargar datos de transacciones, mostrar tablas vacías
            if (user?.role === 'SUPPLIER' && user?.supplierStatus !== 'ACTIVE') {
                setData([]);
                setIsLoading(false);
                return;
            }

            const token = localStorage.getItem('token');
            if (!token) {
                setError('No se encontró el token de autenticación. Por favor, inicia sesión de nuevo.');
                setIsLoading(false);
                return;
            }

            let endpoint = '';
            switch (activeView) {
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
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Error al obtener los datos');
                }
                const result = await response.json();
                // APIs return { data: [...], total, page, limit, totalPages }
                setData(Array.isArray(result) ? result : (result.data ?? []));
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [activeView]);

    // Cargar logo de la subsidiaria para proveedores
    useEffect(() => {
        if (user?.role !== 'SUPPLIER') return;
        const token = localStorage.getItem('token');
        if (!token) return;

        // El perfil incluye supplierProfile.subsidiary con logoUrl (S3 key)
        // Usamos /api/subsidiaries que ya devuelve presigned URLs
        fetch('/api/profile', { headers: { 'Authorization': `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(async profile => {
                const subsidiaryId = profile?.supplierProfile?.subsidiaryId;
                if (!subsidiaryId) return;

                const subsRes = await fetch('/api/subsidiaries', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!subsRes.ok) return;
                const subs: any[] = await subsRes.json();
                const sub = subs.find(s => s.id === subsidiaryId);
                if (sub?.logoUrl) setSubsidiaryLogo(sub.logoUrl);
            })
            .catch(() => {});
    }, [user]);

    const renderContent = () => {
        if (isLoading) {
            return <div className="flex justify-center items-center h-96"><Loader2 className="w-16 h-16 text-blue-600 animate-spin" /></div>;
        }
        if (error) {
            return <div className="text-red-600 text-center p-4 bg-red-50 rounded-md">{error}</div>;
        }

        switch (activeView) {
            case 'resumen': return <OverviewPage user={user} onNavigate={setActiveView} />;
            case 'ordenes': return <DataTable title="Órdenes de Compra" data={data} />;
            case 'facturas': return <DataTable title="Facturas" data={data} />;
            case 'pagos': return <PaymentComplementsPage user={user} />;
            case 'pagos_masivos': return <BulkPaymentComplementsPage user={user} />;
            case 'mis_documentos': return <SupplierDocumentsPage user={user} />;
            case 'perfil': return <ProfilePage />;
            case 'documentacion': return <DocumentationPage />;
            case 'proveedores': return <SupplierApprovalPage />;
            case 'subsidiarias': return <SubsidiariesPage />;
            case 'empresas': return <SuperAdminTenantsPage />;
            case 'facturas_admin': return <AdminInvoicesPage />;
            case 'ajustes_documentos': return <DocumentSettingsPage />;
            case 'ajustes_facturas': return <InvoiceSettingsPage />;
            case 'soporte': return <SupportRequestPage />;
            case 'sync_logs': return <SyncLogsPage />;
            case 'cargadores': return <OperatorsPage />;
            case 'cargador_home': return <CargadorPage user={user} />;
            case 'carga_masiva': return <BulkUploadPage user={user} />;
            default: return <OverviewPage user={user} />;
        }
    };

    const NavLink = ({ view, icon: Icon, label }) => (
        <button
            onClick={() => setActiveView(view)}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${activeView === view ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800'}`}
        >
            <Icon className="w-5 h-5 mr-3" />
            {label}
        </button>
    );

    return (
        <div className="min-h-screen bg-gray-100 flex">
            {/* Sidebar */}
            <aside className={`${sidebarOpen ? 'w-64' : 'w-0'} flex-shrink-0 bg-white shadow-lg flex flex-col overflow-hidden transition-all duration-300`}>
                <div className="w-64 flex flex-col h-full p-4">
                    {/* Header: logo */}
                    <div className="flex items-center justify-center mb-8 min-h-[56px]">
                        {subsidiaryLogo ? (
                            <img
                                src={subsidiaryLogo}
                                alt="Logo subsidiaria"
                                className="max-h-14 max-w-[160px] object-contain"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                        ) : (
                            <h1 className="text-lg font-bold text-gray-800">Portal de proveedores</h1>
                        )}
                    </div>
                    <nav className="flex-grow space-y-2">
                        {user?.role !== 'CARGADOR' && <NavLink view="resumen" icon={LayoutDashboard} label="Resumen" />}

                        {user && user.role === 'CARGADOR' && (
                            <>
                                <NavLink view="cargador_home" icon={Users} label="Mis Proveedores" />
                                <NavLink view="carga_masiva" icon={FileText} label="Carga Masiva" />
                                <NavLink view="soporte" icon={HelpCircle} label="Solicitar Ayuda" />
                            </>
                        )}

                        {user && user.role === 'SUPPLIER' && (
                            <>
                                <NavLink view="ordenes" icon={Home} label="Órdenes de Compra" />
                                <NavLink view="facturas" icon={FileText} label="Facturas" />
                                {user.bulkUploadForSuppliers && (
                                    <NavLink view="carga_masiva" icon={FileText} label="Carga Masiva" />
                                )}
                                <NavLink view="pagos" icon={FileText} label="Complemento de Pagos" />
                                <NavLink view="pagos_masivos" icon={FileText} label="Carga Masiva de Pagos" />
                                <NavLink view="mis_documentos" icon={FileText} label="Mis Documentos" />
                                <NavLink view="soporte" icon={HelpCircle} label="Solicitar Ayuda" />
                            </>
                        )}

                        {user && (user.role === 'ADMIN' || user.role === 'TENANT_ADMIN') && (
                            <>
                                <NavLink view="facturas_admin" icon={FileText} label="Facturas y Documentos" />
                                <NavLink view="proveedores" icon={Users} label="Proveedores" />
                                <NavLink view="cargadores" icon={Users} label="Cargadores" />
                                <NavLink view="subsidiarias" icon={Building2} label="Gestionar Subsidiarias" />
                                <NavLink view="ajustes_documentos" icon={Settings} label="Config. de Documentos" />
                                <NavLink view="ajustes_facturas" icon={Settings} label="Config. de Facturas" />
                                <NavLink view="sync_logs" icon={DatabaseZap} label="Log de Sincronización" />
                            </>
                        )}

                        {user && user.role === 'SUPERADMIN' && (
                            <>
                                <NavLink view="empresas" icon={Building2} label="Gestión de Clientes (Tenants)" />
                            </>
                        )}

                        <NavLink view="perfil" icon={User} label="Perfil" />
                        <NavLink view="documentacion" icon={Book} label="Documentación" />
                    </nav>
                    <div className="mt-auto">
                        <button onClick={onLogout} className="w-full flex items-center px-4 py-3 text-sm font-medium text-gray-600 hover:bg-red-100 hover:text-red-700 rounded-lg transition-colors duration-200">
                            <LogOut className="w-5 h-5 mr-3" />Cerrar Sesión
                        </button>
                    </div>
                </div>
            </aside>

            <main className="flex-1 overflow-y-auto min-w-0">
                {/* Barra superior con botón hamburguesa */}
                <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
                    <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">
                        <Menu className="w-5 h-5" />
                    </button>
                    {!sidebarOpen && (
                        <span className="text-sm font-semibold text-gray-700">Portal de Proveedores</span>
                    )}
                </div>

                {/* Banner de cuenta pendiente para proveedores */}
                {user?.role === 'SUPPLIER' && user?.supplierStatus === 'PENDING' && (
                    <div className="bg-amber-50 border-b border-amber-200 px-8 py-3 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                        <p className="text-sm text-amber-800 font-medium">
                            Tu cuenta está <strong>pendiente de aprobación</strong>. Podrás visualizar órdenes de compra y subir facturas una vez que un administrador apruebe tu registro.
                        </p>
                    </div>
                )}

                {/* Banner de suscripción en periodo de gracia para TENANT_ADMIN */}
                {user?.role === 'TENANT_ADMIN' && user?.subscriptionWarning && (
                    <div className="bg-red-50 border-b border-red-200 px-8 py-3 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                        <p className="text-sm text-red-800 font-medium">
                            <strong>La vigencia de tu portal ha expirado.</strong> Tienes acceso durante 7 días adicionales. Contacta a <strong>IMR</strong> de inmediato para renovar y evitar la suspensión del servicio.
                        </p>
                    </div>
                )}
                <div className="p-8">{renderContent()}</div>
            </main>
        </div>
    );
};

export default DashboardPage;
