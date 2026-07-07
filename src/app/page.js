// app/page.tsx

"use client";

import React, { useState, useEffect } from 'react';
import LoginPage from './components/LoginPage';
import DashboardPage from './components/DashboardPage';
import RegistrationPage from './components/RegistrationPage';
import CompleteProfilePage from './components/CompleteProfilePage';
import ChangePasswordPage from './components/ChangePasswordPage';
import SupplierDocUploadPage from './components/SupplierDocUploadPage';
import ForgotPasswordPage from './components/ForgotPasswordPage';

export default function HomePage() {
    const [currentUser, setCurrentUser] = useState(null);
    // CORRECCIÓN: Se elimina la sintaxis de tipo de TypeScript
    const [authView, setAuthView] = useState('login');
    const [pendingSupplierId, setPendingSupplierId] = useState(null);

    useEffect(() => {
        const loggedInUser = localStorage.getItem('user');
        if (loggedInUser) {
            setCurrentUser(JSON.parse(loggedInUser));
        }

        const requestedView = new URLSearchParams(window.location.search).get('view');
        if (requestedView === 'forgotPassword') {
            setAuthView('forgotPassword');
        }
    }, []);

    const handleLogin = (data) => {
        localStorage.setItem('token', data.token);

        // Primer login de proveedor: onboarding (NO guardar en localStorage ni setCurrentUser todavía)
        if (data.user.role === 'SUPPLIER' && data.user.firstLogin) {
            // Si requiere documentación, mostrar pantalla de carga de docs primero
            if (data.user.supplierProfile?.requireDocuments) {
                setAuthView('uploadDocuments');
            } else {
                setAuthView('changePassword');
            }
            return;
        }

        // Login normal → aplanar supplierStatus y subscriptionWarning para que DashboardPage lo lea directo
        const userToStore = {
            ...data.user,
            supplierStatus: data.user.supplierProfile?.status ?? null,
            subscriptionWarning: data.user.subscriptionWarning ?? false,
        };
        localStorage.setItem('user', JSON.stringify(userToStore));
        setCurrentUser(userToStore);
    };

    const handleDocumentsUploaded = () => {
        // Después de subir docs, ir a cambiar contraseña
        setAuthView('changePassword');
    };

    const handlePasswordChanged = () => {
        // Forzar re-login: limpiar estado y volver al login
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        setCurrentUser(null);
        setAuthView('login');
    };

    const handleLogout = () => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        setCurrentUser(null);
        setAuthView('login');
    };

    // CORRECCIÓN: Se elimina la sintaxis de tipo de TypeScript del parámetro
    const handlePendingApproval = (supplierId) => {
        setPendingSupplierId(supplierId);
        setAuthView('completeProfile');
    };

    if (currentUser) {
        return <DashboardPage user={currentUser} onLogout={handleLogout} />;
    }

    switch (authView) {
        case 'register':
            return <RegistrationPage onSwitchToLogin={() => setAuthView('login')} />;
        case 'completeProfile':
            return <CompleteProfilePage supplierProfileId={pendingSupplierId} onBackToLogin={() => setAuthView('login')} />;
        case 'uploadDocuments':
            return <SupplierDocUploadPage user={currentUser} onDocumentsUploaded={handleDocumentsUploaded} />;
        case 'changePassword':
            return <ChangePasswordPage user={currentUser} onPasswordChanged={handlePasswordChanged} />;
        case 'forgotPassword':
            return <ForgotPasswordPage onBack={() => setAuthView('login')} />;
        case 'login':
        default:
            return <LoginPage
                        onLogin={handleLogin}
                        onSwitchToRegister={() => setAuthView('register')}
                        onPendingApproval={handlePendingApproval}
                        onForgotPassword={() => setAuthView('forgotPassword')}
                    />;
    }
}
