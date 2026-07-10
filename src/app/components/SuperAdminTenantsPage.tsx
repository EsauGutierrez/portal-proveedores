"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, Plus, Power, Users, Building2, Server, Edit, ChevronDown, ChevronRight, AlertTriangle, Trash2, UserPlus, Calendar, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from '../lib/passwordPolicy';
import PasswordInput from './PasswordInput';
import PasswordRequirementChecklist from './PasswordRequirementChecklist';

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
const TenantRow = ({ tenant, onToggleStatus, onEdit, onEditSubsidiary, onDeleteSubsidiary, onAddAdmin, onDelete }: any) => {
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
                <td className="px-6 py-4">
                    {(() => {
                        const now = new Date();
                        const exp = tenant.subscriptionExpiresAt ? new Date(tenant.subscriptionExpiresAt) : null;
                        const gracePeriodEnd = exp ? new Date(exp.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
                        const isExpired = exp && now > exp;
                        const isInGrace = isExpired && gracePeriodEnd && now <= gracePeriodEnd;
                        const isPastGrace = isExpired && !isInGrace;

                        const activeSubs = tenant.subsidiaries?.filter((s: any) => s.isActive).length ?? 0;
                        const activeSuppliers = tenant.supplierProfiles?.length ?? 0;
                        const maxSubs = tenant.maxSubsidiaries;
                        const maxSup = tenant.maxSuppliers;

                        const subsColor = maxSubs && activeSubs >= maxSubs ? 'text-red-600 font-semibold' : 'text-gray-700';
                        const supColor = maxSup && activeSuppliers >= maxSup ? 'text-red-600 font-semibold' : 'text-gray-700';

                        return (
                            <div className="space-y-1 text-sm">
                                <div className="flex items-center gap-1.5">
                                    <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                    <span className={subsColor}>{activeSubs}{maxSubs ? `/${maxSubs}` : ''}</span>
                                    <span className="text-gray-400">subsidiarias</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Users className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                    <span className={supColor}>{activeSuppliers}{maxSup ? `/${maxSup}` : ''}</span>
                                    <span className="text-gray-400">proveedores</span>
                                </div>
                                {exp && (
                                    <div className="flex items-center gap-1.5">
                                        {isPastGrace ? <ShieldX className="w-3.5 h-3.5 text-red-500 flex-shrink-0" /> : isInGrace ? <ShieldAlert className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" /> : <ShieldCheck className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                                        <span className={isPastGrace ? 'text-red-600 font-semibold' : isInGrace ? 'text-amber-600 font-semibold' : 'text-gray-600'}>
                                            {isPastGrace ? 'Vencida' : isInGrace ? 'En gracia' : 'Vence'}: {exp.toLocaleDateString('es-MX')}
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
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
                    <button
                        onClick={() => onDelete(tenant)}
                        className="text-gray-400 hover:text-red-700 hover:bg-red-50 p-2 transition-colors rounded"
                        title="Eliminar Empresa"
                    >
                        <Trash2 className="w-5 h-5" />
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
    const [isSavingTenant, setIsSavingTenant] = useState(false);
    const [deletingTenant, setDeletingTenant] = useState<any>(null);
    const [deleteConfirmName, setDeleteConfirmName] = useState('');
    const [isDeletingTenant, setIsDeletingTenant] = useState(false);
    const [editingSubsidiary, setEditingSubsidiary] = useState<any>(null);
    const [deletingSubsidiary, setDeletingSubsidiary] = useState<any>(null);
    const [creatingAdminFor, setCreatingAdminFor] = useState<any>(null);
    const [showQueryWarning, setShowQueryWarning] = useState(false);
    const [pendingSubsidiarySave, setPendingSubsidiarySave] = useState(false);

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
        setIsSavingTenant(true);
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
            fetchTenants();
        } catch (err: any) {
            setErrorMessage(err.message);
        } finally {
            setIsSavingTenant(false);
        }
    };

    const confirmDeleteTenant = async () => {
        if (!deletingTenant) return;
        setIsDeletingTenant(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/tenants', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ id: deletingTenant.id }),
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => null);
                throw new Error(errorData?.message || 'Error al eliminar la empresa');
            }
            setDeletingTenant(null);
            setDeleteConfirmName('');
            fetchTenants();
        } catch (err: any) {
            setErrorMessage(err.message);
        } finally {
            setIsDeletingTenant(false);
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

    const DEFAULT_SUITEQL_QUERY = `SELECT
  t.id                 AS po_netsuite_id,
  t.tranid             AS folio,
  t.trandate           AS fecha,
  BUILTIN.DF(t.subsidiary) AS subsidiaria,
  BUILTIN.DF(t.entity) AS proveedor,
  t.foreigntotal       AS total,
  t.subtotal           AS subtotalns,
  t.taxtotal           AS taxtotal,
  t.entity             AS proveedorId,
  v.vatregnumber       AS rfc
FROM
  transaction t
  JOIN Vendor v ON t.entity = v.id
WHERE
  t.type = 'PurchOrd'
  AND v.vatregnumber IN ({rfcClause})`;

    const doSaveSubsidiary = async () => {
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
            formData.append('poSuiteqlQuery', editingSubsidiary.poSuiteqlQuery || '');

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
            setShowQueryWarning(false);
            setPendingSubsidiarySave(false);
            fetchTenants();
        } catch (err: any) {
            setErrorMessage(err.message);
        }
    };

    const handleSaveSubsidiary = async (e: React.FormEvent) => {
        e.preventDefault();
        // If it's an existing subsidiary and the query was changed from default (or changed at all), show warning
        const originalQuery = (editingSubsidiary._originalPoSuiteqlQuery ?? null);
        const newQuery = (editingSubsidiary.poSuiteqlQuery || '').trim();
        const queryChanged = newQuery !== (originalQuery || '').trim();

        if (queryChanged && newQuery !== '') {
            setShowQueryWarning(true);
            return;
        }
        await doSaveSubsidiary();
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
        if (!isValidPassword(creatingAdminFor.password || '')) {
            setErrorMessage(PASSWORD_POLICY_MESSAGE);
            return;
        }
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
                        netsuiteConsumerSecret: '', netsuiteTokenId: '', netsuiteTokenSecret: '',
                        netsuiteScriptId: '', netsuiteDeployId: '', supportEmail: '',
                        maxSubsidiaries: '', maxSuppliers: '', subscriptionExpiresAt: '',
                        subsidiariesToDeactivate: [],
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
                                onEditSubsidiary={(sub: any) => setEditingSubsidiary({ ...sub, _originalPoSuiteqlQuery: sub.poSuiteqlQuery ?? null })}
                                onDeleteSubsidiary={setDeletingSubsidiary}
                                onAddAdmin={setCreatingAdminFor}
                                onDelete={(t: any) => { setDeletingTenant(t); setDeleteConfirmName(''); }}
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
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Script ID (RESTlet)</label>
                                    <input type="text" value={editingTenant.netsuiteScriptId || ''} onChange={(e) => setEditingTenant({ ...editingTenant, netsuiteScriptId: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white font-medium" placeholder="Ej: 3878" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Deploy ID</label>
                                    <input type="text" value={editingTenant.netsuiteDeployId || ''} onChange={(e) => setEditingTenant({ ...editingTenant, netsuiteDeployId: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white font-medium" placeholder="Ej: 1" />
                                </div>
                                <div className="col-span-1 md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Correos de Contacto con Proveedores</label>
                                    <input type="text" value={editingTenant.supportEmail || ''} onChange={(e) => setEditingTenant({ ...editingTenant, supportEmail: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white font-medium" placeholder="Ej: soporte@empresa.com, compras@empresa.com" />
                                    <p className="mt-1 text-xs text-gray-500">Separa múltiples correos con coma. Aquí llegarán las solicitudes de ayuda de los proveedores.</p>
                                </div>

                                {/* ── Sección Suscripción ── */}
                                <div className="col-span-1 md:col-span-2 border-t pt-4">
                                    <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-3">
                                        <Calendar className="w-4 h-4 text-indigo-500" /> Suscripción
                                    </h4>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Vigencia del Portal</label>
                                    <input
                                        type="date"
                                        value={editingTenant.subscriptionExpiresAt
                                            ? (editingTenant.subscriptionExpiresAt instanceof Date
                                                ? editingTenant.subscriptionExpiresAt.toISOString().split('T')[0]
                                                : String(editingTenant.subscriptionExpiresAt).split('T')[0])
                                            : ''}
                                        onChange={(e) => setEditingTenant({ ...editingTenant, subscriptionExpiresAt: e.target.value })}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white font-medium"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4 col-span-1 md:col-span-1">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Máx. Subsidiarias</label>
                                        <input
                                            type="number" min="1"
                                            value={editingTenant.maxSubsidiaries || ''}
                                            onChange={(e) => setEditingTenant({ ...editingTenant, maxSubsidiaries: e.target.value, subsidiariesToDeactivate: [] })}
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white font-medium"
                                            placeholder="Sin límite"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Máx. Proveedores</label>
                                        <input
                                            type="number" min="1"
                                            value={editingTenant.maxSuppliers || ''}
                                            onChange={(e) => setEditingTenant({ ...editingTenant, maxSuppliers: e.target.value })}
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white font-medium"
                                            placeholder="Sin límite"
                                        />
                                    </div>
                                </div>

                                {/* ── Selector de subsidiarias a desactivar ── */}
                                {(() => {
                                    const activeSubsidiaries = (editingTenant.subsidiaries || []).filter((s: any) => s.isActive);
                                    const maxSubs = editingTenant.maxSubsidiaries ? parseInt(editingTenant.maxSubsidiaries) : null;
                                    const deactivateNeeded = maxSubs !== null ? Math.max(0, activeSubsidiaries.length - maxSubs) : 0;
                                    if (deactivateNeeded <= 0) return null;
                                    const selected: string[] = editingTenant.subsidiariesToDeactivate || [];
                                    return (
                                        <div className="col-span-1 md:col-span-2 bg-amber-50 border border-amber-200 rounded-lg p-4">
                                            <p className="text-sm font-semibold text-amber-800 mb-1">
                                                Límite reducido — debes seleccionar <strong>{deactivateNeeded}</strong> subsidiaria(s) para desactivar
                                            </p>
                                            <p className="text-xs text-amber-700 mb-3">Seleccionadas: {selected.length} / {deactivateNeeded} requeridas</p>
                                            <div className="space-y-2">
                                                {activeSubsidiaries.map((sub: any) => (
                                                    <label key={sub.id} className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={selected.includes(sub.id)}
                                                            onChange={(e) => {
                                                                const updated = e.target.checked
                                                                    ? [...selected, sub.id]
                                                                    : selected.filter((id: string) => id !== sub.id);
                                                                setEditingTenant({ ...editingTenant, subsidiariesToDeactivate: updated });
                                                            }}
                                                            className="rounded border-amber-400"
                                                        />
                                                        <span className="text-sm text-gray-800">{sub.name} <span className="text-gray-500">— {sub.businessName}</span></span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                            {(() => {
                                const activeSubsidiaries = (editingTenant.subsidiaries || []).filter((s: any) => s.isActive);
                                const maxSubs = editingTenant.maxSubsidiaries ? parseInt(editingTenant.maxSubsidiaries) : null;
                                const deactivateNeeded = maxSubs !== null ? Math.max(0, activeSubsidiaries.length - maxSubs) : 0;
                                const selected: string[] = editingTenant.subsidiariesToDeactivate || [];
                                const isBlocked = deactivateNeeded > 0 && selected.length < deactivateNeeded;
                                return (
                                    <div className="flex justify-end space-x-3 pt-4 border-t mt-4">
                                        <button type="button" onClick={() => setEditingTenant(null)} disabled={isSavingTenant} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded">Cancelar</button>
                                        <button type="submit" disabled={isBlocked || isSavingTenant} className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded shadow-sm">
                                            {isSavingTenant && <Loader2 className="w-4 h-4 animate-spin" />}
                                            {editingTenant.id ? 'Actualizar Empresa' : 'Guardar Empresa'}
                                        </button>
                                    </div>
                                );
                            })()}
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
                                <div className="col-span-1 md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Consulta SuiteQL personalizada
                                        <span className="ml-2 text-xs font-normal text-gray-400">(opcional — deja vacío para usar la consulta predeterminada)</span>
                                    </label>
                                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 mb-2 flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                                        <p className="text-xs text-amber-700">Modificar esta consulta cambiará las órdenes de compra visibles para los proveedores de esta subsidiaria. Usa <code className="bg-amber-100 px-1 rounded">&#123;rfcClause&#125;</code> para insertar el filtro de RFC.</p>
                                    </div>
                                    <textarea
                                        rows={8}
                                        value={editingSubsidiary.poSuiteqlQuery ?? ''}
                                        onChange={(e) => setEditingSubsidiary({ ...editingSubsidiary, poSuiteqlQuery: e.target.value })}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-xs p-2 border text-gray-800 bg-white font-mono"
                                        placeholder={DEFAULT_SUITEQL_QUERY}
                                        spellCheck={false}
                                    />
                                    {!editingSubsidiary.poSuiteqlQuery?.trim() && (
                                        <p className="mt-1 text-xs text-gray-400 italic">Se usará la consulta predeterminada del sistema.</p>
                                    )}
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

            {/* Modal de Advertencia: Cambio de Consulta SuiteQL */}
            {showQueryWarning && (
                <div className="fixed inset-0 overflow-y-auto h-full w-full flex items-center justify-center z-[60] pointer-events-none">
                    <div className="bg-white p-8 rounded-xl shadow-2xl border border-amber-200 w-full max-w-md text-center pointer-events-auto relative">
                        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-amber-500" />
                        <h3 className="text-xl font-bold text-gray-800 mb-2">Modificación de consulta SuiteQL</h3>
                        <p className="text-gray-600 text-sm mb-6">
                            Estás a punto de modificar la consulta de búsqueda de órdenes de compra para la subsidiaria <strong>{editingSubsidiary?.name}</strong>. Esto cambiará qué OC son visibles para sus proveedores.
                            <br /><br />
                            ¿Deseas continuar?
                        </p>
                        <div className="flex justify-center space-x-4">
                            <button
                                onClick={() => setShowQueryWarning(false)}
                                className="px-5 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 rounded font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={doSaveSubsidiary}
                                className="px-5 py-2 text-sm text-white bg-amber-600 hover:bg-amber-700 rounded font-medium shadow-sm"
                            >
                                Sí, guardar cambios
                            </button>
                        </div>
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
                                <PasswordInput required value={creatingAdminFor.password || ''} onChange={(e) => setCreatingAdminFor({ ...creatingAdminFor, password: e.target.value })} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border text-gray-900 bg-white" placeholder="Mayúsculas, números y símbolos" />
                                <div className="mt-2">
                                    <PasswordRequirementChecklist password={creatingAdminFor.password || ''} />
                                </div>
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

            {/* Modal para Confirmar Eliminar Tenant */}
            {deletingTenant && (
                <div className="fixed inset-0 overflow-y-auto h-full w-full flex items-center justify-center z-50 pointer-events-none">
                    <div className="bg-white p-8 rounded-xl shadow-2xl border border-red-200 w-full max-w-md text-center pointer-events-auto relative">
                        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Trash2 className="w-7 h-7 text-red-600" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">Eliminar Empresa</h3>
                        <p className="text-gray-600 text-sm mb-2">
                            Esta acción eliminará permanentemente <strong>{deletingTenant.name}</strong> y todos sus datos asociados:
                        </p>
                        <ul className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-left mb-4 space-y-1">
                            <li>• Subsidiarias, proveedores y usuarios</li>
                            <li>• Órdenes de compra y facturas</li>
                            <li>• Complementos de pago y documentos</li>
                            <li>• Logs de sincronización y toda la configuración</li>
                        </ul>
                        <p className="text-sm text-gray-700 mb-2">
                            Escribe <strong className="font-mono">{deletingTenant.name}</strong> para confirmar:
                        </p>
                        <input
                            type="text"
                            value={deleteConfirmName}
                            onChange={(e) => setDeleteConfirmName(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 mb-5 focus:outline-none focus:ring-2 focus:ring-red-400"
                            placeholder="Nombre exacto de la empresa"
                        />
                        <div className="flex justify-center space-x-4">
                            <button
                                onClick={() => { setDeletingTenant(null); setDeleteConfirmName(''); }}
                                disabled={isDeletingTenant}
                                className="px-5 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 rounded font-medium disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDeleteTenant}
                                disabled={deleteConfirmName !== deletingTenant.name || isDeletingTenant}
                                className="flex items-center gap-2 px-5 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded font-medium shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {isDeletingTenant && <Loader2 className="w-4 h-4 animate-spin" />}
                                Eliminar Definitivamente
                            </button>
                        </div>
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
