// app/components/LoginPage.tsx

"use client";

import React, { useState } from 'react';
// CAMBIO: Se importa el ícono de usuario en lugar del de dólar
import { User } from 'lucide-react';

const LoginPage = ({ onLogin, onSwitchToRegister, onPendingApproval }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.errorCode === 'PENDING_APPROVAL') {
                    onPendingApproval(data.supplierProfileId);
                } else {
                    throw new Error(data.message || 'Ocurrió un error.');
                }
            } else {
                onLogin(data);
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
            <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 m-4">
                <div className="text-center mb-8">
                    {/* CAMBIO: Se usa el nuevo ícono */}
                    <User className="w-12 h-12 text-blue-600 mx-auto" />
                    {/* CAMBIO: Se actualizan los textos */}
                    <h2 className="mt-4 text-3xl font-bold text-gray-800">Portal de Proveedores APP</h2>
                    <p className="text-gray-500">Bienvenido a tu portal de proveedor</p>
                </div>
                {error && <p className="bg-red-100 text-red-700 p-3 rounded-lg text-center mb-4">{error}</p>}
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">Correo Electrónico</label>
                        {/* CAMBIO: Se ajusta el borde para que sea más sutil */}
                        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-500" placeholder="usuario@dominio.com" required />
                    </div>
                    <div>
                         <label htmlFor="password" className="block text-sm font-medium text-gray-700">Contraseña</label>
                         {/* CAMBIO: Se ajusta el borde para que sea más sutil */}
                        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-500" placeholder="••••••••" required />
                    </div>
                    <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-400">
                        {isLoading ? 'Iniciando...' : 'Iniciar Sesión'}
                    </button>
                </form>
                <div className="text-center mt-6">
                    <p className="text-sm text-gray-600">
                        ¿No tienes una cuenta?{' '}
                        <button onClick={onSwitchToRegister} className="font-medium text-blue-600 hover:underline">
                            Solicita tu acceso aquí
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
