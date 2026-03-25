// app/components/ChangePasswordPage.tsx
"use client";

import React, { useState } from 'react';
import { Lock, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

const ChangePasswordPage = ({ user, onPasswordChanged }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password.length < 8) {
            setError('La contraseña debe tener al menos 8 caracteres.');
            return;
        }

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            return;
        }

        setIsLoading(true);

        try {
            // Reutilizamos el endpoint de set-password que ya existe y usa JWT
            // Pero como ya estamos logueados, podríamos crear uno más simple o usar el token actual
            // Para simplicidad y reuso de la lógica de 'firstLogin: false', generaremos un token temporal aquí
            // o mejor, creamos un endpoint dedicado /api/profile/change-password
            
            const token = localStorage.getItem('token');
            const response = await fetch('/api/profile/change-password', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Error al cambiar la contraseña.');
            }

            setIsSuccess(true);
            setTimeout(() => {
                onPasswordChanged();
            }, 2000);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
                    <h2 className="mt-4 text-2xl font-bold text-gray-800">¡Contraseña Actualizada!</h2>
                    <p className="text-gray-600 mt-2">Tu contraseña ha sido cambiada correctamente. Redirigiendo...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
                <div className="text-center mb-8">
                    <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                        <Lock className="w-8 h-8 text-blue-600" />
                    </div>
                    <h2 className="mt-4 text-2xl font-bold text-gray-800">Primer Inicio de Sesión</h2>
                    <p className="text-gray-600 mt-2 text-sm">
                        Por seguridad, debes cambiar tu contraseña temporal por una nueva antes de continuar.
                    </p>
                </div>

                {error && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 flex items-start">
                        <AlertCircle className="w-5 h-5 text-red-500 mr-2 shrink-0" />
                        <p className="text-sm text-red-700">{error}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Contraseña</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                            placeholder="Mínimo 8 caracteres"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Contraseña</label>
                        <input
                            type="password"
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                            placeholder="Repite tu contraseña"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 flex items-center justify-center"
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                        Actualizar Contraseña
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChangePasswordPage;
