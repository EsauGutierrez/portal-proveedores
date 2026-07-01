# Estructura de Base de Datos — Portal de Proveedores

**Base de datos:** PostgreSQL (AWS RDS)  
**ORM:** Prisma 6.15  
**Fecha de exportación:** 2026-06-16

---

## Diagrama de Relaciones

```
Tenant
  ├── User (rol: SUPERADMIN | TENANT_ADMIN | SUPPLIER)
  │     └── SupplierProfile
  │           └── SupplierDocument
  ├── Subsidiary
  ├── PurchaseOrder
  │     └── Reception
  │           └── ReceptionArticle
  ├── Invoice
  │     └── PaymentComplement
  ├── SyncLog
  └── DocumentRequirement
```

---

## Tablas

### Tenant
Empresa / organización dueña del portal. Contiene credenciales NetSuite.

| Campo                  | Tipo       | Descripción                                 |
|------------------------|------------|---------------------------------------------|
| id                     | String PK  | CUID único                                  |
| name                   | String     | Nombre de la empresa                        |
| isActive               | Boolean    | Tenant habilitado                           |
| netsuiteAccountId      | String?    | ID de cuenta NetSuite                       |
| netsuiteConsumerKey    | String?    | OAuth 1.0a Consumer Key                     |
| netsuiteConsumerSec    | String?    | OAuth 1.0a Consumer Secret                  |
| netsuiteTokenId        | String?    | OAuth 1.0a Token ID                         |
| netsuiteTokenSecret    | String?    | OAuth 1.0a Token Secret                     |
| netsuiteScriptId       | String?    | ID del RESTlet en NetSuite                  |
| netsuiteDeployId       | String?    | ID de deployment del RESTlet                |
| supportEmail           | String?    | Email de soporte visible al proveedor       |
| maxSubsidiaries        | Int?       | Límite de subsidiarias                      |
| maxSuppliers           | Int?       | Límite de proveedores                       |
| subscriptionExpiresAt  | DateTime?  | Expiración de suscripción                   |
| createdAt              | DateTime   | Fecha de creación                           |
| updatedAt              | DateTime   | Última actualización                        |

---

### User
Usuarios del sistema con roles diferenciados.

| Campo                 | Tipo       | Descripción                                      |
|-----------------------|------------|--------------------------------------------------|
| id                    | String PK  | CUID único                                       |
| name                  | String?    | Nombre completo                                  |
| email                 | String?    | Email único (login)                              |
| password              | String?    | Hash bcrypt                                      |
| role                  | Enum       | `SUPERADMIN` / `TENANT_ADMIN` / `SUPPLIER`       |
| tenantId              | String FK  | → Tenant                                         |
| firstLogin            | Boolean    | Si aún no ha cambiado contraseña inicial         |
| passwordResetToken    | String?    | Token para reset de contraseña                   |
| passwordResetExpires  | DateTime?  | Expiración del token de reset                    |
| createdAt             | DateTime   | Fecha de creación                                |
| updatedAt             | DateTime   | Última actualización                             |

---

### SupplierProfile
Perfil del proveedor. Uno por cada User con rol SUPPLIER.

| Campo              | Tipo       | Descripción                                           |
|--------------------|------------|-------------------------------------------------------|
| id                 | String PK  | CUID único                                            |
| companyName        | String     | Razón social                                          |
| rfc                | String     | RFC fiscal                                            |
| taxAddress         | String     | Domicilio fiscal                                      |
| status             | Enum       | `PENDING` / `ACTIVE` / `REJECTED`                    |
| userId             | String FK  | → User (único 1:1)                                    |
| subsidiaryId       | String FK  | → Subsidiary                                          |
| tenantId           | String FK  | → Tenant                                              |
| netsuiteId         | String?    | ID interno en NetSuite                                |
| requireDocuments   | Boolean    | Si requiere validación de documentos                  |
| supplierType       | Enum       | `NATIONAL` / `FOREIGN` / `BOTH`                      |
| lista69bStatus     | Enum       | Estado en lista negra del SAT                         |
| lista69bCheckedAt  | DateTime?  | Última verificación SAT                               |
| createdAt          | DateTime   | Fecha de creación                                     |
| updatedAt          | DateTime   | Última actualización                                  |

**Estados Lista 69B SAT:** `NOT_CHECKED` | `NO_LISTADO` | `PRESUNTO` | `DEFINITIVO` | `DESVIRTUADO` | `SENTENCIA_FAVORABLE`

---

### SupplierDocument
Documentos subidos por el proveedor para validación.

