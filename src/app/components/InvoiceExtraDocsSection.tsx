"use client";

import React, { useEffect, useState } from 'react';
import { Paperclip, Plus, Pencil, Trash2, X, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { EXTRA_FILE_TYPES, EXTRA_FILE_TYPE_KEYS, describeAllowedTypes, MAX_EXTRA_FILE_MB } from '../lib/invoiceExtraDocTypes';

type SupplierType = 'NATIONAL' | 'FOREIGN' | 'BOTH';

type ExtraDoc = {
    id: string;
    name: string;
    isRequired: boolean;
    isActive: boolean;
    supplierType: SupplierType;
    allowedTypes: string[];
    subsidiaryIds: string[];
    attachmentCount: number;
};

type Subsidiary = { id: string; name: string; isActive: boolean };

const SUPPLIER_TYPE_LABELS: Record<SupplierType, string> = { NATIONAL: 'Nacional', FOREIGN: 'Extranjero', BOTH: 'Ambos' };
const SUPPLIER_TYPE_STYLES: Record<SupplierType, string> = {
    NATIONAL: 'bg-blue-100 text-blue-700',
    FOREIGN: 'bg-orange-100 text-orange-700',
    BOTH: 'bg-purple-100 text-purple-700',
};

const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
});

const Toggle = ({ enabled, onToggle, disabled = false }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) => (
    <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
    >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
);

