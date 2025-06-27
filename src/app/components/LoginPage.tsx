"use client";

import React, { useState } from 'react';
import { DollarSign } from 'lucide-react';

const LoginPage = ({ onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        if (email === 'usuario@dominio.com' && password === 'password') {
            onLogin();
        } else {
            setError('Credenciales incorrectas. Intenta de nuevo.');
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
            <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 m-4">
                <div className="text-center mb-8">
                    <DollarSign className="w-12 h-12 text-blue-600 mx-auto" />
                    <h2 className="mt-4 text-3xl font-bold text-gray-800">Portal de proveedores</h2>
                    <p className="text-gray-500">Inicia sesión en tu portal de proveedor.</p>
                </div>
                {error && <p className="bg-red-100 text-red-700 p-3 rounded-lg text-center mb-4">{error}</p>}
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                            Correo Electrónico
                        </label>
                        <input
                            id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600 focus:border-blue-500 placeholder-gray-300"
                            placeholder="usuario@dominio.com"
                        />
                    </div>
                    <div>
                         <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                            Contraseña
                        </label>
                        <input
                            id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600 focus:border-blue-500 placeholder-gray-300"
                            placeholder="••••••••"
                        />
                    </div>
                     <div className="text-center text-xs text-gray-400 ">
                        <p>Usa <strong>usuario@dominio.com</strong> y <strong>password</strong> para ingresar.</p>
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-300"
                    >
                        Iniciar Sesión
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LoginPage;
