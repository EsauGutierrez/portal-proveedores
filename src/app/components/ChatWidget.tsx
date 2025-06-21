"use client";

import React, { useState } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';

const ChatWidget = () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div>
            {/* Chat Bubble */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-6 right-6 bg-blue-600 text-white rounded-full p-4 shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-transform duration-200 transform hover:scale-110"
                aria-label="Abrir chat de ayuda"
            >
                {isOpen ? <X className="w-8 h-8" /> : <MessageSquare className="w-8 h-8" />}
            </button>

            {/* Chat Window */}
            {isOpen && (
                <div className="fixed bottom-24 right-6 w-80 h-96 bg-white rounded-xl shadow-2xl flex flex-col transition-all duration-300">
                    <div className="bg-blue-600 text-white p-4 rounded-t-xl">
                        <h3 className="font-bold text-lg">Soporte en línea</h3>
                        <p className="text-sm opacity-90">¿Cómo podemos ayudarte?</p>
                    </div>
                    <div className="flex-grow p-4 overflow-y-auto text-sm space-y-4">
                        <div className="flex justify-start">
                            <p className="bg-gray-200 p-2 rounded-lg max-w-xs">¡Hola! Bienvenido al soporte. Pregúntame lo que necesites.</p>
                        </div>
                         <div className="flex justify-end">
                            <p className="bg-blue-500 text-white p-2 rounded-lg max-w-xs">Tengo una duda con una factura.</p>
                        </div>
                    </div>
                    <div className="p-2 border-t flex items-center">
                        <input 
                            type="text" 
                            placeholder="Escribe tu mensaje..."
                            className="w-full px-3 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                         <button className="ml-2 p-2 text-blue-600 hover:bg-blue-100 rounded-full">
                            <Send className="w-5 h-5" />
                         </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatWidget;
