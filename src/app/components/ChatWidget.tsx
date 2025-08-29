// app/components/ChatWidget.tsx

"use client";

import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User } from 'lucide-react';

const ChatWidget = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'assistant', content: '¡Hola! Soy tu asistente virtual. ¿En qué puedo ayudarte hoy?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Efecto para hacer scroll hacia el último mensaje
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    history: messages,
                    message: input 
                }),
            });

            if (!response.ok) {
                throw new Error('La respuesta de la API no fue exitosa.');
            }

            const result = await response.json();
            const assistantMessage = { role: 'assistant', content: result.reply };
            setMessages(prev => [...prev, assistantMessage]);

        } catch (error) {
            console.error("Error al enviar el mensaje:", error);
            const errorMessage = { role: 'assistant', content: 'Lo siento, no pude procesar tu mensaje en este momento.' };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            {/* Botón de la burbuja del chat */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-6 right-6 bg-blue-600 text-white rounded-full p-4 shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-transform duration-200 transform hover:scale-110"
                aria-label="Abrir chat de ayuda"
            >
                {isOpen ? <X className="w-8 h-8" /> : <MessageSquare className="w-8 h-8" />}
            </button>

            {/* Ventana del Chat */}
            {isOpen && (
                <div className="fixed bottom-24 right-6 w-80 sm:w-96 h-[500px] bg-white rounded-xl shadow-2xl flex flex-col transition-all duration-300">
                    <div className="bg-blue-600 text-white p-4 rounded-t-xl flex items-center">
                        <Bot className="w-6 h-6 mr-3" />
                        <div>
                            <h3 className="font-bold text-lg">Asistente Virtual</h3>
                            <p className="text-sm opacity-90">En línea</p>
                        </div>
                    </div>
                    <div className="flex-grow p-4 overflow-y-auto text-sm space-y-4">
                        {messages.map((msg, index) => (
                            <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.role === 'assistant' && <Bot className="w-6 h-6 text-blue-500 flex-shrink-0" />}
                                <p className={`p-3 rounded-2xl max-w-xs ${msg.role === 'user' ? 'bg-blue-500 text-white rounded-br-none' : 'bg-gray-200 text-gray-800 rounded-bl-none'}`}>
                                    {msg.content}
                                </p>
                                {msg.role === 'user' && <User className="w-6 h-6 text-gray-400 flex-shrink-0" />}
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <p className="bg-gray-200 p-3 rounded-2xl rounded-bl-none">Escribiendo...</p>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                    <form onSubmit={handleSendMessage} className="p-2 border-t flex items-center">
                        <input 
                            type="text" 
                            placeholder="Escribe tu mensaje..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            // CAMBIO: Se añaden clases para oscurecer el texto y el placeholder
                            className="w-full px-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900 placeholder-gray-500"
                            disabled={isLoading}
                        />
                         <button type="submit" disabled={isLoading} className="ml-2 p-3 text-white bg-blue-600 rounded-full hover:bg-blue-700 disabled:bg-blue-300">
                            <Send className="w-5 h-5" />
                         </button>
                    </form>
                </div>
            )}
        </div>
    );
};

export default ChatWidget;