| Campo              | Tipo       | Descripción                                      |
|--------------------|------------|--------------------------------------------------|
| id                 | String PK  | CUID único                                       |
| documentType       | String     | Tipo de documento (ACTA_CONSTITUTIVA, RFC, etc.) |
| fileName           | String     | Nombre del archivo                               |
| fileUrl            | String     | Ruta en S3                                       |
| status             | Enum       | `PENDING` / `UPLOADED` / `APPROVED` / `REJECTED` |
| rejectionReason    | String?    | Motivo del rechazo (guardado al rechazar)        |
| rejectedAt         | DateTime?  | Fecha de rechazo                                 |
| approvedAt         | DateTime?  | Fecha de aprobación                              |
| uploadedAt         | DateTime   | Fecha de carga                                   |
| supplierProfileId  | String FK  | → SupplierProfile                                |

**Restricción única:** `(supplierProfileId, documentType)` — un documento por tipo por proveedor.

---

### DocumentRequirement
Configuración de qué documentos son requeridos por tenant.

| Campo        | Tipo       | Descripción                                         |
|--------------|------------|-----------------------------------------------------|
| id           | String PK  | CUID único                                          |
| documentType | String     | Tipo de documento                                   |
| name         | String     | Nombre legible                                      |
| isRequired   | Boolean    | Si es obligatorio                                   |
| isOcrEnabled | Boolean    | Si valida con AWS Textract                          |
| isActive     | Boolean    | Si está habilitado                                  |
| isSystem     | Boolean    | Si es de sistema (no editable)                      |
| supplierType | Enum       | `NATIONAL` / `FOREIGN` / `BOTH`                    |
| tenantId     | String FK  | → Tenant                                            |

---

### Subsidiary
División / sucursal de una empresa tenant.

| Campo           | Tipo      | Descripción                                    |
|-----------------|-----------|------------------------------------------------|
| id              | String PK | CUID único                                     |
| name            | String    | Nombre de la subsidiaria                       |
| rfc             | String?   | RFC fiscal                                     |
| businessName    | String    | Razón social                                   |
| taxRegime       | String    | Régimen fiscal                                 |
| taxAddress      | String    | Domicilio fiscal                               |
| logoUrl         | String?   | Logo en S3                                     |
| poSuiteqlQuery  | String?   | Query SuiteQL para sincronizar OCs de NetSuite |
| isActive        | Boolean   | Si está activa                                 |
| tenantId        | String FK | → Tenant                                       |
| createdAt       | DateTime  | Fecha de creación                              |
| updatedAt       | DateTime  | Última actualización                           |

---

### PurchaseOrder
Órdenes de compra sincronizadas desde NetSuite.

| Campo          | Tipo       | Descripción                           |
|----------------|------------|---------------------------------------|
| id             | String PK  | CUID único                            |
| folio          | String     | Folio de la OC (único por tenant)     |
| fecha          | DateTime   | Fecha de la OC                        |
| subtotal       | Decimal    | Subtotal                              |
| tax            | Decimal    | Impuesto                              |
| total          | Decimal    | Total                                 |
| netsuiteId     | String?    | ID interno en NetSuite                |
| isConsignment  | Boolean    | Si es consignación                    |
| userId         | String FK  | → User (proveedor)                    |
| subsidiaryId   | String FK  | → Subsidiary                          |
| tenantId       | String FK  | → Tenant                              |
| createdAt      | DateTime   | Fecha de creación                     |
| updatedAt      | DateTime   | Última actualización                  |

---

### Reception
Recepciones de mercancía vinculadas a una OC.

| Campo           | Tipo      | Descripción                          |
|-----------------|-----------|--------------------------------------|
| id              | String PK | CUID único                           |
| folio           | String    | Folio de recepción (único por tenant)|
| fecha           | DateTime  | Fecha de recepción                   |
| purchaseOrderId | String FK | → PurchaseOrder                      |
| invoiceId       | String FK | → Invoice (opcional)                 |
| tenantId        | String FK | → Tenant                             |
| netsuiteId      | String?   | ID interno en NetSuite               |
| createdAt       | DateTime  | Fecha de creación                    |
| updatedAt       | DateTime  | Última actualización                 |

---

### ReceptionArticle
Artículos por línea dentro de una recepción.

| Campo        | Tipo      | Descripción              |
|--------------|-----------|--------------------------|
| id           | String PK | CUID único               |
| articleName  | String    | Nombre del artículo      |
| quantity     | Int       | Cantidad                 |
| unitPrice    | Decimal   | Precio unitario          |
| subtotal     | Decimal   | Subtotal                 |
| tax          | Decimal   | Impuesto                 |
| total        | Decimal   | Total                    |
| receptionId  | String FK | → Reception              |

---

