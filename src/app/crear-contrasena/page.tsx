"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2, KeyRound } from 'lucide-react';

function SetPasswordForm() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!token) {
            setError('El enlace no es válido. Por favor, solicita uno nuevo a tu administrador.');
        }
    }, [token]);

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
            const res = await fetch('/api/set-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Error al establecer la contraseña.');
            }

            setSuccess(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
                {/* Logo */}
                <div className="flex justify-center mb-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo-imr.png" alt="IMR Software" className="h-12 w-auto object-contain" />
                </div>

                {success ? (
                    <div className="text-center">
                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Contraseña establecida!</h2>
                        <p className="text-gray-500 mb-6">Tu cuenta está lista. Ya puedes iniciar sesión en el portal.</p>
                        <a
                            href="/"
                            className="inline-block w-full text-center bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Ir al Portal
                        </a>
                    </div>
                ) : (
                    <>
                        <div className="text-center mb-6">
                            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <KeyRound className="w-6 h-6 text-blue-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800">Establece tu contraseña</h2>
                            <p className="text-gray-500 text-sm mt-1">Crea una contraseña segura para acceder al portal</p>
                        </div>

                        {error && (
                            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4">
                                <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                <p className="text-sm">{error}</p>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Nueva contraseña
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                                    placeholder="Mínimo 8 caracteres"
                                    required
                                    disabled={!token}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Confirmar contraseña
                                </label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                                    placeholder="Repite tu contraseña"
                                    required
                                    disabled={!token}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isLoading || !token}
                                className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300 flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <><Loader2 className="w-5 h-5 animate-spin" /> Guardando...</>
                                ) : (
                                    'Establecer contraseña'
                                )}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}

export default function SetPasswordPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        }>
            <SetPasswordForm />
        </Suspense>
    );
}
