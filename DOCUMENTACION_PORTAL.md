# Documentación — Portal de Proveedores IMR

**Versión:** 1.0  
**Fecha:** 2026-06-16  
**Stack:** Next.js 15 · React 19 · TypeScript · Prisma · PostgreSQL (AWS RDS) · AWS S3 · NetSuite

---

## 1. Descripción General

El Portal de Proveedores es una plataforma multi-tenant que conecta a proveedores con el ERP NetSuite de IMR. Permite:

- Registro y validación de proveedores con documentos fiscales
- Consulta de Órdenes de Compra sincronizadas desde NetSuite
- Carga y seguimiento de facturas CFDI (PDF + XML)
- Carga de Complementos de Pago
- Notificaciones automáticas por email en cada cambio de estado

---

## 2. Roles y Accesos

| Rol           | Descripción                                                        | Vistas disponibles                                         |
|---------------|--------------------------------------------------------------------|------------------------------------------------------------|
| SUPERADMIN    | Administra todos los tenants del sistema                           | Gestión de tenants, usuarios globales                      |
| TENANT_ADMIN  | Administra un tenant: aprueba proveedores y documentos             | Aprobación proveedores, subsidiarias, sync logs, facturas  |
| SUPPLIER      | Proveedor registrado                                               | OCs, recepciones, facturas, complementos, documentos       |

**Credenciales de acceso local:**
- Admin: `netsuiteadmin@imr.com.mx` / `Notemasquejudas123#`
- Proveedor test: `jhoseth.gutierrez@imr.com.mx`

---

## 3. Flujo Completo del Proveedor

### 3.1 Registro
1. El proveedor accede a `/register`
2. Completa: nombre, RFC, domicilio fiscal, razón social, subsidiaria
3. El sistema crea un `User` (rol SUPPLIER) y un `SupplierProfile` (status `PENDING`)
4. El TENANT_ADMIN ve al proveedor en "Aprobación de Proveedores"

### 3.2 Carga de Documentos
1. El proveedor sube documentos desde su panel (sección Documentos)
2. Cada documento crea o actualiza un `SupplierDocument` con status `UPLOADED`
3. El archivo se guarda en **AWS S3** (ruta privada, acceso por URL firmada de 1 hora)
4. Si el tenant tiene OCR habilitado, **AWS Textract** analiza el documento

**Tipos de documento configurables por tenant:**
- ACTA_CONSTITUTIVA
- RFC
- COMPROBANTE_DOMICILIO
- CONSTANCIA_SITUACION_FISCAL
- IDENTIFICACION_OFICIAL
- OPINION_CUMPLIMIENTO_SAT
- Documentos personalizados

### 3.3 Aprobación / Rechazo de Documentos (TENANT_ADMIN)

**Flujo de aprobación:**
1. Admin abre el perfil del proveedor en "Aprobación de Proveedores"
2. Ve lista de documentos con status actual
3. Clic en **"Aprobar"** → `status: APPROVED`, se guarda `approvedAt`
4. Se envía email al proveedor notificando la aprobación

**Flujo de rechazo (bot verificado 2026-06-16):**
1. Admin clic en **"Rechazar"** junto al documento
2. Modal solicita **motivo del rechazo**
3. Admin escribe motivo y confirma **"Rechazar y Notificar"**
4. API `PATCH /api/documents/[id]/reject` ejecuta:
   - Actualiza `status: REJECTED`
   - Guarda `rejectionReason` y `rejectedAt`
   - Envía email HTML al proveedor con el motivo
5. Portal muestra confirmación: "Documento rechazado. El proveedor ha sido notificado."

**Campos guardados en BD al rechazar:**
```
SupplierDocument.status         = "REJECTED"
SupplierDocument.rejectionReason = "Motivo escrito por el admin"
SupplierDocument.rejectedAt      = timestamp del momento del rechazo
```

### 3.4 Aprobación del Proveedor
Una vez que todos los documentos requeridos están `APPROVED`:
1. Admin hace clic en **"Aprobar Proveedor"**
2. `SupplierProfile.status` cambia a `ACTIVE`
3. El proveedor queda habilitado para recibir OCs desde NetSuite

