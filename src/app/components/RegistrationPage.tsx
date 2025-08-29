// app/components/RegistrationPage.tsx

"use client";

import React, { useState } from 'react';
import { DollarSign, CheckCircle, AlertTriangle, ArrowLeft, Upload } from 'lucide-react';

// --- Componente para un campo de carga de archivo ---
const FileUploadField = ({ label, onFileSelect, selectedFile }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <label htmlFor={label} className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-gray-50 transition-colors">
            <div className="text-center">
                {selectedFile ? <CheckCircle className="mx-auto w-8 h-8 text-green-500" /> : <Upload className="mx-auto w-8 h-8 text-gray-400" />}
                <p className="mt-2 text-sm text-gray-600">
                    {selectedFile ? <span className="font-semibold">{selectedFile.name}</span> : 'Haz clic para adjuntar el PDF'}
                </p>
            </div>
        </label>
        <input id={label} type="file" className="hidden" accept="application/pdf" onChange={onFileSelect} />
    </div>
);

// --- Componente Principal de la Página de Registro ---
const RegistrationPage = ({ onSwitchToLogin }: { onSwitchToLogin: () => void }) => {
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    companyName: '',
    rfc: '',
    taxAddress: '',
  });
  const [files, setFiles] = useState({
    constanciaFiscal: null,
    opinionSat: null,
    identificacionOficial: null,
    comprobanteDomicilio: null,
    actaConstitutiva: null,
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    if (e.target.files && e.target.files[0]) {
        setFiles(prev => ({ ...prev, [fieldName]: e.target.files[0] }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setMessage('');

    const submissionData = new FormData();
    Object.entries(formData).forEach(([key, value]) => submissionData.append(key, value));
    Object.entries(files).forEach(([key, value]) => { if (value) { submissionData.append(key, value); } });

    try {
      const response = await fetch('/api/register', { method: 'POST', body: submissionData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Ocurrió un error.');
      setStatus('success');
      setMessage('¡Registro exitoso! Tu solicitud ha sido enviada y está pendiente de aprobación.');
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message);
    }
  };

  if (status === 'success') {
    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 text-center">
                <CheckCircle className="w-20 h-20 text-green-500 mx-auto" />
                <h2 className="mt-4 text-2xl font-bold text-gray-800">¡Solicitud Enviada!</h2>
                <p className="text-gray-600 mt-2">{message}</p>
                <button onClick={onSwitchToLogin} className="mt-8 w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700">Volver al Inicio de Sesión</button>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-8 m-4">
        <div className="text-center mb-8">
          <DollarSign className="w-12 h-12 text-blue-600 mx-auto" />
          <h2 className="mt-4 text-3xl font-bold text-gray-800">Registro de Proveedor</h2>
          <p className="text-gray-500">Completa tus datos para solicitar acceso.</p>
        </div>
        
        {status === 'error' && (<div className="bg-red-100 text-red-700 p-3 rounded-lg text-center mb-4 flex items-center"><AlertTriangle className="w-5 h-5 mr-2" />{message}</div>)}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input name="companyName" type="text" placeholder="Razón Social" required onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500" />
            <input name="rfc" type="text" placeholder="RFC" required onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500" />
            <input name="taxAddress" type="text" placeholder="Dirección Fiscal" required onChange={handleChange} className="col-span-1 md:col-span-2 w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500" />
            <input name="name" type="text" placeholder="Nombre del Contacto Principal" required onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500" />
            <input name="email" type="email" placeholder="Correo Electrónico del Contacto" required onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500" />
          </div>
          
          <div className="border-t pt-6">
            <h4 className="text-lg font-semibold text-gray-700 mb-4">Documentos Fiscales (Opcional)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FileUploadField label="Constancia de Situación Fiscal" onFileSelect={(e) => handleFileChange(e, 'constanciaFiscal')} selectedFile={files.constanciaFiscal} />
                <FileUploadField label="Opinión de Cumplimiento (SAT)" onFileSelect={(e) => handleFileChange(e, 'opinionSat')} selectedFile={files.opinionSat} />
                <FileUploadField label="Identificación Oficial" onFileSelect={(e) => handleFileChange(e, 'identificacionOficial')} selectedFile={files.identificacionOficial} />
                <FileUploadField label="Comprobante de Domicilio" onFileSelect={(e) => handleFileChange(e, 'comprobanteDomicilio')} selectedFile={files.comprobanteDomicilio} />
                <FileUploadField label="Acta Constitutiva" onFileSelect={(e) => handleFileChange(e, 'actaConstitutiva')} selectedFile={files.actaConstitutiva} />
            </div>
          </div>
          
          <button type="submit" disabled={status === 'submitting'} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-blue-300">{status === 'submitting' ? 'Enviando Solicitud...' : 'Enviar Solicitud'}</button>
        </form>

        <div className="text-center mt-6"><button onClick={onSwitchToLogin} className="text-sm text-blue-600 hover:underline flex items-center justify-center mx-auto"><ArrowLeft className="w-4 h-4 mr-1" />Volver al Inicio de Sesión</button></div>
      </div>
    </div>
  );
};

export default RegistrationPage;
