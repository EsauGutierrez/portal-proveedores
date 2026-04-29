"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
    RefreshCw, CheckCircle2, AlertTriangle, XCircle, Clock,
    ChevronDown, ChevronUp, Filter, BarChart3, Calendar,
    TrendingUp, Activity, Play, ChevronLeft, ChevronRight,
    User, Zap, PackageSearch,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type SyncType   = 'SCHEDULED' | 'MANUAL';
type SyncStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED';

interface SyncLog {
    id: string;
    type: SyncType;
    status: SyncStatus;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    totalFound: number;
    durationMs: number;
    errorMessage: string | null;
    triggeredBy: string | null;
    createdAt: string;
}

interface SyncStats {
    totalSyncs: number;
    successRate: number;
    lastSync: string | null;
    lastSyncStatus: SyncStatus | null;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    const s = (ms / 1000).toFixed(1);
    return `${s} s`;
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('es-MX', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatDateShort(iso: string): string {
    return new Date(iso).toLocaleString('es-MX', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'Hace un momento';
    if (mins < 60) return `Hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `Hace ${hrs} h`;
    const days = Math.floor(hrs / 24);
    return `Hace ${days} día${days > 1 ? 's' : ''}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatusBadge = ({ status }: { status: SyncStatus }) => {
    const cfg: Record<SyncStatus, { label: string; cls: string; icon: React.ReactNode }> = {
        SUCCESS: {
            label: 'Exitoso',
            cls: 'bg-green-100 text-green-700 border border-green-200',
            icon: <CheckCircle2 className="w-3.5 h-3.5" />,
        },
        PARTIAL: {
            label: 'Parcial',
            cls: 'bg-amber-100 text-amber-700 border border-amber-200',
            icon: <AlertTriangle className="w-3.5 h-3.5" />,
        },
        FAILED: {
            label: 'Fallido',
            cls: 'bg-red-100 text-red-700 border border-red-200',
            icon: <XCircle className="w-3.5 h-3.5" />,
        },
    };
    const { label, cls, icon } = cfg[status];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
            {icon} {label}
        </span>
    );
};

const TypeBadge = ({ type }: { type: SyncType }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
        type === 'MANUAL'
            ? 'bg-blue-50 text-blue-700 border-blue-200'
            : 'bg-slate-100 text-slate-600 border-slate-200'
    }`}>
        {type === 'MANUAL' ? <Play className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
        {type === 'MANUAL' ? 'Manual' : 'Automático'}
    </span>
);

// Parsea el errorMessage textual y extrae líneas de error individuales
function parseErrors(msg: string | null): string[] {
    if (!msg) return [];
    const lines = msg.split('\n').map(l => l.trim()).filter(Boolean);
    // Primera línea suele ser "N errores:"
    return lines.filter(l => l.startsWith('•') || l.startsWith('-') || !l.endsWith(':'));
}

const ErrorDetail = ({ errorMessage }: { errorMessage: string | null }) => {
    const [expanded, setExpanded] = useState(false);
    if (!errorMessage) return null;

    const errors = parseErrors(errorMessage);
    const summary = errors.length > 0
        ? `${errors.length} error${errors.length > 1 ? 'es' : ''} detectado${errors.length > 1 ? 's' : ''}`
        : errorMessage.split('\n')[0];

    return (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 overflow-hidden">
            <button
                onClick={() => setExpanded(p => !p)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-red-700 font-medium hover:bg-red-100 transition-colors"
            >
                <span className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {summary}
                </span>
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {expanded && (
                <div className="px-4 pb-3 border-t border-red-200">
                    {errors.length > 0 ? (
                        <ul className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                            {errors.map((e, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-red-800 font-mono">
                                    <span className="shrink-0 mt-0.5 text-red-400">•</span>
                                    <span>{e.replace(/^•\s*/, '')}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <pre className="mt-2 text-xs text-red-800 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                            {errorMessage}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
};

const LogRow = ({ log }: { log: SyncLog }) => {
    const hasErrors = !!log.errorMessage;

    return (
        <div className={`bg-white rounded-xl border transition-all ${
            log.status === 'FAILED'  ? 'border-red-200' :
            log.status === 'PARTIAL' ? 'border-amber-200' :
            'border-gray-200'
        } shadow-sm`}>
            {/* Row principal */}
            <div className="p-4 grid grid-cols-12 gap-3 items-start">
                {/* Fecha + tipo */}
                <div className="col-span-3 flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-gray-800">{formatDate(log.createdAt)}</span>
                    <span className="text-xs text-gray-400">{timeAgo(log.createdAt)}</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                        <TypeBadge type={log.type} />
                        <StatusBadge status={log.status} />
                    </div>
                </div>

                {/* Contadores */}
                <div className="col-span-6 grid grid-cols-4 gap-2">
                    <div className="flex flex-col items-center bg-gray-50 rounded-lg p-2">
                        <PackageSearch className="w-4 h-4 text-gray-400 mb-1" />
                        <span className="text-lg font-bold text-gray-800">{log.totalFound}</span>
                        <span className="text-[10px] text-gray-500 text-center">Encontradas</span>
                    </div>
                    <div className="flex flex-col items-center bg-green-50 rounded-lg p-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mb-1" />
                        <span className="text-lg font-bold text-green-700">{log.createdCount}</span>
                        <span className="text-[10px] text-green-600 text-center">Nuevas</span>
                    </div>
                    <div className="flex flex-col items-center bg-blue-50 rounded-lg p-2">
                        <RefreshCw className="w-4 h-4 text-blue-500 mb-1" />
                        <span className="text-lg font-bold text-blue-700">{log.updatedCount}</span>
                        <span className="text-[10px] text-blue-600 text-center">Actualizadas</span>
                    </div>
                    <div className="flex flex-col items-center bg-amber-50 rounded-lg p-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500 mb-1" />
                        <span className="text-lg font-bold text-amber-700">{log.skippedCount}</span>
                        <span className="text-[10px] text-amber-600 text-center">Omitidas</span>
                    </div>
                </div>

                {/* Meta */}
                <div className="col-span-3 flex flex-col gap-2 items-end text-right">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formatDuration(log.durationMs)}</span>
                    </div>
                    {log.triggeredBy && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <User className="w-3.5 h-3.5" />
                            <span className="max-w-[140px] truncate">{log.triggeredBy}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Error detail */}
            {hasErrors && (
                <div className="px-4 pb-4">
                    <ErrorDetail errorMessage={log.errorMessage} />
                </div>
            )}
        </div>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function SyncLogsPage() {
    const [logs, setLogs] = useState<SyncLog[]>([]);
    const [stats, setStats] = useState<SyncStats | null>(null);
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
    const [filterType, setFilterType] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [page, setPage] = useState(1);

    const fetchLogs = useCallback(async (p = page) => {
        setIsLoading(true);
        try {
            const token = localStorage.getItem('token');
            const params = new URLSearchParams({ page: String(p), limit: '20' });
            if (filterType)   params.set('type',   filterType);
            if (filterStatus) params.set('status', filterStatus);

            const res = await fetch(`/api/admin/sync/purchase-orders?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Error al cargar logs');
            const data = await res.json();
            setLogs(data.logs ?? []);
            setStats(data.stats ?? null);
            setPagination(data.pagination ?? { page: p, limit: 20, total: 0, totalPages: 1 });
        } catch {
            // silencioso — tabla queda vacía
        } finally {
            setIsLoading(false);
        }
    }, [page, filterType, filterStatus]);

    useEffect(() => { fetchLogs(page); }, [page, filterType, filterStatus]);

    const handleSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        setSyncResult(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/admin/sync/purchase-orders', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setSyncResult({ success: res.ok, message: data.message ?? (res.ok ? 'Sincronización completada.' : 'Error al sincronizar.') });
            if (res.ok) {
                setPage(1);
                await fetchLogs(1);
            }
        } catch {
            setSyncResult({ success: false, message: 'Error de red al conectar con el servidor.' });
        } finally {
            setIsSyncing(false);
        }
    };

    // ─── Render ───────────────────────────────────────────────────────────────

    const lastStatusColor =
        stats?.lastSyncStatus === 'SUCCESS' ? 'text-green-600' :
        stats?.lastSyncStatus === 'PARTIAL' ? 'text-amber-600' :
        stats?.lastSyncStatus === 'FAILED'  ? 'text-red-600'   : 'text-gray-400';

    return (
        <div className="space-y-6">

            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Log de Sincronización</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Historial de sincronizaciones automáticas y manuales de Órdenes de Compra con NetSuite.</p>
                </div>
                <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl shadow-sm transition-all"
                >
                    {isSyncing
                        ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sincronizando…</>
                        : <><Play className="w-4 h-4" /> Sincronizar Ahora</>
                    }
                </button>
            </div>

            {/* Resultado de sync manual */}
            {syncResult && (
                <div className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${
                    syncResult.success
                        ? 'bg-green-50 border-green-200 text-green-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                    {syncResult.success
                        ? <CheckCircle2 className="w-5 h-5 shrink-0 text-green-500 mt-0.5" />
                        : <XCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
                    }
                    <div>
                        <p className="font-semibold">{syncResult.success ? 'Sincronización completada' : 'Error en la sincronización'}</p>
                        <p className="mt-0.5 opacity-80">{syncResult.message}</p>
                    </div>
                    <button onClick={() => setSyncResult(null)} className="ml-auto text-current opacity-50 hover:opacity-80">✕</button>
                </div>
            )}

            {/* Stats cards */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-indigo-50 rounded-lg">
                                <Activity className="w-4 h-4 text-indigo-600" />
                            </div>
                            <span className="text-xs font-medium text-gray-500">Total Syncs</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-800">{stats.totalSyncs}</p>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-green-50 rounded-lg">
                                <TrendingUp className="w-4 h-4 text-green-600" />
                            </div>
                            <span className="text-xs font-medium text-gray-500">Tasa de éxito</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-800">{stats.successRate}%</p>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-blue-50 rounded-lg">
                                <Calendar className="w-4 h-4 text-blue-600" />
                            </div>
                            <span className="text-xs font-medium text-gray-500">Última sync</span>
                        </div>
                        <p className="text-sm font-bold text-gray-800">
                            {stats.lastSync ? formatDateShort(stats.lastSync) : '—'}
                        </p>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-gray-100 rounded-lg">
                                <BarChart3 className="w-4 h-4 text-gray-600" />
                            </div>
                            <span className="text-xs font-medium text-gray-500">Estado última</span>
                        </div>
                        <p className={`text-sm font-bold ${lastStatusColor}`}>
                            {stats.lastSyncStatus === 'SUCCESS' ? 'Exitosa' :
                             stats.lastSyncStatus === 'PARTIAL' ? 'Parcial' :
                             stats.lastSyncStatus === 'FAILED'  ? 'Fallida' : '—'}
                        </p>
                    </div>
                </div>
            )}

            {/* Filtros */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Filter className="w-4 h-4" />
                    <span className="font-medium">Filtros:</span>
                </div>

                <select
                    value={filterType}
                    onChange={e => { setFilterType(e.target.value); setPage(1); }}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">Tipo: Todos</option>
                    <option value="MANUAL">Manual</option>
                    <option value="SCHEDULED">Automático</option>
                </select>

                <select
                    value={filterStatus}
                    onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">Estado: Todos</option>
                    <option value="SUCCESS">Exitoso</option>
                    <option value="PARTIAL">Parcial</option>
                    <option value="FAILED">Fallido</option>
                </select>

                {(filterType || filterStatus) && (
                    <button
                        onClick={() => { setFilterType(''); setFilterStatus(''); setPage(1); }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                        Limpiar filtros
                    </button>
                )}

                <span className="ml-auto text-xs text-gray-400">
                    {pagination.total} resultado{pagination.total !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Lista de logs */}
            {isLoading ? (
                <div className="flex justify-center items-center py-20">
                    <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
            ) : logs.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-16 text-center">
                    <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Sin registros de sincronización</p>
                    <p className="text-sm text-gray-400 mt-1">Ejecuta una sincronización para ver el historial aquí.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {logs.map(log => <LogRow key={log.id} log={log} />)}
                </div>
            )}

            {/* Paginación */}
            {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                    <span className="text-sm text-gray-500">
                        Página {pagination.page} de {pagination.totalPages}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={pagination.page <= 1}
                            className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                            const p = Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4)) + i;
                            return (
                                <button
                                    key={p}
                                    onClick={() => setPage(p)}
                                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                                        p === pagination.page
                                            ? 'bg-blue-600 text-white'
                                            : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {p}
                                </button>
                            );
                        })}
                        <button
                            onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                            disabled={pagination.page >= pagination.totalPages}
                            className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
