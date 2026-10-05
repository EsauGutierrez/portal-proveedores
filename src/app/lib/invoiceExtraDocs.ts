// Documentos adicionales de factura: resolución de qué requisitos aplican a una carga.

import type { SupplierType } from '@prisma/client';
import { prisma } from './prisma';
import { acceptAttribute, isExtraFileType } from './invoiceExtraDocTypes';

const SUPPLIER_TYPES: SupplierType[] = ['NATIONAL', 'FOREIGN', 'BOTH'];

export type RequirementInput = {
  name?: string;
  isRequired?: boolean;
  isActive?: boolean;
  supplierType?: SupplierType;
  allowedTypes?: string[];
  subsidiaryIds?: string[];
};

/**
 * Valida y normaliza el cuerpo de alta/edición de un documento adicional.
 * `partial` = true para PATCH (solo se validan los campos presentes).
 */
export async function parseRequirementInput(
  body: any,
  tenantId: string,
  partial: boolean,
): Promise<{ data: RequirementInput } | { error: string }> {
  const data: RequirementInput = {};

  if (!partial || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 3) return { error: 'El nombre del documento debe tener al menos 3 caracteres.' };
    if (name.length > 100) return { error: 'El nombre del documento no puede exceder 100 caracteres.' };
    data.name = name;
  }

  for (const key of ['isRequired', 'isActive'] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'boolean') return { error: `El campo ${key} debe ser verdadero o falso.` };
      data[key] = body[key];
    }
  }

  if (body.supplierType !== undefined) {
    if (!SUPPLIER_TYPES.includes(body.supplierType)) return { error: 'Tipo de proveedor inválido.' };
    data.supplierType = body.supplierType;
  }

  if (!partial || body.allowedTypes !== undefined) {
    const types: unknown = body.allowedTypes;
    if (!Array.isArray(types) || types.length === 0) {
      return { error: 'Selecciona al menos un tipo de archivo permitido.' };
    }
    if (!types.every(isExtraFileType)) return { error: 'Tipo de archivo no soportado.' };
    data.allowedTypes = Array.from(new Set(types));
  }

  if (body.subsidiaryIds !== undefined) {
    const ids: unknown = body.subsidiaryIds;
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
      return { error: 'La lista de subsidiarias es inválida.' };
    }
    const unique = Array.from(new Set(ids as string[]));
    if (unique.length > 0) {
      const owned = await prisma.subsidiary.count({ where: { id: { in: unique }, tenantId } });
      if (owned !== unique.length) return { error: 'Alguna subsidiaria no pertenece a tu empresa.' };
    }
    data.subsidiaryIds = unique;
  }

  return { data };
}

/**
 * Requisitos activos del tenant que aplican a una factura, según el tipo del
 * proveedor (Nacional/Extranjero) y la subsidiaria de la OC. Un requisito sin
 * subsidiarias asignadas aplica a todas.
 */
export async function getApplicableRequirements(
  tenantId: string,
  subsidiaryId: string | null,
  supplierType: SupplierType,
) {
  const requirements = await prisma.invoiceDocumentRequirement.findMany({
    where: {
      tenantId,
      isActive: true,
      supplierType: { in: ['BOTH', supplierType] },
    },
    orderBy: [{ isRequired: 'desc' }, { name: 'asc' }],
  });

  return requirements.filter(
    (r) => r.subsidiaryIds.length === 0 || (subsidiaryId !== null && r.subsidiaryIds.includes(subsidiaryId)),
  );
}

export function toPublicRequirement(r: {
  id: string;
  name: string;
  isRequired: boolean;
  allowedTypes: string[];
}) {
  return {
    id: r.id,
    name: r.name,
    isRequired: r.isRequired,
    allowedTypes: r.allowedTypes,
    accept: acceptAttribute(r.allowedTypes),
  };
}
