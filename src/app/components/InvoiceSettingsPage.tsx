"use client";

import React, { useState, useEffect } from 'react';
import { Settings, Save, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

export default function InvoiceSettingsPage() {
    const [tolerance, setTolerance] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    useEffect(() => {
        fetch('/api/admin/settings', {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.json())
            .then(data => {
                setTolerance(String(data.invoiceTolerance ?? 0.5));
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
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ invoiceTolerance: value }),
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
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-2xl">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Configuración de Facturas</h2>
                <p className="text-gray-500 mt-1">Ajusta las reglas de validación para la carga de facturas de proveedores.</p>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Settings className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-800">Tolerancia de importe</h3>
                        <p className="text-sm text-gray-500">Diferencia máxima permitida (en pesos) entre el total de la factura y el total de la recepción u orden de compra.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Tolerancia máxima (MXN)
                        </label>
                        <div className="flex items-center gap-3">
                            <div className="relative w-48">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={tolerance}
                                    onChange={e => setTolerance(e.target.value)}
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
                            Ejemplo: con valor <span className="font-mono">1.00</span> un proveedor puede subir una factura con hasta $1.00 de diferencia respecto al total de la recepción.
                        </p>
                    </div>

                    {success && (
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                            <CheckCircle className="w-4 h-4 flex-shrink-0" />
                            {success}
                        </div>
                    )}
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    <div className="flex justify-end pt-2">
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
        </div>
    );
}
