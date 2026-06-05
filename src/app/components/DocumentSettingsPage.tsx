'use client';

import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle, Plus, Pencil, FileText, Trash2 } from 'lucide-react';
import AddDocumentModal, { DocumentRequirement, EditDocumentData, SupplierType } from './AddDocumentModal';

const SUPPLIER_TYPE_CONFIG: Record<SupplierType, { label: string; className: string }> = {
  NATIONAL: { label: 'Nacional',    className: 'bg-blue-50 text-blue-700 border border-blue-200' },
  FOREIGN:  { label: 'Extranjero',  className: 'bg-orange-50 text-orange-700 border border-orange-200' },
  BOTH:     { label: 'Ambos',       className: 'bg-purple-50 text-purple-700 border border-purple-200' },
};

const DocumentSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<DocumentRequirement[]>([]);
  const [savedSettings, setSavedSettings] = useState<DocumentRequirement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editData, setEditData] = useState<EditDocumentData | undefined>(undefined);

  // Detecta si hay cambios de toggles pendientes de guardar
  const hasPendingChanges = settings.some(s => {
    const saved = savedSettings.find(ss => ss.id === s.id);
    return saved && (saved.isRequired !== s.isRequired || saved.isOcrEnabled !== s.isOcrEnabled);
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/settings/documents', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Error al obtener la configuración');
      const data: DocumentRequirement[] = await res.json();
      setSettings(data);
      setSavedSettings(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = (documentType: string, field: 'isRequired' | 'isOcrEnabled') => {
    setSettings(prev =>
      prev.map(s => (s.documentType === documentType ? { ...s, [field]: !s[field] } : s))
    );
    setSuccess(null);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/settings/documents', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documents: settings.map(s => ({
            documentType: s.documentType,
            isRequired:   s.isRequired,
            isOcrEnabled: s.isOcrEnabled,
            supplierType: s.supplierType,
          })),
        }),
      });

      if (!res.ok) throw new Error('Error al guardar la configuración');
      const updated: DocumentRequirement[] = await res.json();
      setSettings(updated);
      setSavedSettings(updated);
      setSuccess('Configuración guardada exitosamente.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (doc: DocumentRequirement) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/settings/documents/${doc.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.message ?? 'Error al eliminar el documento');
        return;
      }
      setSettings(prev => prev.filter(s => s.id !== doc.id));
      setSavedSettings(prev => prev.filter(s => s.id !== doc.id));
      setSuccess('Documento eliminado correctamente.');
      setTimeout(() => setSuccess(null), 4000);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    }
  };

  const handleOpenAdd = () => {
    setEditData(undefined);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (doc: DocumentRequirement) => {
    setEditData({ id: doc.id, name: doc.name, isRequired: doc.isRequired, supplierType: doc.supplierType });
    setIsModalOpen(true);
  };

  const handleModalSuccess = (doc: DocumentRequirement) => {
    const isEdit = settings.some(s => s.id === doc.id);
    if (isEdit) {
      setSettings(prev => prev.map(s => s.id === doc.id ? doc : s));
      setSuccess('Documento actualizado correctamente.');
    } else {
      setSettings(prev => [...prev, doc]);
      setSuccess('Documento agregado correctamente.');
    }
    setIsModalOpen(false);
    setTimeout(() => setSuccess(null), 4000);
  };

  if (isLoading) {
    return (
      <div className="p-8 text-gray-500">Cargando configuración…</div>
    );
  }

  const systemDocs = settings.filter(s => s.isSystem);
  const customDocs  = settings.filter(s => !s.isSystem);

  return (
    <>
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">
                Configuración de Expediente de Proveedores
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                Define qué documentos son obligatorios para aprobar a un proveedor.
                Los documentos del sistema pueden activar validación OCR.
              </p>
            </div>
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap ml-4"
            >
              <Plus className="w-4 h-4" />
              Agregar documento
            </button>
          </div>

          {/* Notificaciones */}
          {error && (
            <div className="mt-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-md">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-md">
              <CheckCircle className="w-4 h-4 shrink-0" />
              {success}
            </div>
          )}

          {/* Tabla — cabecera */}
          <div className="mt-6 grid grid-cols-12 gap-4 pb-2 border-b border-gray-200 font-semibold text-xs text-gray-500 uppercase tracking-wide">
            <div className="col-span-4">Tipo de Documento</div>
            <div className="col-span-2 text-center">Tipo Proveedor</div>
            <div className="col-span-2 text-center">Obligatorio</div>
            <div className="col-span-2 text-center">Validación OCR</div>
            <div className="col-span-2" />
          </div>

          {/* Documentos del sistema */}
          {systemDocs.map(doc => (
            <DocumentRow
              key={doc.documentType}
              doc={doc}
              onToggle={handleToggle}
            />
          ))}

          {/* Separador y documentos personalizados */}
          <div className="mt-4 mb-1 flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Documentos personalizados
            </span>
            <div className="flex-1 border-t border-gray-100" />
          </div>

          {customDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="w-8 h-8 text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No hay documentos personalizados.</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Usa <span className="font-medium">"Agregar documento"</span> para crear uno.
              </p>
            </div>
          ) : (
            customDocs.map(doc => (
              <DocumentRow
                key={doc.documentType}
                doc={doc}
                onToggle={handleToggle}
                onEdit={handleOpenEdit}
                onDelete={handleDelete}
              />
            ))
          )}

          {/* Botón guardar */}
          <div className="mt-8 flex items-center justify-end gap-3">
            {hasPendingChanges && !isSaving && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Cambios sin guardar
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving || !hasPendingChanges}
              title={!hasPendingChanges ? 'No hay cambios pendientes' : undefined}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Guardando…' : 'Guardar Configuración'}
            </button>
          </div>
        </div>
      </div>

      <AddDocumentModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditData(undefined); }}
        onSuccess={handleModalSuccess}
        editData={editData}
      />
    </>
  );
};