---

## 4. Flujo de Órdenes de Compra

```
NetSuite → Sync → Portal → Proveedor
```

1. **Sincronización automática:** AWS EventBridge ejecuta `GET /api/sync/all-tenants` cada 4 horas
2. **Sincronización manual:** TENANT_ADMIN puede forzar sync desde el panel
3. El sistema consulta NetSuite via **SuiteQL** con la query configurada en cada Subsidiaria
4. Crea o actualiza registros `PurchaseOrder` y sus `Reception` + `ReceptionArticle`
5. El proveedor ve sus OCs en la sección "Órdenes de Compra"

**Garantía de idempotencia:** `@@unique([tenantId, folio])` previene duplicados en múltiples syncs.

---

## 5. Flujo de Facturación

### 5.1 Carga de Factura (SUPPLIER)
1. Proveedor selecciona una OC y sube el CFDI (PDF + XML)
2. Sistema extrae datos del XML: UUID, folio, fecha, subtotal, IVA, total
3. Archivo guardado en S3; registro creado en `Invoice` con `syncStatus: PENDING_SYNC`
4. Se encola en **AWS SQS** para procesamiento asíncrono

### 5.2 Sincronización a NetSuite
1. Worker lee de SQS y llama al RESTlet de NetSuite
2. Crea un **VendorBill** en NetSuite con los datos de la factura
3. Actualiza `Invoice.syncStatus = SYNCED` y guarda `netsuiteId`
4. Si falla: `syncStatus = FAILED` con mensaje en `syncError`; el admin puede reintentar

---

## 6. Flujo de Complementos de Pago

1. Proveedor sube el complemento CFDI vinculado a una factura
2. Registro en `PaymentComplement` con `status: PENDING`
3. TENANT_ADMIN aprueba o rechaza:
   - **Aprobación** → sync a NetSuite como VendorPayment
   - **Rechazo** → guarda motivo + notifica por email (mismo patrón que documentos)

---

## 7. Notificaciones por Email

Todos los emails se envían via **AWS SES (SMTP)**. Si no está configurado, se loguean en consola.

| Evento                         | Destinatario  | Contenido                                     |
|--------------------------------|---------------|-----------------------------------------------|
| Documento rechazado            | Proveedor     | Tipo de doc, motivo, link al portal           |
| Documento aprobado             | Proveedor     | Confirmación de aprobación                    |
| Proveedor aprobado             | Proveedor     | Bienvenida, acceso habilitado                 |
| Complemento de pago rechazado  | Proveedor     | Motivo de rechazo, link al portal             |
| Reset de contraseña            | Usuario       | Link con token de 1 hora                      |

---

## 8. API Endpoints Principales

### Autenticación
| Método | Ruta                          | Descripción                      |
|--------|-------------------------------|----------------------------------|
| POST   | /api/login                    | Login con JWT                    |
| POST   | /api/register                 | Registro de proveedor            |
| POST   | /api/auth/forgot-password     | Solicitar reset de contraseña    |
| POST   | /api/auth/reset-password      | Confirmar nueva contraseña       |

### Documentos
| Método | Ruta                              | Descripción                      |
|--------|-----------------------------------|----------------------------------|
| POST   | /api/documents                    | Subir documento                  |
| GET    | /api/documents                    | Listar documentos                |
| POST   | /api/documents/[id]/validate      | Aprobar documento (con OCR)      |
| PATCH  | /api/documents/[id]/reject        | Rechazar documento con motivo    |

### Proveedores
| Método | Ruta                              | Descripción                      |
|--------|-----------------------------------|----------------------------------|
| GET    | /api/suppliers                    | Listar proveedores del tenant    |
| POST   | /api/suppliers/[id]/approve       | Aprobar proveedor                |

### Órdenes de Compra
| Método | Ruta                              | Descripción                      |
|--------|-----------------------------------|----------------------------------|
| GET    | /api/purchase-orders              | Listar OCs del proveedor         |
| GET    | /api/receptions                   | Listar recepciones               |

