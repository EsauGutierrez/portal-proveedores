// app/components/PasswordRequirementChecklist.tsx
"use client";

import React from 'react';
import { Check } from 'lucide-react';
import { PASSWORD_REQUIREMENTS } from '../lib/passwordPolicy';

const PasswordRequirementItem = ({ met, label }: { met: boolean; label: string }) => (
  <li className="flex items-center text-sm transition-colors duration-300">
    <span
      className={`flex items-center justify-center w-5 h-5 mr-2 rounded-full shrink-0 transition-all duration-300 ease-out ${
        met ? 'bg-green-500 scale-100' : 'bg-gray-200 scale-90'
      }`}
    >
      <Check
        className={`w-3 h-3 text-white transition-all duration-300 ${met ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
      />
    </span>
    <span className={`transition-colors duration-300 ${met ? 'text-green-700' : 'text-gray-500'}`}>{label}</span>
  </li>
);

type ExtraRequirement = { label: string; met: boolean };

// Checklist animado que se marca conforme la contraseña cumple cada requisito de PASSWORD_REQUIREMENTS.
// `extra` permite añadir condiciones propias del formulario (ej. "coincide con confirmación").
const PasswordRequirementChecklist = ({ password, extra = [] }: { password: string; extra?: ExtraRequirement[] }) => {
  const requirements = [
    ...PASSWORD_REQUIREMENTS.map((r) => ({ label: r.label, met: r.test(password) })),
    ...extra,
  ];

  return (
    <ul className="space-y-1.5 bg-gray-50 border border-gray-100 rounded-lg p-3">
      {requirements.map((r) => (
        <PasswordRequirementItem key={r.label} met={r.met} label={r.label} />
      ))}
    </ul>
  );
};

export default PasswordRequirementChecklist;
