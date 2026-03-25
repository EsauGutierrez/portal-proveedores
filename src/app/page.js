// app/page.tsx

"use client";

import React, { useState, useEffect } from 'react';
import LoginPage from './components/LoginPage';
import DashboardPage from './components/DashboardPage';
import RegistrationPage from './components/RegistrationPage';
import CompleteProfilePage from './components/CompleteProfilePage';
import ChangePasswordPage from './components/ChangePasswordPage';

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
    }, []);

    const handleLogin = (data) => {
        // Guardar el token siempre
        localStorage.setItem('token', data.token);

        // Si es el primer login del proveedor, debe cambiar su contraseña
        if (data.user.role === 'SUPPLIER' && data.user.firstLogin) {
            setCurrentUser(data.user);
            setAuthView('changePassword');
            return;
        }

        // Si no es el primer login, guardamos el usuario y mostramos el dashboard
        localStorage.setItem('user', JSON.stringify(data.user));
        setCurrentUser(data.user);
    };

    const handlePasswordChanged = () => {
        // Una vez cambiada la contraseña, actualizamos el estado del usuario localmente 
        // para que ya no tenga el flag de firstLogin
        const updatedUser = { ...currentUser, firstLogin: false };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setCurrentUser(updatedUser);
        setAuthView('login'); // Redirige al dashboard por el efecto de currentUser
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
        case 'changePassword':
            return <ChangePasswordPage user={currentUser} onPasswordChanged={handlePasswordChanged} />;
        case 'login':
        default:
            return <LoginPage 
                        onLogin={handleLogin} 
                        onSwitchToRegister={() => setAuthView('register')}
                        onPendingApproval={handlePendingApproval}
                    />;
    }
}
