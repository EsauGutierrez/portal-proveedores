import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle } from 'lucide-react';

interface DocumentSetting {
  documentType: string;
  isRequired: boolean;
  isOcrEnabled: boolean;
}

const documentLabels: Record<string, string> = {
  CONSTANCIA_SITUACION_FISCAL: 'Constancia de Situación Fiscal',
  OPINION_CUMPLIMIENTO_SAT: 'Opinión de Cumplimiento (SAT)',
  IDENTIFICACION_OFICIAL: 'Identificación Oficial del Representante',
  COMPROBANTE_DOMICILIO: 'Comprobante de Domicilio',
  ACTA_CONSTITUTIVA: 'Acta Constitutiva',
};

const DocumentSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<DocumentSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/settings/documents', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al obtener la configuración');
      const data = await res.json();
      setSettings(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = (type: string, field: 'isRequired' | 'isOcrEnabled') => {
    setSettings(prev => prev.map(s => 
      s.documentType === type ? { ...s, [field]: !s[field] } : s
    ));
    setSuccess(null);
  };

  const handleSave = async () => {
    try {
      setError(null);
      setSuccess(null);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/settings/documents', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ documents: settings })
      });

      if (!res.ok) throw new Error('Error al guardar la configuración');
      setSuccess('Configuración guardada exitosamente.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (isLoading) return <div className="p-8">Cargando configuración...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Configuración de Expediente de Proveedores</h2>
        <p className="text-gray-600 mb-6">
          Define qué documentos son obligatorios para aprobar a un proveedor y si deseas aplicar la validación inteligente (OCR) sobre ellos.
        </p>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md flex items-center">
            <CheckCircle className="w-5 h-5 mr-2" />
            {success}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-12 gap-4 pb-2 border-b border-gray-200 font-semibold text-sm text-gray-500 uppercase">
            <div className="col-span-6">Tipo de Documento</div>
            <div className="col-span-3 text-center">Obligatorio</div>
            <div className="col-span-3 text-center">Validación OCR</div>
          </div>

          {settings.map((setting) => (
            <div key={setting.documentType} className="grid grid-cols-12 gap-4 items-center py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <div className="col-span-6 font-medium text-gray-700">
                {documentLabels[setting.documentType] || setting.documentType}
              </div>
              <div className="col-span-3 flex justify-center">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={setting.isRequired}
                    onChange={() => handleToggle(setting.documentType, 'isRequired')}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <div className="col-span-3 flex justify-center">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={setting.isOcrEnabled}
                    onChange={() => handleToggle(setting.documentType, 'isOcrEnabled')}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSave}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium shadow-sm"
          >
            <Save className="w-4 h-4 mr-2" />
            Guardar Configuración
          </button>
        </div>
      </div>
    </div>
  );
};

export default DocumentSettingsPage;