### Facturas
| Método | Ruta                              | Descripción                      |
|--------|-----------------------------------|----------------------------------|
| POST   | /api/invoices                     | Subir factura CFDI               |
| GET    | /api/invoices                     | Listar facturas                  |
| POST   | /api/invoices/retry               | Reintentar sync fallido          |

### Sync NetSuite
| Método | Ruta                              | Descripción                             |
|--------|-----------------------------------|-----------------------------------------|
| GET    | /api/sync/purchase-orders         | Sync OCs de un tenant                   |
| GET    | /api/sync/all-tenants             | Sync todos los tenants (EventBridge)    |
| POST   | /api/admin/sync/purchase-orders   | Sync manual por TENANT_ADMIN            |

---

## 9. Infraestructura

```
Usuario
  └── Portal Next.js (AWS Amplify)
        ├── PostgreSQL (AWS RDS)
        ├── Archivos (AWS S3) — URLs firmadas 1 hora
        ├── OCR (AWS Textract)
        ├── Email (AWS SES vía SMTP)
        ├── Cola de facturas (AWS SQS)
        └── NetSuite ERP (OAuth 1.0a + SuiteQL + RESTlet)

Sync automático:
  AWS EventBridge → GET /api/sync/all-tenants (cada 4 horas)
```

---

## 10. Variables de Entorno Requeridas

| Variable                  | Descripción                                      |
|---------------------------|--------------------------------------------------|
| DATABASE_URL              | Conexión PostgreSQL                              |
| JWT_SECRET                | Clave para firmar tokens JWT                     |
| NEXTAUTH_SECRET           | Secret para NextAuth                             |
| AWS_REGION                | Región AWS (ej. us-east-2)                       |
| AWS_ACCESS_KEY_ID         | Credencial AWS                                   |
| AWS_SECRET_ACCESS_KEY     | Credencial AWS                                   |
| AWS_S3_BUCKET             | Bucket para archivos                             |
| MAIL_HOST                 | Host SMTP (AWS SES)                              |
| MAIL_PORT                 | Puerto SMTP                                      |
| MAIL_USER                 | Usuario SMTP                                     |
| MAIL_PASS                 | Contraseña SMTP                                  |
| NEXT_PUBLIC_APP_URL       | URL pública del portal (para links en emails)    |
| SYNC_API_KEY              | Key para autenticar llamadas de EventBridge      |

---

## 11. Ambiente Local

```bash
# Requisitos
Node.js 18+, PostgreSQL 14+

# Instalación
npm install
cp .env.example .env   # configurar DATABASE_URL y JWT_SECRET

# Migraciones
npx prisma migrate dev
npx prisma generate

# Servidor de desarrollo (http://localhost:3001)
npm run dev
```

**Conexión a BD de producción (AWS RDS):**
- Host: `portal-proveedores-bd-instance-1.clcxr0nk0e7n.us-east-2.rds.amazonaws.com`
- Puerto: `5432`
- Base de datos: `postgres`
- Usuario: `admin_portal`

---

## 12. Pruebas Verificadas

| Funcionalidad                 | Estado     | Fecha        | Notas                                              |
|-------------------------------|------------|--------------|---------------------------------------------------|
| Login TENANT_ADMIN            | ✅ OK      | 2026-06-16   | netsuiteadmin@imr.com.mx                          |
| Ver lista de proveedores      | ✅ OK      | 2026-06-16   | Panel "Aprobación de Proveedores"                 |
| Rechazar documento individual | ✅ OK      | 2026-06-16   | BD actualizada + email enviado                    |
| Guardar motivo de rechazo     | ✅ OK      | 2026-06-16   | rejectionReason y rejectedAt guardados en BD      |
| Notificación email al rechazar| ✅ OK      | 2026-06-16   | Template HTML con motivo enviado al proveedor     |
| Aprobar proveedor             | Pendiente  | —            | Botón presente, falta verificar                   |
| Rechazar proveedor completo   | Pendiente  | —            | "No implementado" — lógica a desarrollar          |
