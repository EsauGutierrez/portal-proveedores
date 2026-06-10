"use client";

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, UserPlus, X, Search, ChevronDown, ChevronRight, Loader2, Pencil } from 'lucide-react';

const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('token') : null;

const authHeaders = () => ({ 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

// --- Modal: Crear Cargador ---
const CreateOperatorModal = ({ isOpen, onClose, onCreated }) => {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.password) { setError('Todos los campos son requeridos.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/operators', { method: 'POST', headers: authHeaders(), body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { setError(data.message); return; }
      onCreated(data);
      setForm({ name: '', email: '', password: '' });
      onClose();
    } catch { setError('Error de conexión.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-800">Nuevo Cargador</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="space-y-4">
          {['name', 'email', 'password'].map(field => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                {field === 'name' ? 'Nombre' : field === 'email' ? 'Email' : 'Contraseña temporal'}
              </label>
              <input
                type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}
                value={form[field]}
                onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />} Crear
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Modal: Editar Cargador ---
const EditOperatorModal = ({ isOpen, onClose, operator, onUpdated }) => {
  const [form, setForm] = useState({ name: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (operator) setForm({ name: operator.name || '', email: operator.email || '' });
  }, [operator]);

  if (!isOpen || !operator) return null;

  const handleSubmit = async () => {
    if (!form.name || !form.email) { setError('Nombre y email son requeridos.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/operators/${operator.id}`, {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message); return; }
      onUpdated(data);
      onClose();
    } catch { setError('Error de conexión.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-800">Editar Cargador</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              type="text" value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email" value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Modal: Asignar Proveedor ---
const AssignSupplierModal = ({ isOpen, onClose, operator, onAssigned }) => {
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignError, setAssignError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch('/api/suppliers', { headers: { 'Authorization': `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(data => setSuppliers(Array.isArray(data) ? data : (data.data ?? data.suppliers ?? [])))
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen || !operator) return null;

  const assignedIds = new Set(operator.operatorAssignments?.map((a: any) => a.supplierProfile.id) ?? []);
  const filtered = suppliers.filter((s: any) =>
    !assignedIds.has(s.id) &&
    (s.companyName?.toLowerCase().includes(search.toLowerCase()) || s.rfc?.toLowerCase().includes(search.toLowerCase()))
  );

  const handleAssign = async (supplierProfileId: string) => {
    setAssigning(supplierProfileId);
    setAssignError('');
    try {
      const res = await fetch(`/api/operators/${operator.id}/assignments`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ supplierProfileId }),
      });
      const data = await res.json();
      if (res.ok) {
        onAssigned(operator.id, data);
      } else {
        setAssignError(data.message || 'Error al asignar el proveedor.');
      }
    } catch {
      setAssignError('Error de conexión. Intenta de nuevo.');
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-800">Asignar proveedor a <span className="text-blue-600">{operator.name}</span></h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o RFC..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">No hay proveedores disponibles.</p>
          ) : filtered.map((s: any) => (
            <div key={s.id} className="flex items-center justify-between py-2.5 px-1">
              <div>
                <p className="text-sm font-medium text-gray-800">{s.companyName}</p>
                <p className="text-xs text-gray-500">{s.rfc}</p>
              </div>
              <button
                onClick={() => handleAssign(s.id)}
                disabled={assigning === s.id}
                className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
              >
                {assigning === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />} Asignar
              </button>
            </div>
          ))}
        </div>
        {assignError && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{assignError}</p>
        )}
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200">Cerrar</button>
        </div>
      </div>
    </div>
  );
};

// --- Componente Principal ---
const OperatorsPage = () => {
  const [operators, setOperators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<any | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);

  const fetchOperators = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/operators', { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      setOperators(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchOperators(); }, []);

  const handleCreated = (op: any) => setOperators(prev => [{ ...op, operatorAssignments: [] }, ...prev]);

  const handleUpdated = (updated: any) => setOperators(prev =>
    prev.map(op => op.id === updated.id ? { ...op, name: updated.name, email: updated.email } : op)
  );

  const handleAssigned = (operatorId: string, assignment: any) => {
    setOperators(prev => prev.map(op =>
      op.id === operatorId
        ? { ...op, operatorAssignments: [...(op.operatorAssignments ?? []), assignment] }
        : op
    ));
    // Refrescar el modal con datos actualizados
    setAssignTarget((prev: any) => prev?.id === operatorId
      ? { ...prev, operatorAssignments: [...(prev.operatorAssignments ?? []), assignment] }
      : prev
    );
  };

  const handleRemoveAssignment = async (operatorId: string, supplierProfileId: string) => {
    await fetch(`/api/operators/${operatorId}/assignments`, {
      method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ supplierProfileId }),
    });
    setOperators(prev => prev.map(op =>
      op.id === operatorId
        ? { ...op, operatorAssignments: op.operatorAssignments.filter((a: any) => a.supplierProfile.id !== supplierProfileId) }
        : op
    ));
  };

  const handleDelete = async (operatorId: string) => {
    if (!confirm('¿Eliminar este cargador y todas sus asignaciones?')) return;
    await fetch(`/api/operators/${operatorId}`, { method: 'DELETE', headers: authHeaders() });
    setOperators(prev => prev.filter(op => op.id !== operatorId));
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Cargadores de Facturas</h2>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Nuevo Cargador
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      ) : operators.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">No hay cargadores registrados.</p>
          <p className="text-sm mt-1">Crea uno para que pueda cargar facturas en nombre de proveedores.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {operators.map(op => {
            const isExpanded = expandedId === op.id;
            return (
              <div key={op.id} className="py-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : op.id)}
                    className="flex items-center gap-3 text-left flex-1"
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{op.name}</p>
                      <p className="text-xs text-gray-500">{op.email}</p>
                    </div>
                    <span className="ml-3 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                      {op.operatorAssignments?.length ?? 0} proveedores
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAssignTarget(op)}
                      className="px-3 py-1.5 border border-blue-300 text-blue-600 text-xs font-semibold rounded-lg hover:bg-blue-50 flex items-center gap-1"
                    >
                      <UserPlus className="w-3 h-3" /> Asignar proveedor
                    </button>
                    <button
                      onClick={() => setEditTarget(op)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar cargador"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(op.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar cargador"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 ml-7 bg-gray-50 rounded-lg p-4">
                    {op.operatorAssignments?.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-2">Sin proveedores asignados.</p>
                    ) : (
                      <div className="space-y-2">
                        {op.operatorAssignments.map((a: any) => (
                          <div key={a.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-gray-100">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{a.supplierProfile.companyName}</p>
                              <p className="text-xs text-gray-500">{a.supplierProfile.rfc}</p>
                            </div>
                            <button
                              onClick={() => handleRemoveAssignment(op.id, a.supplierProfile.id)}
                              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CreateOperatorModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onCreated={handleCreated} />
      <EditOperatorModal isOpen={!!editTarget} onClose={() => setEditTarget(null)} operator={editTarget} onUpdated={handleUpdated} />
      <AssignSupplierModal
        isOpen={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        operator={assignTarget}
        onAssigned={handleAssigned}
      />
    </div>
  );
};

export default OperatorsPage;
