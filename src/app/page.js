"use client"; // Necesario porque maneja el estado de la sesión

import React, { useState } from 'react';
import LoginPage from './components/LoginPage';
import DashboardPage from './components/DashboardPage';

// El componente principal ahora actúa como un controlador de estado.
export default function HomePage() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    // Renderiza una página u otra basándose en el estado de isLoggedIn
    if (isLoggedIn) {
        return <DashboardPage onLogout={() => setIsLoggedIn(false)} />;
    } else {
        return <LoginPage onLogin={() => setIsLoggedIn(true)} />;
    }
}
