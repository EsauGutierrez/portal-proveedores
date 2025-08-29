// app/page.tsx

"use client";

import React, { useState, useEffect } from 'react';
import LoginPage from './components/LoginPage';
import DashboardPage from './components/DashboardPage';
import RegistrationPage from './components/RegistrationPage';
import CompleteProfilePage from './components/CompleteProfilePage';

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
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('token', data.token);
        setCurrentUser(data.user);
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
        case 'login':
        default:
            return <LoginPage 
                        onLogin={handleLogin} 
                        onSwitchToRegister={() => setAuthView('register')}
                        onPendingApproval={handlePendingApproval}
                    />;
    }
}
