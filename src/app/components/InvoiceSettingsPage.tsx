"use client";

import React, { useState, useEffect } from 'react';
import { Settings, Save, CheckCircle, AlertTriangle, Loader2, UploadCloud, FileText } from 'lucide-react';

const Toggle = ({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) => (
    <button
        type="button"
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
    >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
);

const SectionHeader = ({ icon: Icon, color, title, description }: { icon: any; color: string; title: string; description: string }) => (
    <div className="flex items-start gap-3 pb-4 border-b mb-5">
        <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-5 h-5" />
        </div>
        <div>
            <h3 className="font-semibold text-gray-800">{title}</h3>
            <p className="text-sm text-gray-500">{description}</p>
        </div>
    </div>
);

const ToggleRow = ({ label, description, enabled, onToggle }: { label: string; description: string; enabled: boolean; onToggle: () => void }) => (
    <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
        <div>
            <p className="text-sm font-medium text-gray-800">{label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        <Toggle enabled={enabled} onToggle={onToggle} />
    </div>
);

export default function InvoiceSettingsPage() {
    const [tolerance, setTolerance] = useState<string>('');
    const [bulkUploadForSuppliers, setBulkUploadForSuppliers] = useState(false);
    const [bulkPaymentForSuppliers, setBulkPaymentForSuppliers] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    useEffect(() => {
        fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => {
                setTolerance(String(data.invoiceTolerance ?? 0.5));
                setBulkUploadForSuppliers(data.bulkUploadForSuppliers ?? false);
                setBulkPaymentForSuppliers(data.bulkPaymentForSuppliers ?? false);
            })
            .catch(() => setError('No se pudo cargar la configuración.'))
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSuccess('');
        setError('');
        const value = parseFloat(tolerance);
        if (isNaN(value) || value < 0) {
            setError('Ingresa un valor numérico mayor o igual a 0.');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/admin/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ invoiceTolerance: value, bulkUploadForSuppliers, bulkPaymentForSuppliers }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setSuccess(data.message);
        } catch (e: any) {
            setError(e.message || 'Error al guardar.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-blue-600 animate-spin" /></div>;
    }

    return (
        <div className="max-w-2xl space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-gray-800">Preferencias Generales</h2>
                <p className="text-gray-500 mt-1 text-sm">Configura las opciones disponibles para proveedores y cargadores de tu empresa.</p>
            </div>

            {/* ── Sección: Facturas ── */}
            <div className="bg-white rounded-lg shadow-md p-6 space-y-5">
                <SectionHeader
                    icon={Settings}
                    color="bg-blue-100 text-blue-600"
                    title="Facturas"
                    description="Reglas de validación y opciones de carga para facturas de proveedores."
                />

                {/* Tolerancia */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tolerancia máxima de importe (MXN)
                    </label>
                    <div className="flex items-center gap-3">
                        <div className="relative w-48">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={tolerance}
                                onChange={e => {
                                    const v = parseFloat(e.target.value);
                                    setTolerance(isNaN(v) || v < 0 ? '0' : e.target.value);
                                }}
                                className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                                placeholder="0.50"
                            />
                        </div>
                        <span className="text-sm text-gray-500">
                            {parseFloat(tolerance) === 0
                                ? 'Sin tolerancia — los importes deben coincidir exactamente.'
                                : `Se permite una diferencia de hasta $${parseFloat(tolerance).toFixed(2)} MXN.`}
                        </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                        Diferencia máxima permitida entre el total de la factura y el total de la recepción u orden de compra.
                    </p>
                </div>

                {/* Toggle: carga masiva facturas */}
                <ToggleRow
                    label="Carga masiva de facturas para proveedores"
                    description={bulkUploadForSuppliers
                        ? 'Los proveedores verán la opción "Carga Masiva" en su menú.'
                        : 'Solo los cargadores asignados pueden usar la carga masiva de facturas.'}
                    enabled={bulkUploadForSuppliers}
                    onToggle={() => setBulkUploadForSuppliers(p => !p)}
                />
            </div>

            {/* ── Sección: Complementos de Pago ── */}
            <div className="bg-white rounded-lg shadow-md p-6 space-y-5">
                <SectionHeader
                    icon={FileText}
                    color="bg-purple-100 text-purple-600"
                    title="Complementos de Pago"
                    description="Opciones de carga masiva para complementos de pago CFDI."
                />

                <ToggleRow
                    label="Carga masiva de complementos para proveedores"
                    description={bulkPaymentForSuppliers
                        ? 'Los proveedores verán "Complementos Masivos" en su menú.'
                        : 'Solo los cargadores asignados pueden hacer carga masiva de complementos.'}
                    enabled={bulkPaymentForSuppliers}
                    onToggle={() => setBulkPaymentForSuppliers(p => !p)}
                />
            </div>

            {/* Feedback y guardar */}
            <div className="space-y-3">
                {success && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                        <CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}
                    </div>
                )}
                {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
                    </div>
                )}
                <div className="flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Guardar configuración
                    </button>
                </div>
            </div>
        </div>
    );
}
