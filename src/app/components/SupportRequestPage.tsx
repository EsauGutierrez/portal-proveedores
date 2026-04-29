"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, Send, HelpCircle, CheckCircle } from 'lucide-react';

const TYPE_OPTIONS = [
  { value: 'OC',      label: 'Orden de Compra' },
  { value: 'FACTURA', label: 'Factura' },
  { value: 'OTRO',    label: 'Otro' },
];

export default function SupportRequestPage() {
  const [type, setType]               = useState('');
  const [documentFolio, setDocumentFolio] = useState('');
  const [subject, setSubject]         = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading]         = useState(false);
  const [success, setSuccess]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const [documents, setDocuments]     = useState<{ folio: string; id: string }[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  useEffect(() => {
    if (type !== 'OC' && type !== 'FACTURA') {
      setDocuments([]);
      setDocumentFolio('');
      return;
    }

    const fetchDocuments = async () => {
      setLoadingDocs(true);
      setDocumentFolio('');
      try {
        const token = localStorage.getItem('token');
        const endpoint = type === 'OC' ? '/api/purchase-orders' : '/api/invoices';
        const res = await fetch(endpoint, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const result = await res.json();
        const items = Array.isArray(result) ? result : (result.data ?? []);
        setDocuments(items.map((d: any) => ({ id: d.id, folio: d.folio })));
      } catch {
        setDocuments([]);
      } finally {
        setLoadingDocs(false);
      }
    };

    fetchDocuments();
  }, [type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/support-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ type, documentFolio, subject, description }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error al enviar');

      setSuccess(true);
      setType('');
      setDocumentFolio('');
      setSubject('');
      setDescription('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <HelpCircle className="w-7 h-7 text-blue-600" />
          Solicitar Ayuda
        </h2>
        <p className="text-gray-500 mt-1 text-sm">
          ¿Tienes algún problema con una orden de compra o factura? Envíanos tu mensaje y nos pondremos en contacto contigo.
        </p>
      </div>

      {success && (
        <div className="mb-6 flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-green-800">¡Solicitud enviada!</p>
            <p className="text-sm text-green-700">Tu mensaje fue recibido. El equipo de soporte se comunicará contigo pronto.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Tipo de solicitud */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de solicitud <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Selecciona un tipo...</option>
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Selector de documento (OC o Factura) */}
          {(type === 'OC' || type === 'FACTURA') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {type === 'OC' ? 'Orden de Compra relacionada' : 'Factura relacionada'}
                <span className="ml-1 text-gray-400 font-normal">(opcional)</span>
              </label>
              {loadingDocs ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando documentos...
                </div>
              ) : (
                <select
                  value={documentFolio}
                  onChange={(e) => setDocumentFolio(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">Sin documento específico</option>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.folio}>Folio: {doc.folio}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Asunto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Asunto <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ej: No puedo subir mi factura"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe con detalle el problema o duda que tienes..."
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
              ) : (
                <><Send className="w-4 h-4" /> Enviar solicitud</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