### Invoice
Facturas subidas por el proveedor, sincronizadas a NetSuite como VendorBill.

| Campo           | Tipo      | Descripción                                      |
|-----------------|-----------|--------------------------------------------------|
| id              | String PK | CUID único                                       |
| folio           | String    | Folio (UUID del CFDI, único por tenant)          |
| fecha           | DateTime  | Fecha de la factura                              |
| subtotal        | Decimal   | Subtotal                                         |
| tax             | Decimal   | IVA                                              |
| total           | Decimal   | Total                                            |
| pdfUrl          | String?   | PDF en S3                                        |
| xmlUrl          | String?   | XML en S3                                        |
| syncStatus      | Enum      | `PENDING_SYNC` / `SYNCED` / `FAILED`            |
| syncError       | String?   | Mensaje de error si falló el sync                |
| netsuiteId      | String?   | ID del VendorBill en NetSuite                    |
| purchaseOrderId | String FK | → PurchaseOrder (opcional)                       |
| userId          | String FK | → User (proveedor)                               |
| tenantId        | String FK | → Tenant                                         |
| createdAt       | DateTime  | Fecha de creación                                |
| updatedAt       | DateTime  | Última actualización                             |

---

### PaymentComplement
Complementos de pago CFDI vinculados a facturas.

| Campo               | Tipo      | Descripción                                     |
|---------------------|-----------|-------------------------------------------------|
| id                  | String PK | CUID único                                      |
| folio               | String    | Folio (único por tenant)                        |
| fecha               | DateTime  | Fecha del complemento                           |
| total               | Decimal   | Monto total                                     |
| pdfUrl              | String?   | PDF en S3                                       |
| xmlUrl              | String?   | XML en S3                                       |
| status              | Enum      | `PENDING` / `APPROVED` / `REJECTED`            |
| rejectionReason     | String?   | Motivo de rechazo                               |
| approvedAt          | DateTime? | Fecha de aprobación                             |
| rejectedAt          | DateTime? | Fecha de rechazo                                |
| netsuiteSyncStatus  | Enum      | `PENDING_SYNC` / `SYNCED` / `FAILED`           |
| netsuitePaymentId   | String?   | ID del VendorPayment en NetSuite                |
| netsuiteSyncError   | String?   | Error de sincronización                         |
| invoiceId           | String FK | → Invoice                                       |
| userId              | String FK | → User                                          |
| tenantId            | String FK | → Tenant                                        |
| createdAt           | DateTime  | Fecha de creación                               |
| updatedAt           | DateTime  | Última actualización                            |

---

### SyncLog
Bitácora de sincronizaciones NetSuite ↔ Portal.

| Campo        | Tipo      | Descripción                                  |
|--------------|-----------|----------------------------------------------|
| id           | String PK | CUID único                                   |
| type         | Enum      | `SCHEDULED` / `MANUAL`                      |
| status       | Enum      | `SUCCESS` / `PARTIAL` / `FAILED`            |
| createdCount | Int       | Registros nuevos creados                     |
| updatedCount | Int       | Registros actualizados                       |
| skippedCount | Int       | Registros omitidos                           |
| totalFound   | Int       | Total encontrados en NetSuite                |
| durationMs   | Int       | Duración en milisegundos                     |
| errorMessage | String?   | Error si falló                               |
| triggeredBy  | String?   | Quién disparó el sync (manual/EventBridge)   |
| tenantId     | String FK | → Tenant                                     |
| createdAt    | DateTime  | Fecha del sync                               |

---

## Enums

| Enum                     | Valores                                                                                  |
|--------------------------|------------------------------------------------------------------------------------------|
| Role                     | `SUPERADMIN`, `TENANT_ADMIN`, `SUPPLIER`                                                 |
| SupplierStatus           | `PENDING`, `ACTIVE`, `REJECTED`                                                          |
| DocumentStatus           | `PENDING`, `UPLOADED`, `APPROVED`, `REJECTED`                                            |
| InvoiceSyncStatus        | `PENDING_SYNC`, `SYNCED`, `FAILED`                                                       |
| PaymentComplementStatus  | `PENDING`, `APPROVED`, `REJECTED`                                                        |
| SyncStatus               | `SUCCESS`, `PARTIAL`, `FAILED`                                                           |
| SyncType                 | `SCHEDULED`, `MANUAL`                                                                    |
| SupplierType             | `NATIONAL`, `FOREIGN`, `BOTH`                                                            |
| Lista69bStatus           | `NOT_CHECKED`, `NO_LISTADO`, `PRESUNTO`, `DEFINITIVO`, `DESVIRTUADO`, `SENTENCIA_FAVORABLE` |
