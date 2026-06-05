'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';

export type SupplierType = 'NATIONAL' | 'FOREIGN' | 'BOTH';

export interface DocumentRequirement {
  id: string;
  documentType: string;
  name: string;
  isRequired: boolean;
  isOcrEnabled: boolean;
  isActive: boolean;
  isSystem: boolean;
  supplierType: SupplierType;
  tenantId: string;
}

interface FormErrors {
  name?: string;
  supplierType?: string;
  general?: string;
}

export interface EditDocumentData {
  id: string;
  name: string;
  isRequired: boolean;
  supplierType: SupplierType;
}

interface AddDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (document: DocumentRequirement) => void;
  /** Si se pasa, el modal opera en modo edición */
  editData?: EditDocumentData;
}

const SUPPLIER_TYPE_OPTIONS: { value: SupplierType; label: string }[] = [
  { value: 'NATIONAL', label: 'Nacional' },
  { value: 'FOREIGN',  label: 'Extranjero' },
  { value: 'BOTH',     label: 'Ambos' },
];

const AddDocumentModal: React.FC<AddDocumentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editData,
}) => {
  const isEditMode = !!editData;

  const [name, setName] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [supplierType, setSupplierType] = useState<SupplierType | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Inicializar campos al abrir — en edición con datos existentes, en creación vacíos
  useEffect(() => {
    if (isOpen) {
      setErrors({});
      if (isEditMode && editData) {
        setName(editData.name);
        setIsRequired(editData.isRequired);
        setSupplierType(editData.supplierType);
      } else {
        setName('');
        setIsRequired(false);
        setSupplierType('');
      }
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [isOpen, isEditMode, editData]);

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const validate = (): boolean => {
    const next: FormErrors = {};

    if (!name.trim()) {
      next.name = 'El nombre del documento es obligatorio';
    } else if (name.trim().length < 3) {
      next.name = 'El nombre debe tener al menos 3 caracteres';
    } else if (name.trim().length > 100) {
      next.name = 'El nombre no puede exceder 100 caracteres';
    }

    if (!supplierType) {
      next.supplierType = 'Debes seleccionar al menos un tipo de proveedor';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleErrorResponse = (status: number, message: string) => {
    if (status === 409) {
      setErrors({ name: message });
    } else if (status === 422) {
      if (message.toLowerCase().includes('nombre')) {
        setErrors({ name: message });
      } else if (message.toLowerCase().includes('tipo')) {
        setErrors({ supplierType: message });
      } else {
        setErrors({ general: message });
      }
    } else {
      setErrors({ general: message || 'Error al guardar el documento' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      const token = localStorage.getItem('token');

      const url = isEditMode
        ? `/api/settings/documents/${editData!.id}`
        : '/api/settings/documents';

      const response = await fetch(url, {
        method: isEditMode ? 'PATCH' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name.trim(), isRequired, supplierType }),
      });

      const data = await response.json();

      if (!response.ok) {
        handleErrorResponse(response.status, data.message);
        return;
      }

      onSuccess(data as DocumentRequirement);
    } catch {
      setErrors({ general: 'Error de conexión. Intenta de nuevo.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="relative w-full max-w-md mx-4 bg-white rounded-xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 id="modal-title" className="text-lg font-semibold text-gray-800">
            {isEditMode ? 'Editar documento' : 'Agregar documento'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="px-6 py-5 space-y-5">

            {errors.general && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-md">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {errors.general}
              </div>
            )}

            {/* Nombre */}
            <div className="space-y-1">
              <label htmlFor="doc-name" className="block text-sm font-medium text-gray-700">
                Nombre del documento <span className="text-red-500">*</span>
              </label>
              <input
                ref={nameInputRef}
                id="doc-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors(prev => ({ ...prev, name: undefined }));
                }}
                placeholder="Ej. Poder notarial"
                maxLength={100}
                disabled={isSubmitting}
<<<<<<< HEAD
                className={`w-full px-3 py-2 text-sm text-gray-900 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 transition-colors ${
=======
                className={`w-full px-3 py-2 text-sm border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 transition-colors ${
>>>>>>> 3707048 (feat: agregar gestión de documentos por tipo de proveedor)
                  errors.name ? 'border-red-400 bg-red-50' : 'border-gray-300'
                }`}
              />
              {errors.name && (
                <p className="flex items-center gap-1 text-xs text-red-600 mt-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {errors.name}
                </p>
              )}
              <p className="text-xs text-gray-400 text-right">{name.length}/100</p>
            </div>

            {/* Obligatorio */}
            <div className="flex items-center gap-3">
              <input
                id="doc-required"
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
                disabled={isSubmitting}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="doc-required" className="text-sm font-medium text-gray-700 cursor-pointer select-none">
                Obligatorio
              </label>
            </div>

            {/* Tipo de proveedor */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">
                Tipo de proveedor <span className="text-red-500">*</span>
              </p>
              <div className="flex gap-3">
                {SUPPLIER_TYPE_OPTIONS.map(({ value, label }) => (
                  <label
                    key={value}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 border rounded-md text-sm cursor-pointer transition-colors select-none ${
                      isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                    } ${
                      supplierType === value
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-gray-200 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="supplierType"
                      value={value}
                      checked={supplierType === value}
                      onChange={() => {
                        setSupplierType(value);
                        if (errors.supplierType) setErrors(prev => ({ ...prev, supplierType: undefined }));
                      }}
                      disabled={isSubmitting}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {errors.supplierType && (
                <p className="flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {errors.supplierType}
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting
                ? 'Guardando…'
                : isEditMode ? 'Guardar cambios' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddDocumentModal;
