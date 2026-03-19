"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, Plus, Power, Users, Building2, Server, Edit, ChevronDown, ChevronRight, AlertTriangle, Trash2, UserPlus } from 'lucide-react';

const REGIMENES_FISCALES = [
    { code: '601', name: 'General de Ley Personas Morales' },
    { code: '603', name: 'Personas Morales con Fines no Lucrativos' },
    { code: '605', name: 'Sueldos y Salarios e Ingresos Asimilados a Salarios' },
    { code: '606', name: 'Arrendamiento' },
    { code: '608', name: 'Demás ingresos' },
    { code: '609', name: 'Consolidación' },
    { code: '610', name: 'Residentes en el Extranjero sin Establecimiento Permanente en México' },
    { code: '611', name: 'Ingresos por Dividendos (socios) y accionistas' },
    { code: '612', name: 'Personas Físicas con Actividades Empresariales y Profesionales' },
    { code: '614', name: 'Ingresos por intereses' },
    { code: '615', name: 'Régimen de los ingresos por obtención de premios' },
    { code: '616', name: 'Sin obligaciones fiscales' },
    { code: '620', name: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos' },
    { code: '621', name: 'Incorporación Fiscal' },
    { code: '622', name: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras' },
    { code: '623', name: 'Opcional para Grupos de Sociedades' },
    { code: '624', name: 'Coordinados' },
    { code: '625', name: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas' },
    { code: '626', name: 'Régimen Simplificado de Confianza' }
];

// Componente individual para la fila con Desplegable
const TenantRow = ({ tenant, onToggleStatus, onEdit, onEditSubsidiary, onDeleteSubsidiary, onAddAdmin }: any) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <React.Fragment>
            {/* Fila Principal de la Empresa */}
            <tr className={`hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-indigo-50/30' : ''}`}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 w-10">
                    <button onClick={() => setIsExpanded(!isExpanded)} className="p-1 rounded-full hover:bg-gray-200 transition">
                        {isExpanded ? <ChevronDown className="w-5 h-5 text-indigo-600" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                    </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
                            <Server className="w-5 h-5" />
                        </div>
                        <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{tenant.name}</div>
                            <div className="text-sm text-gray-500">NS ID: {tenant.netsuiteAccountId || 'N/A'}</div>
                        </div>
                    </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tenant.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {tenant.isActive ? 'Activo' : 'Suspendido'}
                    </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 flex items-center mb-1"><Users className="w-4 h-4 mr-2 text-gray-400" /> {tenant._count?.users || 0} Usuarios</div>
                    <div className="text-sm text-gray-500 flex items-center"><Building2 className="w-4 h-4 mr-2 text-gray-400" /> {tenant._count?.subsidiaries || 0} Subsidiarias</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2 flex items-center justify-end">
                    <button onClick={() => onEdit(tenant)} className="text-gray-400 hover:text-indigo-600 p-2" title="Editar Credenciales">
                        <Edit className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => onToggleStatus(tenant)}
                        className={`p-2 transition-colors rounded ${tenant.isActive ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
                        title={tenant.isActive ? 'Suspender Cuenta' : 'Activar Cuenta'}
                    >
                        <Power className="w-5 h-5" />
                    </button>
                </td>
            </tr>

            {/* Fila Desplegable con las Subsidiarias */}
            {isExpanded && (
                <tr className="bg-gray-50 border-b border-gray-200 shadow-inner">
                    <td colSpan={5} className="px-10 py-5">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Subsidiarias Asignadas</h4>
                            <div className="flex space-x-4">
                                <button onClick={() => onAddAdmin({ tenantId: tenant.id, tenantName: tenant.name })} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center">
                                    <UserPlus className="w-3 h-3 mr-1" />
                                    Crear Admin.
                                </button>
                                <button onClick={() => onEditSubsidiary({ tenantId: tenant.id })} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center">
                                    <Plus className="w-3 h-3 mr-1" />
                                    Añadir Subsidiaria
                                </button>
                            </div>
                        </div>
                        {tenant.subsidiaries && tenant.subsidiaries.length > 0 ? (
                            <div className="bg-white rounded border border-gray-200 overflow-hidden shadow-sm">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wider text-left">
                                        <tr>
                                            <th className="px-4 py-3 w-1/4">Nombre Comercial</th>
                                            <th className="px-4 py-3 w-1/3">Razón Social</th>
                                            <th className="px-4 py-3 w-1/4">RFC</th>
                                            <th className="px-4 py-3 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {tenant.subsidiaries.map((sub: any) => (
                                            <tr key={sub.id} className="hover:bg-indigo-50/40 transition-colors group">
                                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{sub.name}</td>
                                                <td className="px-4 py-3 text-sm text-gray-600">{sub.businessName || '—'}</td>
                                                <td className="px-4 py-3 text-sm text-gray-500 font-mono tracking-wide">{sub.rfc}</td>
                                                <td className="px-4 py-3 text-sm text-right space-x-2">
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex space-x-2">
                                                        <button onClick={() => onEditSubsidiary({ ...sub, tenantId: tenant.id })} className="text-gray-400 hover:text-indigo-600 p-1 bg-white rounded shadow-sm border border-gray-200" title="Editar">
                                                            <Edit className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={() => onDeleteSubsidiary(sub)} className="text-gray-400 hover:text-red-600 p-1 bg-white rounded shadow-sm border border-gray-200" title="Eliminar">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 italic">No hay subsidiarias registradas para este cliente aún.</p>
                        )}
                    </td>
                </tr>
            )}
        </React.Fragment>
    );
};

const SuperAdminTenantsPage = () => {
    const [tenants, setTenants] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [suspendingTenant, setSuspendingTenant] = useState<any>(null);
    const [editingTenant, setEditingTenant] = useState<any>(null);
    const [editingSubsidiary, setEditingSubsidiary] = useState<any>(null);
    const [deletingSubsidiary, setDeletingSubsidiary] = useState<any>(null);
    const [creatingAdminFor, setCreatingAdminFor] = useState<any>(null);

    // --- Paginación ---
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const fetchTenants = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/tenants', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Error al cargar empresas cliente');
            const data = await res.json();
            setTenants(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTenants();
    }, []);

    const handleSaveTenant = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const isNew = !editingTenant.id;
            const res = await fetch('/api/tenants', {
                method: isNew ? 'POST' : 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(editingTenant)
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => null);
                throw new Error(errorData?.message || `Error al ${isNew ? 'crear' : 'editar'} la empresa`);
            }

            setEditingTenant(null);
            fetchTenants(); // Recargar la lista
        } catch (err: any) {
            setErrorMessage(err.message);
        }
    };

    const confirmToggleStatus = async () => {
        if (!suspendingTenant) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/tenants', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ id: suspendingTenant.id, isActive: !suspendingTenant.isActive })
            });

            if (!res.ok) throw new Error('Error al actualizar');
            setSuspendingTenant(null);
            fetchTenants();
        } catch (err: any) {
            setErrorMessage(err.message);
        }
    };

    const handleSaveSubsidiary = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const isNew = !editingSubsidiary.id;

            const formData = new FormData();
            if (editingSubsidiary.id) formData.append('id', editingSubsidiary.id);
            formData.append('name', editingSubsidiary.name || '');
            formData.append('rfc', editingSubsidiary.rfc || '');
            formData.append('businessName', editingSubsidiary.businessName || '');
            formData.append('taxRegime', editingSubsidiary.taxRegime || '');
            formData.append('taxAddress', editingSubsidiary.taxAddress || '');
            formData.append('tenantId', editingSubsidiary.tenantId);

            const res = await fetch('/api/subsidiaries', {
                method: isNew ? 'POST' : 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => null);
                throw new Error(errorData?.message || `Error al ${isNew ? 'crear' : 'editar'} la subsidiaria`);
            }

            setEditingSubsidiary(null);
            fetchTenants(); // Recarga la info de la empresa global para ver el cambio
        } catch (err: any) {
            setErrorMessage(err.message);
        }
    };

    const confirmDeleteSubsidiary = async () => {
        if (!deletingSubsidiary) return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/subsidiaries', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ id: deletingSubsidiary.id })
            });

            if (!res.ok) throw new Error('Error al eliminar la subsidiaria');
            setDeletingSubsidiary(null);
            fetchTenants();
        } catch (err: any) {
            setErrorMessage(err.message);
        }
    };

    const handleSaveAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/tenants/admins', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    tenantId: creatingAdminFor.tenantId,
                    name: creatingAdminFor.name || '',
                    email: creatingAdminFor.email || '',
                    password: creatingAdminFor.password || ''
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => null);
                throw new Error(errorData?.message || 'Error al crear administrador');
            }

            setErrorMessage("Administrador creado con éxito."); // Abusa del errorMessage modal para el success :P
            setCreatingAdminFor(null);
            fetchTenants();
        } catch (err: any) {
            setErrorMessage(err.message);
        }
    };

    if (isLoading) return <div className="flex justify-center items-center h-full"><Loader2 className="w-12 h-12 text-indigo-600 animate-spin" /></div>;
    if (error) return <div className="text-red-500 bg-red-50 p-4 rounded">{error}</div>;

    // --- Paginación Variables ---
    const totalItems = tenants.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const paginatedTenants = tenants.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Panel Súper Administrador</h2>
                    <p className="text-sm text-gray-500 mt-1">Gestiona los clientes (Empresas/Tenants) conectados a la plataforma.</p>
                </div>
                <button
                    onClick={() => setEditingTenant({
                        name: '', netsuiteAccountId: '', netsuiteConsumerKey: '',
                        netsuiteConsumerSecret: '', netsuiteTokenId: '', netsuiteTokenSecret: ''
                    })}
                    className="flex justify-center items-center py-2 px-4 shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Nueva Empresa
                </button>
            </div>

            {/* Lista de Empresas (Tenants) en Tabla Desplegable */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10"></th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empresa / Tenant</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estatus</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estadísticas</th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedTenants.map((tenant) => (
                            <TenantRow
                                key={tenant.id}
                                tenant={tenant}
                                onToggleStatus={setSuspendingTenant}
                                onEdit={setEditingTenant}
                                onEditSubsidiary={setEditingSubsidiary}
                                onDeleteSubsidiary={setDeletingSubsidiary}
                                onAddAdmin={setCreatingAdminFor}
                            />
                        ))}

                        {tenants.length === 0 && !editingTenant && (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                    <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                                    No hay clientes dados de alta. Comienza agregando una nueva empresa al sistema.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* --- Controles de Paginación --- */}
                {tenants.length > 0 && (
                    <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-t border-gray-200 text-sm text-gray-600 bg-white">
                        <div className="flex items-center space-x-2 mb-4 sm:mb-0">
                            <span>Mostrar</span>
                            <select
                                value={pageSize}
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
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

            {/* Modal para Editar/Guardar Tenant */}
            {editingTenant && (
                <div className="fixed inset-0 overflow-y-auto h-full w-full flex items-center justify-center z-50 pointer-events-none">
                    <div className="bg-white p-6 rounded-xl shadow-2xl border border-gray-200 w-full max-w-2xl text-left pointer-events-auto relative">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                            {editingTenant.id ? <Edit className="w-5 h-5 mr-2 text-indigo-500" /> : <Building2 className="w-5 h-5 mr-2 text-indigo-500" />}
                            {editingTenant.id ? 'Editar Integración de NetSuite' : 'Alta de Nueva Empresa'}
                        </h3>
                        <form onSubmit={handleSaveTenant} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="col-span-1 md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Nombre del Tenant (Empresa)</label>
                                    <input required type="text" value={editingTenant.name} onChange={(e) => setEditingTenant({ ...editingTenant, name: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white font-medium" placeholder="Ej: Aceros Nacionales S.A." />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">NetSuite Account ID</label>
                                    <input type="text" value={editingTenant.netsuiteAccountId || ''} onChange={(e) => setEditingTenant({ ...editingTenant, netsuiteAccountId: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white font-medium" placeholder="Ej: 1234567_SB1" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Consumer Key</label>
                                    <input type="password" value={editingTenant.netsuiteConsumerKey || ''} onChange={(e) => setEditingTenant({ ...editingTenant, netsuiteConsumerKey: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white font-medium" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Consumer Secret</label>
                                    <input type="password" value={editingTenant.netsuiteConsumerSecret || ''} onChange={(e) => setEditingTenant({ ...editingTenant, netsuiteConsumerSecret: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white font-medium" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Token ID</label>
                                    <input type="password" value={editingTenant.netsuiteTokenId || ''} onChange={(e) => setEditingTenant({ ...editingTenant, netsuiteTokenId: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white font-medium" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Token Secret</label>
                                    <input type="password" value={editingTenant.netsuiteTokenSecret || ''} onChange={(e) => setEditingTenant({ ...editingTenant, netsuiteTokenSecret: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white font-medium" />
                                </div>
                            </div>
                            <div className="flex justify-end space-x-3 pt-4 border-t mt-4">
                                <button type="button" onClick={() => setEditingTenant(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded">Cancelar</button>
                                <button type="submit" className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow-sm">
                                    {editingTenant.id ? 'Actualizar Empresa' : 'Guardar Empresa'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal para Confirmar Suspender / Activar */}
            {suspendingTenant && (
                <div className="fixed inset-0 overflow-y-auto h-full w-full flex items-center justify-center z-50 pointer-events-none">
                    <div className="bg-white p-8 rounded-xl shadow-2xl border border-gray-200 w-96 text-center pointer-events-auto relative">
                        <AlertTriangle className={`w-12 h-12 mx-auto mb-4 ${suspendingTenant.isActive ? 'text-red-500' : 'text-green-500'}`} />
                        <h3 className="text-xl font-bold text-gray-800 mb-2">
                            {suspendingTenant.isActive ? 'Suspender Empresa' : 'Activar Empresa'}
                        </h3>
                        <p className="text-gray-600 text-sm mb-6">
                            ¿Estás seguro que deseas {suspendingTenant.isActive ? 'suspender el servicio para' : 'activar el servicio de'} <strong>{suspendingTenant.name}</strong>?
                        </p>
                        <div className="flex justify-center space-x-4">
                            <button onClick={() => setSuspendingTenant(null)} className="px-5 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 rounded font-medium">Cancelar</button>
                            <button onClick={confirmToggleStatus} className={`px-5 py-2 text-sm text-white rounded font-medium shadow-sm hover:opacity-90 ${suspendingTenant.isActive ? 'bg-red-600' : 'bg-green-600'}`}>
                                Confirmar Acción
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal para Mantenimiento de Subsidiaria */}
            {editingSubsidiary && (
                <div className="fixed inset-0 overflow-y-auto h-full w-full flex items-center justify-center z-50 pointer-events-none">
                    <div className="bg-white p-6 rounded-xl shadow-2xl border border-gray-200 w-full max-w-2xl text-left pointer-events-auto relative">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                            {editingSubsidiary.id ? <Edit className="w-5 h-5 mr-2 text-indigo-500" /> : <Building2 className="w-5 h-5 mr-2 text-indigo-500" />}
                            {editingSubsidiary.id ? 'Editar Subsidiaria' : 'Alta de Nueva Subsidiaria'}
                        </h3>
                        <form onSubmit={handleSaveSubsidiary} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="col-span-1 md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Nombre Comercial Corto</label>
                                    <input required type="text" value={editingSubsidiary.name || ''} onChange={(e) => setEditingSubsidiary({ ...editingSubsidiary, name: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white font-medium" placeholder="Ej: Aceros Norte" />
                                </div>
                                <div className="col-span-1 md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Razón Social</label>
                                    <input required type="text" value={editingSubsidiary.businessName || ''} onChange={(e) => setEditingSubsidiary({ ...editingSubsidiary, businessName: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white font-medium" placeholder="Ej: Aceros del Norte S.A. de C.V." />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">RFC</label>
                                    <input required type="text" value={editingSubsidiary.rfc || ''} onChange={(e) => setEditingSubsidiary({ ...editingSubsidiary, rfc: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white font-medium" placeholder="Ej: ACN123456789" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Régimen Fiscal</label>
                                    <select
                                        required
                                        value={editingSubsidiary.taxRegime || ''}
                                        onChange={(e) => setEditingSubsidiary({ ...editingSubsidiary, taxRegime: e.target.value })}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white font-medium"
                                    >
                                        <option value="" disabled>Selecciona un régimen...</option>
                                        {REGIMENES_FISCALES.map((regimen) => (
                                            <option key={regimen.code} value={regimen.code}>
                                                {regimen.code} - {regimen.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-span-1 md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Dirección Fiscal</label>
                                    <textarea required rows={2} value={editingSubsidiary.taxAddress || ''} onChange={(e) => setEditingSubsidiary({ ...editingSubsidiary, taxAddress: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white font-medium" placeholder="Ej: Calle 1, Col. Centro, C.P. 12345" />
                                </div>
                            </div>
                            <div className="flex justify-end space-x-3 pt-4 border-t mt-4">
                                <button type="button" onClick={() => setEditingSubsidiary(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded">Cancelar</button>
                                <button type="submit" className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow-sm">
                                    {editingSubsidiary.id ? 'Actualizar Subsidiaria' : 'Guardar Subsidiaria'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal para Confirmar Eliminar Subsidiaria */}
            {deletingSubsidiary && (
                <div className="fixed inset-0 overflow-y-auto h-full w-full flex items-center justify-center z-50 pointer-events-none">
                    <div className="bg-white p-8 rounded-xl shadow-2xl border border-gray-200 w-96 text-center pointer-events-auto relative">
                        <AlertTriangle className={`w-12 h-12 mx-auto mb-4 text-red-500`} />
                        <h3 className="text-xl font-bold text-gray-800 mb-2">
                            Eliminar Subsidiaria
                        </h3>
                        <p className="text-gray-600 text-sm mb-6">
                            ¿Estás seguro que deseas eliminar la subsidiaria <strong>{deletingSubsidiary.name}</strong>? Esta acción es irreversible.
                        </p>
                        <div className="flex justify-center space-x-4">
                            <button onClick={() => setDeletingSubsidiary(null)} className="px-5 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 rounded font-medium">Cancelar</button>
                            <button onClick={confirmDeleteSubsidiary} className={`px-5 py-2 text-sm text-white rounded font-medium shadow-sm hover:opacity-90 bg-red-600`}>
                                Eliminar Definitivamente
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal para Mantenimiento de Usuario / Admin */}
            {creatingAdminFor && (
                <div className="fixed inset-0 overflow-y-auto h-full w-full flex items-center justify-center z-50 pointer-events-none">
                    <div className="bg-white p-6 rounded-xl shadow-2xl border border-gray-200 w-full max-w-lg text-left pointer-events-auto relative">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                            <UserPlus className="w-5 h-5 mr-2 text-indigo-500" />
                            Añadir Administrador
                        </h3>
                        <p className="text-sm text-gray-500 mb-4">
                            Crea un usuario administrador para gestionar la empresa: <strong>{creatingAdminFor.tenantName}</strong>
                        </p>
                        <form onSubmit={handleSaveAdmin} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Nombre Completo</label>
                                <input required type="text" value={creatingAdminFor.name || ''} onChange={(e) => setCreatingAdminFor({ ...creatingAdminFor, name: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white" placeholder="Ej: Juan Pérez" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Correo Electrónico (Login)</label>
                                <input required type="email" value={creatingAdminFor.email || ''} onChange={(e) => setCreatingAdminFor({ ...creatingAdminFor, email: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white" placeholder="Ej: juan@cliente.com" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Contraseña Local</label>
                                <input required type="password" value={creatingAdminFor.password || ''} onChange={(e) => setCreatingAdminFor({ ...creatingAdminFor, password: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white" placeholder="***" />
                            </div>

                            <div className="flex justify-end space-x-3 pt-4 border-t mt-4">
                                <button type="button" onClick={() => setCreatingAdminFor(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded">Cancelar</button>
                                <button type="submit" className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow-sm">
                                    Crear Administrador
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal para Mostrar Errores de la API O del Sistema */}
            {errorMessage && (
                <div className="fixed inset-0 overflow-y-auto h-full w-full flex items-center justify-center z-[60] pointer-events-none">
                    <div className="bg-white p-6 rounded-xl shadow-2xl border border-gray-200 w-96 text-center pointer-events-auto relative">
                        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-500" />
                        <h3 className="text-xl font-bold text-gray-800 mb-2">
                            Aviso del Sistema
                        </h3>
                        <p className="text-gray-600 text-sm mb-6">
                            {errorMessage}
                        </p>
                        <div className="flex justify-center space-x-4">
                            <button onClick={() => setErrorMessage(null)} className="px-5 py-2 text-sm text-white rounded font-medium shadow-sm hover:opacity-90 bg-indigo-600">
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuperAdminTenantsPage;
