import React from 'react';

const ProfilePage = () => (
    <div className="bg-white rounded-lg shadow-md p-8 max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Perfil de Usuario</h2>
        <div className="flex items-center space-x-6">
            <img 
                className="w-24 h-24 rounded-full object-cover border-4 border-blue-500"
                src={`https://placehold.co/100x100/E2E8F0/4A5568?text=AV`}
                alt="Avatar de usuario"
            />
            <div>
                <h3 className="text-xl font-semibold text-gray-900">Juan Pérez</h3>
                <p className="text-gray-500">juan.perez@empresa.com</p>
                <p className="text-sm text-gray-400 mt-1">Miembro desde: 15 de Enero, 2022</p>
            </div>
        </div>
        <div className="mt-8 border-t pt-6">
             <h4 className="text-lg font-semibold text-gray-700 mb-4">Información de la Cuenta</h4>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                     <label className="block text-sm font-medium text-gray-500">Nombre Completo</label>
                     <p className="text-gray-800">Juan Pérez García</p>
                 </div>
                 <div>
                     <label className="block text-sm font-medium text-gray-500">Rol de Usuario</label>
                     <p className="text-gray-800">Administrador de Compras</p>
                 </div>
                 <div>
                     <label className="block text-sm font-medium text-gray-500">Teléfono</label>
                     <p className="text-gray-800">+52 55 1234 5678</p>
                 </div>
                 <div>
                     <label className="block text-sm font-medium text-gray-500">Empresa</label>
                     <p className="text-gray-800">Soluciones Creativas S.A. de C.V.</p>
                 </div>
             </div>
             <button className="mt-6 w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                Editar Perfil
            </button>
        </div>
    </div>
);

export default ProfilePage;