// ─── Fila de la tabla ────────────────────────────────────────────────────────

interface DocumentRowProps {
  doc: DocumentRequirement;
  onToggle: (documentType: string, field: 'isRequired' | 'isOcrEnabled') => void;
  onEdit?: (doc: DocumentRequirement) => void;
  onDelete?: (doc: DocumentRequirement) => void;
}

const DocumentRow: React.FC<DocumentRowProps> = ({ doc, onToggle, onEdit, onDelete }) => {
  const [confirming, setConfirming] = useState(false);
  const badge = SUPPLIER_TYPE_CONFIG[doc.supplierType];

  return (
    <div className="grid grid-cols-12 gap-4 items-center py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
      {/* Nombre */}
      <div className="col-span-4 font-medium text-gray-700 text-sm">
        {doc.name}
      </div>

      {/* Tipo de proveedor */}
      <div className="col-span-2 flex justify-center">
        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {/* Toggle Obligatorio */}
      <div className="col-span-2 flex justify-center">
        <Toggle
          checked={doc.isRequired}
          color="blue"
          onChange={() => onToggle(doc.documentType, 'isRequired')}
          ariaLabel={`Obligatorio: ${doc.name}`}
        />
      </div>

      {/* Toggle OCR — solo documentos del sistema */}
      <div className="col-span-2 flex justify-center">
        {doc.isSystem ? (
          <Toggle
            checked={doc.isOcrEnabled}
            color="indigo"
            onChange={() => onToggle(doc.documentType, 'isOcrEnabled')}
            ariaLabel={`Validación OCR: ${doc.name}`}
          />
        ) : (
          <span
            className="text-gray-300 text-sm select-none cursor-default"
            title="La validación OCR solo está disponible para documentos del sistema"
          >
            —
          </span>
        )}
      </div>

      {/* Acciones — editar y eliminar solo en documentos personalizados */}
      <div className="col-span-2 flex items-center justify-end gap-1 pr-1">
        {onEdit && onDelete && (
          confirming ? (
            /* Confirmación inline */
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 whitespace-nowrap">¿Eliminar?</span>
              <button
                type="button"
                onClick={() => { onDelete(doc); setConfirming(false); }}
                className="px-2 py-0.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded transition-colors"
              >
                Sí
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-2 py-0.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
              >
                No
              </button>
            </div>
          ) : (
            /* Botones normales */
            <>
              <button
                type="button"
                onClick={() => onEdit(doc)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200 rounded-md transition-colors"
                title="Editar documento"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Editar</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-md transition-colors"
                title="Eliminar documento"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )
        )}
      </div>
    </div>
  );
};

// ─── Toggle reutilizable ─────────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean;
  color: 'blue' | 'indigo';
  onChange: () => void;
  ariaLabel: string;
}

const Toggle: React.FC<ToggleProps> = ({ checked, color, onChange, ariaLabel }) => {
  const activeColor = color === 'blue' ? 'peer-checked:bg-blue-600' : 'peer-checked:bg-indigo-600';
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        onChange={onChange}
        aria-label={ariaLabel}
      />
      <div
        className={`w-11 h-6 bg-gray-200 rounded-full peer
          peer-focus:ring-2 peer-focus:ring-offset-1 peer-focus:ring-blue-300
          peer-checked:after:translate-x-full peer-checked:after:border-white
          after:content-[''] after:absolute after:top-[2px] after:left-[2px]
          after:bg-white after:border-gray-300 after:border after:rounded-full
          after:h-5 after:w-5 after:transition-all ${activeColor}`}
      />
    </label>
  );
};

export default DocumentSettingsPage;
