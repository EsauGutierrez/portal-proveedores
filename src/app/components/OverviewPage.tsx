"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, TrendingUp, CheckCircle, Clock, AlertTriangle, Users, Building2, FileText, FileCheck } from 'lucide-react';

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

    if (isLoading) return <div className="flex justify-center items-center h-64"><Loader2 className="w-12 h-12 text-blue-600 animate-spin" /></div>;
    if (error) return <div className="text-red-600 text-center p-4 bg-red-50 rounded-md">{error}</div>;
    if (!metrics) return null;

    const MetricCard = ({ title, value, icon: Icon, colorClass, borderClass }) => (
        <div className={`bg-white rounded-xl shadow-sm border-l-4 ${borderClass} p-6 flex items-center justify-between`}>
            <div>
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">{title}</p>
                <h3 className="text-3xl font-bold text-gray-800">{value}</h3>
            </div>
            <div className={`p-4 rounded-full bg-opacity-10 ${colorClass.replace('text-', 'bg-')}`}>
                <Icon className={`w-8 h-8 ${colorClass}`} />
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-800">Hola, {user?.name} 👋</h2>
                <p className="text-gray-500 mt-1">Aquí tienes un resumen de tu actividad en el portal.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {user.role === 'SUPPLIER' && (
                    <>
                        <MetricCard
                            title="Facturas Subidas" value={metrics.totalFacturas || 0} icon={FileText}
                            colorClass="text-blue-600" borderClass="border-blue-600"
                        />
                        <MetricCard
                            title="Facturas Aprobadas" value={metrics.facturasAprobadas || 0} icon={CheckCircle}
                            colorClass="text-green-600" borderClass="border-green-500"
                        />
                        <MetricCard
                            title="Facturas Pendientes" value={metrics.facturasPendientes || 0} icon={Clock}
                            colorClass="text-yellow-600" borderClass="border-yellow-500"
                        />
                        <MetricCard
                            title="Monto Aprobado" value={metrics.montoTotalAprobado || '$0.00'} icon={TrendingUp}
                            colorClass="text-purple-600" borderClass="border-purple-500"
                        />
                    </>
                )}

                {(user.role === 'ADMIN' || user.role === 'TENANT_ADMIN') && (
                    <>
                        <MetricCard
                            title="Proveedores Activos" value={metrics.proveedoresActivos || 0} icon={Users}
                            colorClass="text-indigo-600" borderClass="border-indigo-600"
                        />
                        <MetricCard
                            title="Altas Pendientes" value={metrics.proveedoresPendientes || 0} icon={AlertTriangle}
                            colorClass="text-yellow-600" borderClass="border-yellow-500"
                        />
                        <MetricCard
                            title="Facturas Recibidas" value={metrics.facturasRecibidas || 0} icon={FileText}
                            colorClass="text-blue-600" borderClass="border-blue-500"
                        />
                        <MetricCard
                            title="Facturas Pendientes" value={metrics.facturasPendientes || 0} icon={FileCheck}
                            colorClass="text-orange-500" borderClass="border-orange-500"
                        />
                    </>
                )}

                {user.role === 'SUPERADMIN' && (
                    <>
                        <MetricCard
                            title="Clientes Totales" value={metrics.totalClientes || 0} icon={Building2}
                            colorClass="text-indigo-600" borderClass="border-indigo-600"
                        />
                        <MetricCard
                            title="Clientes Activos" value={metrics.clientesActivos || 0} icon={CheckCircle}
                            colorClass="text-green-600" borderClass="border-green-500"
                        />
                    </>
                )}
            </div>

        </div>
    );
};

export default OverviewPage;