// ── Modal de alta / edición ─────────────────────────────────────────────────
const ExtraDocModal = ({ doc, subsidiaries, onClose, onSaved }: {
    doc: ExtraDoc | null;
    subsidiaries: Subsidiary[];
    onClose: () => void;
    onSaved: (saved: ExtraDoc, wasEdit: boolean) => void;
}) => {
    const isEdit = !!doc;
    const [name, setName] = useState(doc?.name ?? '');
    const [isRequired, setIsRequired] = useState(doc?.isRequired ?? false);
    const [supplierType, setSupplierType] = useState<SupplierType>(doc?.supplierType ?? 'BOTH');
    const [allowedTypes, setAllowedTypes] = useState<string[]>(doc?.allowedTypes ?? ['PDF']);
    const [subsidiaryIds, setSubsidiaryIds] = useState<string[]>(doc?.subsidiaryIds ?? []);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<{ name?: string; types?: string; general?: string }>({});

    const toggleInList = (list: string[], value: string) =>
        list.includes(value) ? list.filter(v => v !== value) : [...list, value];

    const handleSave = async () => {
        const trimmed = name.trim();
        const next: typeof errors = {};
        if (trimmed.length < 3) next.name = 'El nombre debe tener al menos 3 caracteres.';
        else if (trimmed.length > 100) next.name = 'El nombre no puede exceder 100 caracteres.';
        if (allowedTypes.length === 0) next.types = 'Selecciona al menos un tipo de archivo.';
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        setSaving(true);
        try {
            const res = await fetch(isEdit ? `/api/admin/invoice-documents/${doc!.id}` : '/api/admin/invoice-documents', {
                method: isEdit ? 'PATCH' : 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ name: trimmed, isRequired, supplierType, allowedTypes, subsidiaryIds }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 409) setErrors({ name: data.message });
                else setErrors({ general: data.message || 'No se pudo guardar el documento.' });
                return;
            }
            onSaved(data, isEdit);
        } catch {
            setErrors({ general: 'Error de conexión. Intenta de nuevo.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
                <div className="flex justify-between items-center mb-5">
                    <h3 className="text-lg font-bold text-gray-800">{isEdit ? 'Editar documento' : 'Agregar documento'}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
                </div>

                {errors.general && (
                    <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {errors.general}
                    </div>
                )}

                <div className="space-y-5">
                    {/* Nombre */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del documento *</label>
                        <input
                            value={name}
                            maxLength={100}
                            onChange={e => { setName(e.target.value); setErrors(prev => ({ ...prev, name: undefined, general: undefined })); }}
                            placeholder="Ej. Evidencia de entrega"
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${errors.name ? 'border-red-400' : 'border-gray-300'}`}
                        />
                        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
                    </div>

                    {/* Obligatorio */}
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={isRequired} onChange={e => setIsRequired(e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
                        Obligatorio (el proveedor no podrá enviar la factura sin este documento)
                    </label>

                    {/* Tipo de proveedor */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Se pide a proveedores</label>
                        <div className="flex gap-2">
                            {(Object.keys(SUPPLIER_TYPE_LABELS) as SupplierType[]).map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setSupplierType(t)}
                                    className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${supplierType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}
                                >
                                    {SUPPLIER_TYPE_LABELS[t]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tipos de archivo */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Tipos de archivo permitidos *</label>
                        <div className="grid grid-cols-2 gap-2">
                            {EXTRA_FILE_TYPE_KEYS.map(t => (
                                <label key={t} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer bg-gray-50 rounded-lg px-3 py-2">
                                    <input type="checkbox" checked={allowedTypes.includes(t)} onChange={() => { setAllowedTypes(prev => toggleInList(prev, t)); setErrors(prev => ({ ...prev, types: undefined })); }} className="w-4 h-4 rounded border-gray-300" />
                                    {EXTRA_FILE_TYPES[t].label}
                                </label>
                            ))}
                        </div>
                        {errors.types && <p className="mt-1 text-xs text-red-600">{errors.types}</p>}
                        <p className="mt-1 text-xs text-gray-400">Tamaño máximo por archivo: {MAX_EXTRA_FILE_MB} MB.</p>
                    </div>

                    {/* Subsidiarias */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Subsidiarias</label>
                        <p className="text-xs text-gray-400 mb-2">
                            {subsidiaryIds.length === 0
                                ? 'Sin selección: se pide en las facturas de todas las subsidiarias.'
                                : 'Solo se pide en las facturas de las subsidiarias seleccionadas.'}
                        </p>
                        <div className="max-h-40 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-2">
                            {subsidiaries.length === 0 ? (
                                <p className="text-sm text-gray-400 p-1">No hay subsidiarias configuradas.</p>
                            ) : subsidiaries.map(s => (
                                <label key={s.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer px-2 py-1 rounded hover:bg-gray-50">
                                    <input type="checkbox" checked={subsidiaryIds.includes(s.id)} onChange={() => setSubsidiaryIds(prev => toggleInList(prev, s.id))} className="w-4 h-4 rounded border-gray-300" />
                                    {s.name}{!s.isActive && <span className="text-xs text-gray-400">(inactiva)</span>}
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-100">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-300">
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isEdit ? 'Guardar cambios' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Sección ─────────────────────────────────────────────────────────────────
export default function InvoiceExtraDocsSection() {
    const [docs, setDocs] = useState<ExtraDoc[]>([]);
    const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [modal, setModal] = useState<{ doc: ExtraDoc | null } | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        Promise.all([
            fetch('/api/admin/invoice-documents', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json().then(d => ({ ok: r.ok, d }))),
            fetch('/api/subsidiaries', { headers: { Authorization: `Bearer ${token}` } }).then(r => (r.ok ? r.json() : [])),
        ])
            .then(([docsRes, subs]) => {
                if (!docsRes.ok) throw new Error(docsRes.d.message);
                setDocs(docsRes.d.documents);
                setSubsidiaries(Array.isArray(subs) ? subs : []);
            })
            .catch(() => setError('No se pudieron cargar los documentos adicionales.'))
            .finally(() => setLoading(false));
    }, []);

    const flashSuccess = (message: string) => {
        setSuccess(message);
        setTimeout(() => setSuccess(''), 4000);
    };

    const handleSaved = (saved: ExtraDoc, wasEdit: boolean) => {
        setDocs(prev => {
            const next = wasEdit ? prev.map(d => (d.id === saved.id ? saved : d)) : [...prev, saved];
            return next.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
        });
        setModal(null);
        setError('');
        flashSuccess(wasEdit ? 'Documento actualizado.' : 'Documento agregado.');
    };

    const handleToggleActive = async (doc: ExtraDoc) => {
        setBusyId(doc.id);
        setError('');
        try {
            const res = await fetch(`/api/admin/invoice-documents/${doc.id}`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({ isActive: !doc.isActive }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setDocs(prev => prev.map(d => (d.id === doc.id ? data : d)));
        } catch (e: any) {
            setError(e.message || 'No se pudo actualizar el documento.');
        } finally {
            setBusyId(null);
        }
    };

    const handleDelete = async (doc: ExtraDoc) => {
        setBusyId(doc.id);
        setError('');
        try {
            const res = await fetch(`/api/admin/invoice-documents/${doc.id}`, { method: 'DELETE', headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setDocs(prev => prev.filter(d => d.id !== doc.id));
            flashSuccess('Documento eliminado.');
        } catch (e: any) {
            setError(e.message || 'No se pudo eliminar el documento.');
        } finally {
            setBusyId(null);
            setConfirmDeleteId(null);
        }
    };

    const subsidiaryLabel = (doc: ExtraDoc) => {
        if (doc.subsidiaryIds.length === 0) return 'Todas las subsidiarias';
        const names = doc.subsidiaryIds.map(id => subsidiaries.find(s => s.id === id)?.name).filter(Boolean);
        return names.length > 0 ? names.join(', ') : `${doc.subsidiaryIds.length} subsidiaria(s)`;
    };

    return (
        <div className="bg-white rounded-lg shadow-md p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 pb-4 border-b">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Paperclip className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-800">Documentos adicionales de factura</h3>
                        <p className="text-sm text-gray-500">
                            Además del XML y PDF, el proveedor deberá adjuntar estos documentos al subir una factura. Los cambios de esta sección se guardan al instante.
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setModal({ doc: null })}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 flex-shrink-0"
                >
                    <Plus className="w-4 h-4" /> Agregar documento
                </button>
            </div>

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

            {loading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 text-blue-600 animate-spin" /></div>
            ) : docs.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-500">
                    <p>No hay documentos adicionales configurados.</p>
                    <p className="text-xs text-gray-400 mt-1">Hoy los proveedores solo suben el XML y el PDF de la factura.</p>
                </div>
            ) : (
                <ul className="divide-y divide-gray-100">
                    {docs.map(doc => (
                        <li key={doc.id} className={`py-3 flex items-start justify-between gap-4 ${doc.isActive ? '' : 'opacity-60'}`}>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold text-gray-800">{doc.name}</p>
                                    {doc.isRequired
                                        ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Obligatorio</span>
                                        : <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">Opcional</span>}
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SUPPLIER_TYPE_STYLES[doc.supplierType]}`}>{SUPPLIER_TYPE_LABELS[doc.supplierType]}</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    {describeAllowedTypes(doc.allowedTypes)} · {subsidiaryLabel(doc)}
                                    {doc.attachmentCount > 0 && ` · ${doc.attachmentCount} archivo(s) cargado(s)`}
                                </p>
                            </div>

                            <div className="flex items-center gap-3 flex-shrink-0">
                                {confirmDeleteId === doc.id ? (
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className="text-gray-600">¿Eliminar?</span>
                                        <button onClick={() => handleDelete(doc)} disabled={busyId === doc.id} className="px-2 py-1 bg-red-600 text-white rounded font-semibold hover:bg-red-700 disabled:opacity-50">Sí</button>
                                        <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 border border-gray-300 rounded font-semibold text-gray-600 hover:bg-gray-100">No</button>
                                    </div>
                                ) : (
                                    <>
                                        <span title={doc.isActive ? 'Activo: se pide al subir facturas' : 'Inactivo: no se pide'}>
                                            <Toggle enabled={doc.isActive} onToggle={() => handleToggleActive(doc)} disabled={busyId === doc.id} />
                                        </span>
                                        <button onClick={() => setModal({ doc })} className="text-gray-400 hover:text-blue-600" title="Editar"><Pencil className="w-4 h-4" /></button>
                                        <button onClick={() => setConfirmDeleteId(doc.id)} className="text-gray-400 hover:text-red-600" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                                    </>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {docs.some(d => d.isRequired && d.isActive) && (
                <p className="text-xs text-gray-400">
                    Los documentos adicionales aplican a la carga individual de facturas. La carga masiva (ZIP) solo admite XML y PDF.
                </p>
            )}

            {modal && (
                <ExtraDocModal doc={modal.doc} subsidiaries={subsidiaries} onClose={() => setModal(null)} onSaved={handleSaved} />
            )}
        </div>
    );
}
