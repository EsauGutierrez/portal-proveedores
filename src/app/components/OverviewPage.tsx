"use client";

import React, { useState, useEffect } from 'react';
import {
    Loader2, TrendingUp, CheckCircle, Clock, AlertTriangle, Users,
    Building2, FileText, FileCheck, XCircle, Bell, ArrowRight,
    DollarSign, UserPlus, ShieldCheck, ShieldAlert, ShieldX, CalendarDays
} from 'lucide-react';
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend
} from 'recharts';

// ─── Metric Card ──────────────────────────────────────────────────────────────
const MetricCard = ({ title, value, icon: Icon, colorClass, borderClass, subtitle = null }) => (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${borderClass} p-5 flex items-center justify-between`}>
        <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{title}</p>
            <h3 className="text-3xl font-bold text-gray-800">{value}</h3>
            {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-full ${colorClass.replace('text-', 'bg-').replace('600', '100').replace('500', '100')}`}>
            <Icon className={`w-7 h-7 ${colorClass}`} />
        </div>
    </div>
);

// ─── Alert Banner ─────────────────────────────────────────────────────────────
const AlertBanner = ({ count, label, href, color }) => {
    if (!count) return null;
    const colors = {
        amber: 'bg-amber-50 border-amber-300 text-amber-800',
        red: 'bg-red-50 border-red-300 text-red-800',
        blue: 'bg-blue-50 border-blue-300 text-blue-800',
    };
    return (
        <div className={`flex items-center justify-between px-4 py-3 rounded-lg border ${colors[color]} text-sm font-medium`}>
            <div className="flex items-center gap-2">
                <Bell className="w-4 h-4" />
                <span><strong>{count}</strong> {label}</span>
            </div>
            <ArrowRight className="w-4 h-4 opacity-60" />
        </div>
    );
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
    const map = {
        SYNCED: { label: 'Aprobada', cls: 'bg-green-100 text-green-700' },
        PENDING_SYNC: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-700' },
        FAILED: { label: 'Fallida', cls: 'bg-red-100 text-red-700' },
        ACTIVE: { label: 'Activo', cls: 'bg-green-100 text-green-700' },
        PENDING: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-700' },
        REJECTED: { label: 'Rechazado', cls: 'bg-red-100 text-red-700' },
    };
    const s = map[status] || { label: status, cls: 'bg-gray-100 text-gray-700' };
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>;
};

