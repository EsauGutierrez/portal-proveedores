// app/components/ForgotPasswordPage.tsx

"use client";

import React, { useState } from 'react';
import { Mail, CheckCircle, XCircle, Loader2, ArrowLeft } from 'lucide-react';

const ForgotPasswordPage = ({ onBack }: { onBack: () => void }) => {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Error al procesar la solicitud.');
            }

            setSent(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
            <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 m-4">
                <div className="flex justify-center mb-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo-imr.png" alt="IMR Software" className="h-12 w-auto object-contain" />
                </div>

                {sent ? (
                    <div className="text-center">
                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">Revisa tu correo</h2>
                        <p className="text-gray-500 mb-2">
                            Si el correo <span className="font-semibold text-gray-700">{email}</span> está registrado, recibirás un enlace para restablecer tu contraseña.
                        </p>
                        <p className="text-sm text-gray-400 mb-6">El enlace expira en 1 hora.</p>
                        <button
                            onClick={onBack}
                            className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Volver al inicio de sesión
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="text-center mb-6">
                            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Mail className="w-6 h-6 text-blue-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800">¿Olvidaste tu contraseña?</h2>
                            <p className="text-gray-500 text-sm mt-1">
                                Ingresa tu correo y te enviaremos un enlace para recuperar el acceso.
                            </p>
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
                                    Correo electrónico
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-500"
                                    placeholder="usuario@dominio.com"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300 flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <><Loader2 className="w-5 h-5 animate-spin" /> Enviando...</>
                                ) : (
                                    'Enviar enlace de recuperación'
                                )}
                            </button>
                        </form>

                        <div className="text-center mt-6">
                            <button
                                onClick={onBack}
                                className="text-sm text-blue-600 hover:underline flex items-center justify-center mx-auto gap-1"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Volver al inicio de sesión
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ForgotPasswordPage;