// ─── Tooltip personalizado para gráficos ──────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
            <p className="font-semibold text-gray-700 mb-1">{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color }} className="text-xs">
                    {p.name}: <strong>{p.value}</strong>
                </p>
            ))}
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const OverviewPage = ({ user }) => {
    const [metrics, setMetrics] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/metrics', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error('Error al obtener métricas del dashboard');
                const data = await res.json();
                setMetrics(data);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchMetrics();
    }, [user]);

    if (isLoading) return (
        <div className="flex justify-center items-center h-64">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        </div>
    );

    if (error) return (
        <div className="text-red-600 text-center p-4 bg-red-50 rounded-md">{error}</div>
    );

    if (!metrics) return null;

    const formatFecha = (d: any) => new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });

    // ── SUPPLIER VIEW ─────────────────────────────────────────────────────────
    if (user.role === 'SUPPLIER') {
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Hola, {user?.name} 👋</h2>
                    <p className="text-gray-500 mt-1 text-sm">Aquí tienes un resumen de tu actividad en el portal.</p>
                </div>

                {/* Métricas */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard title="Facturas Subidas" value={metrics.totalFacturas} icon={FileText} colorClass="text-blue-600" borderClass="border-blue-500" />
                    <MetricCard title="Aprobadas" value={metrics.facturasAprobadas} icon={CheckCircle} colorClass="text-green-600" borderClass="border-green-500" />
                    <MetricCard title="Pendientes" value={metrics.facturasPendientes} icon={Clock} colorClass="text-yellow-600" borderClass="border-yellow-500" />
                    <MetricCard title="Monto Aprobado" value={metrics.montoTotalAprobado} icon={TrendingUp} colorClass="text-purple-600" borderClass="border-purple-500" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Gráfico tendencia facturas */}
                    <div className="bg-white rounded-xl shadow-sm p-5">
                        <h3 className="text-sm font-semibold text-gray-700 mb-4">Facturas subidas — últimos 6 meses</h3>
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={metrics.tendencia} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                <Tooltip content={<CustomTooltip active={undefined} payload={undefined} label={undefined} />} />
                                <Bar dataKey="facturas" name="Facturas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Actividad reciente */}
                    <div className="bg-white rounded-xl shadow-sm p-5">
                        <h3 className="text-sm font-semibold text-gray-700 mb-4">Actividad reciente</h3>
                        {metrics.actividadReciente?.length > 0 ? (
                            <div className="space-y-3">
                                {metrics.actividadReciente.map((item: any) => (
                                    <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center">
                                                <FileText className="w-4 h-4 text-blue-500" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-gray-800">{item.descripcion}</p>
                                                <p className="text-xs text-gray-400">{formatFecha(item.fecha)} · {item.monto}</p>
                                            </div>
                                        </div>
                                        <StatusBadge status={item.estado} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400 text-center py-8">No hay facturas aún.</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── ADMIN / TENANT_ADMIN VIEW ─────────────────────────────────────────────
    if (user.role === 'ADMIN' || user.role === 'TENANT_ADMIN') {
        const alertas = metrics.alertas || {};

        // Datos de suscripción
        const tenant = user.tenant;
        const maxSubs = tenant?.maxSubsidiaries ?? null;
        const maxSup  = tenant?.maxSuppliers ?? null;
        const expAt   = tenant?.subscriptionExpiresAt ? new Date(tenant.subscriptionExpiresAt) : null;
        const now     = new Date();
        const gracePeriodEnd = expAt ? new Date(expAt.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
        const isExpired  = expAt && now > expAt;
        const isInGrace  = isExpired && gracePeriodEnd && now <= gracePeriodEnd;
        const isPastGrace = isExpired && !isInGrace;
        const subsActivas = metrics.subsidiariasActivas ?? 0;
        const supActivos  = metrics.proveedoresActivos  ?? 0;

        const hasSuscripcion = maxSubs !== null || maxSup !== null || expAt !== null;

        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Hola, {user?.name} 👋</h2>
                    <p className="text-gray-500 mt-1 text-sm">Aquí tienes un resumen de tu actividad en el portal.</p>
                </div>

                {/* ── Suscripción ─────────────────────────────────────────── */}
                {hasSuscripcion && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Suscripción</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                            {/* Vigencia */}
                            {expAt && (() => {
                                const Icon  = isPastGrace ? ShieldX : isInGrace ? ShieldAlert : ShieldCheck;
                                const color = isPastGrace ? 'text-red-600' : isInGrace ? 'text-amber-600' : 'text-green-600';
                                const bg    = isPastGrace ? 'bg-red-50 border-red-200' : isInGrace ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200';
                                const label = isPastGrace ? 'Suspendida' : isInGrace ? 'En periodo de gracia' : 'Vigente';
                                const dias  = Math.ceil((expAt.getTime() - now.getTime()) / 86400000);
                                return (
                                    <div className={`flex items-center gap-3 rounded-lg border p-4 ${bg}`}>
                                        <Icon className={`w-8 h-8 flex-shrink-0 ${color}`} />
                                        <div>
                                            <p className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</p>
                                            <p className="text-sm font-bold text-gray-800 mt-0.5">{expAt.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                            {!isPastGrace && <p className="text-xs text-gray-500 mt-0.5">{dias > 0 ? `Vence en ${dias} día${dias !== 1 ? 's' : ''}` : 'Vence hoy'}</p>}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Subsidiarias */}
                            {maxSubs !== null && (() => {
                                const pct  = Math.min(100, Math.round((subsActivas / maxSubs) * 100));
                                const full = subsActivas >= maxSubs;
                                return (
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-1.5">
                                                <Building2 className="w-4 h-4 text-gray-500" />
                                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Subsidiarias</span>
                                            </div>
                                            <span className={`text-sm font-bold ${full ? 'text-red-600' : 'text-gray-800'}`}>{subsActivas} / {maxSubs}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div className={`h-2 rounded-full transition-all ${full ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                                        </div>
                                        {full && <p className="text-xs text-red-600 mt-1.5 font-medium">Límite alcanzado</p>}
                                    </div>
                                );
                            })()}

                            {/* Proveedores */}
                            {maxSup !== null && (() => {
                                const pct  = Math.min(100, Math.round((supActivos / maxSup) * 100));
                                const full = supActivos >= maxSup;
                                return (
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-1.5">
                                                <Users className="w-4 h-4 text-gray-500" />
                                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Proveedores activos</span>
                                            </div>
                                            <span className={`text-sm font-bold ${full ? 'text-red-600' : 'text-gray-800'}`}>{supActivos} / {maxSup}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div className={`h-2 rounded-full transition-all ${full ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                                        </div>
                                        {full && <p className="text-xs text-red-600 mt-1.5 font-medium">Límite alcanzado</p>}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* Alertas */}
                {(alertas.proveedoresSinAprobar > 0 || alertas.facturasFallidas > 0) && (
                    <div className="space-y-2">
                        <AlertBanner count={alertas.proveedoresSinAprobar} label="proveedores pendientes de aprobación" href="#" color="amber" />
                        <AlertBanner count={alertas.facturasFallidas} label="facturas con error de sincronización" href="#" color="red" />
                        <AlertBanner count={alertas.facturasSinProcesar} label="facturas pendientes de procesar" href="#" color="blue" />
                    </div>
                )}

                {/* Métricas proveedores */}
                <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Proveedores</p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <MetricCard title="Proveedores Activos" value={metrics.proveedoresActivos} icon={Users} colorClass="text-indigo-600" borderClass="border-indigo-500" />
                        <MetricCard title="Altas Pendientes" value={metrics.proveedoresPendientes} icon={UserPlus} colorClass="text-amber-600" borderClass="border-amber-500" />
                        <MetricCard title="Total Registrados" value={metrics.totalProveedores} icon={Building2} colorClass="text-gray-600" borderClass="border-gray-400" />
                        <MetricCard title="Rechazados" value={metrics.proveedoresRechazados} icon={XCircle} colorClass="text-red-500" borderClass="border-red-400" />
                    </div>
                </div>

                {/* Métricas facturas */}
                <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Facturas</p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <MetricCard title="Facturas Recibidas" value={metrics.facturasRecibidas} icon={FileText} colorClass="text-blue-600" borderClass="border-blue-500" />
                        <MetricCard title="Aprobadas" value={metrics.facturasAprobadas} icon={CheckCircle} colorClass="text-green-600" borderClass="border-green-500" />
                        <MetricCard title="Pendientes" value={metrics.facturasPendientes} icon={Clock} colorClass="text-yellow-600" borderClass="border-yellow-500" />
                        <MetricCard title="Monto Aprobado" value={metrics.montoTotalAprobado} icon={DollarSign} colorClass="text-purple-600" borderClass="border-purple-500" />
                    </div>
                </div>

                {/* Gráficos */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Gráfico facturas por mes */}
                    <div className="bg-white rounded-xl shadow-sm p-5">
                        <h3 className="text-sm font-semibold text-gray-700 mb-4">Facturas — últimos 6 meses</h3>
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={metrics.tendenciaFacturas} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                <Tooltip content={<CustomTooltip active={undefined} payload={undefined} label={undefined} />} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="recibidas" name="Recibidas" fill="#93c5fd" radius={[3, 3, 0, 0]} />
                                <Bar dataKey="aprobadas" name="Aprobadas" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Gráfico proveedores registrados */}
                    <div className="bg-white rounded-xl shadow-sm p-5">
                        <h3 className="text-sm font-semibold text-gray-700 mb-4">Proveedores registrados — últimos 6 meses</h3>
                        <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={metrics.tendenciaProveedores} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                <Tooltip content={<CustomTooltip active={undefined} payload={undefined} label={undefined} />} />
                                <Line type="monotone" dataKey="registrados" name="Registrados" stroke="#6366f1" strokeWidth={2} dot={{ r: 4, fill: '#6366f1' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Actividad reciente */}
                <div className="bg-white rounded-xl shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">Actividad reciente</h3>
                    {metrics.actividadReciente?.length > 0 ? (
                        <div className="divide-y divide-gray-50">
                            {metrics.actividadReciente.map((item: any) => (
                                <div key={item.id + item.tipo} className="flex items-center justify-between py-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${item.tipo === 'factura' ? 'bg-blue-50' : 'bg-indigo-50'}`}>
                                            {item.tipo === 'factura'
                                                ? <FileText className="w-4 h-4 text-blue-500" />
                                                : <UserPlus className="w-4 h-4 text-indigo-500" />
                                            }
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-800">{item.descripcion}</p>
                                            <p className="text-xs text-gray-400">
                                                {formatFecha(item.fecha)}
                                                {item.monto && ` · ${item.monto}`}
                                            </p>
                                        </div>
                                    </div>
                                    <StatusBadge status={item.estado} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-400 text-center py-8">No hay actividad reciente.</p>
                    )}
                </div>
            </div>
        );
    }

    // ── SUPERADMIN VIEW ────────────────────────────────────────────────────────
    if (user.role === 'SUPERADMIN') {
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Hola, {user?.name} 👋</h2>
                    <p className="text-gray-500 mt-1 text-sm">Vista global del sistema.</p>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <MetricCard title="Clientes Totales" value={metrics.totalClientes} icon={Building2} colorClass="text-indigo-600" borderClass="border-indigo-500" />
                    <MetricCard title="Clientes Activos" value={metrics.clientesActivos} icon={CheckCircle} colorClass="text-green-600" borderClass="border-green-500" />
                    <MetricCard title="Suspendidos" value={metrics.clientesSuspendidos} icon={XCircle} colorClass="text-red-500" borderClass="border-red-400" />
                    <MetricCard title="Total Proveedores" value={metrics.totalProveedores} icon={Users} colorClass="text-blue-600" borderClass="border-blue-500" subtitle="en todos los tenants" />
                    <MetricCard title="Total Facturas" value={metrics.totalFacturas} icon={FileText} colorClass="text-purple-600" borderClass="border-purple-500" subtitle="en todo el sistema" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Gráfico clientes */}
                    <div className="bg-white rounded-xl shadow-sm p-5">
                        <h3 className="text-sm font-semibold text-gray-700 mb-4">Clientes registrados — últimos 6 meses</h3>
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={metrics.tendenciaClientes} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                <Tooltip content={<CustomTooltip active={undefined} payload={undefined} label={undefined} />} />
                                <Bar dataKey="nuevos" name="Nuevos" fill="#6366f1" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Últimos clientes */}
                    <div className="bg-white rounded-xl shadow-sm p-5">
                        <h3 className="text-sm font-semibold text-gray-700 mb-4">Últimos clientes registrados</h3>
                        <div className="divide-y divide-gray-50">
                            {metrics.ultimosClientes?.map((t: any) => (
                                <div key={t.id} className="flex items-center justify-between py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 bg-indigo-50 rounded-full flex items-center justify-center">
                                            <Building2 className="w-4 h-4 text-indigo-500" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-800">{t.nombre}</p>
                                            <p className="text-xs text-gray-400">{formatFecha(t.fecha)}</p>
                                        </div>
                                    </div>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {t.activo ? 'Activo' : 'Suspendido'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};

export default OverviewPage;
