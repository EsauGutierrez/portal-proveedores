# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Portal de Proveedores** is a Next.js-based multi-tenant supplier management portal that integrates with NetSuite for procurement workflows. It handles purchase orders, invoices, payment complements, supplier profiles, and document uploads with OCR capabilities.

**Tech Stack:**
- **Framework:** Next.js 15.3.4 (React 19, App Router)
- **Language:** TypeScript 5.8.3
- **Database:** PostgreSQL (via Prisma ORM)
- **Cloud:** AWS (S3 for file storage, SQS for invoice queues, Textract for OCR)
- **Styling:** Tailwind CSS 4
- **Key Libraries:** Prisma 6.15, bcrypt, jsonwebtoken, nodemailer, xml2js, pdfkit

## Build & Development Commands

```bash
# Development server (runs on http://localhost:3000)
npm run dev

# Production build
npm run build

# Run production build locally
npm start

# Linting
npm run lint

# Database migrations (Prisma)
npx prisma migrate dev          # Create and apply migration
npx prisma generate            # Regenerate Prisma client
npx prisma studio              # Open database GUI
npx prisma seed                # Run seed script

# Docker database (for local development)
docker-compose up              # Starts PostgreSQL on port 5434
```

**Environment Setup:**
- Copy `.env` template and configure: `DATABASE_URL`, `JWT_SECRET`, AWS credentials (S3, SQS, Textract), SMTP (AWS SES), NetSuite OAuth credentials
- Local Docker PostgreSQL uses: `postgresql://user:password@localhost:5434/mydb`
- Deployment uses AWS RDS (configured in `.env`)

## High-Level Architecture

### Core Architecture Pattern: Multi-Tenant with Role-Based Access

The application is **multi-tenant** (multiple companies/organizations sharing one instance) with three user roles:
- **SUPERADMIN:** Manage all tenants and system-wide settings
- **TENANT_ADMIN:** Manage one tenant's suppliers, subsidiaries, documents, and sync operations
- **SUPPLIER:** View POs, upload invoices, manage company profile and documents

### Data Model (Prisma Schema)

**Key Entities:**
- **Tenant:** Company/organization that owns suppliers and subsidiaries. Stores NetSuite OAuth credentials for API calls
- **User:** Authentication with role-based access. Has optional `SupplierProfile` relation if role is SUPPLIER
- **SupplierProfile:** Represents a vendor; has status (PENDING/ACTIVE/REJECTED) and required documents
- **Subsidiary:** Company divisions within a tenant; has RFC (tax ID) and SuiteQL query for pulling POs from NetSuite
- **PurchaseOrder:** Order synced from NetSuite; linked to a supplier and subsidiary
- **Reception:** Goods receipt linked to a PO; contains articles with line-item details
- **Invoice:** Vendor invoice uploaded by supplier; synced to NetSuite as VendorBill; has sync status (PENDING_SYNC/SYNCED/FAILED)
- **PaymentComplement:** CFDI complement to invoice for payment tracking; similar sync status
- **SupplierDocument:** Document uploads (contracts, tax certs, etc.) by supplier; subject to approval workflow
- **SyncLog:** Audit trail for background sync operations (success, partial, or failed)
- **DocumentRequirement:** Per-tenant configuration of required documents for suppliers and OCR settings

**Data Flow:**
```
Tenant → Subsidiaries (one per division)
      → SupplierProfiles (PENDING → ACTIVE)
      → PurchaseOrders (synced from NetSuite via querySuiteQL)
      → Invoices (uploaded by suppliers, synced back to NetSuite as VendorBill)
      → PaymentComplements (CFDI payment tracking)
      → SyncLogs (background operation audit)
```

### API Routes & Responsibilities

**Authentication & User Management:**
- `POST /api/login` — User authentication with JWT; includes subscription expiry validation
- `POST /api/register` — New user creation (role SUPPLIER by default)
- `POST /api/set-password` — Create password for invited users
- `POST /api/auth/forgot-password` — Password reset token generation
- `POST /api/auth/reset-password` — Password reset validation and update
- `POST /api/profile/change-password` — Change password for logged-in user

**Supplier Management (TENANT_ADMIN only):**
- `GET /api/suppliers` — List suppliers; filters by tenant
- `POST /api/suppliers/[id]/approve` — Change supplier status to ACTIVE
- `GET /api/suppliers/[id]` — Get supplier profile details

**Document Upload & Approval:**
- `POST /api/documents` — Supplier uploads required documents
- `GET /api/documents` — List pending/approved documents for admin review
- `POST /api/documents/[id]/validate` — Admin approves with OCR validation (optional)
- `POST /api/documents/[id]/reject` — Admin rejection with reason
- `POST /api/documents/approve-pending` — Bulk approve pending documents
- `POST /api/settings/documents` — TENANT_ADMIN sets which documents are required per tenant

**Procurement Data (read-only for suppliers):**
- `GET /api/purchase-orders` — List POs (filtered by tenant/subsidiary)
- `GET /api/receptions` — List goods receipts linked to POs

**Invoice & Payment Processing:**
- `POST /api/invoices` — Supplier uploads invoice (PDF/XML); stored in S3, queued for sync
- `GET /api/invoices` — List invoices with sync status
- `POST /api/invoices/retry` — Retry failed NetSuite sync
- `GET /api/payment-complements` — List payment complements
- `POST /api/payment-complements/[id]/approve` — Admin approves for sync
- `POST /api/payment-complements/[id]/reject` — Admin rejects with reason
- `POST /api/payment-complements/[id]/retry` — Retry failed sync

**Background Sync (NetSuite ↔ Portal):**
- `GET /api/sync/purchase-orders` — Sync one tenant's POs + receipts from NetSuite
- `GET /api/sync/suppliers` — Sync supplier list from NetSuite (less common)
- `GET /api/sync/all-tenants` — Sync all active tenants (triggered by EventBridge every 4 hours)
- `POST /api/admin/sync/purchase-orders` — Manual sync triggered by TENANT_ADMIN

**Admin (SUPERADMIN only):**
- `GET /api/tenants` — List all tenants
- `POST /api/tenants` — Create new tenant (requires NetSuite creds)
- `GET /api/tenants/admins` — List tenant admins
- `POST /api/admin/documents/export-zip` — Admin export of all approved documents as ZIP

**Helpers:**
- `POST /api/ocr` — Trigger OCR on uploaded document (AWS Textract)
- `POST /api/chat` — AI chat endpoint (Gemini API, optional)
- `POST /api/support-request` — Customer support form
- `POST /api/test-email` — Debug SMTP configuration

### Core Libraries & Utilities

**`lib/netsuite.ts`:**
- `querySuiteQL(query, creds)` — Execute SuiteQL query against NetSuite using OAuth 1.0a
- `invokeRestlet(scriptId, deployId, creds, method, body)` — Call NetSuite RESTlet endpoint
- Handles OAuth header generation and error parsing

**`lib/syncPurchaseOrdersForTenant.ts`:**
- `syncPurchaseOrdersForTenant(tenantId, tenant, triggeredBy, syncType)` — Central sync logic for a single tenant
- Queries NetSuite for all active suppliers' POs and receptions
- Creates or updates PurchaseOrder and Reception records
- Logs sync operation (status, counts, errors)
- **RFC handling:** Generic RFCs (XAXX010101000, XEXX010101000) are excluded from uniqueness constraint; non-generic RFCs are unique per tenant

**`lib/s3.ts`:**
- `uploadFileToS3(file, targetFolder)` — Upload file to S3 (returns S3 key, not public URL)
- `getPresignedUrl(fileKey)` — Generate 1-hour signed URL for downloading private files

**`lib/mailer.ts`:**
- `sendEmail({ to, subject, html })` — Send email via AWS SES (SMTP)
- No-op if MAIL_HOST not configured (logs instead of sending)

**`lib/ocr.ts` & `lib/textract.ts`:**
- OCR processing using AWS Textract (document scanning)
- Validates document upload and extracts text for validation

**`lib/rateLimit.ts`:**
- Rate limiting per IP for login endpoint (10 attempts per 15 minutes)

### Frontend Components

**React Client Components** in `src/app/components/`:
- **`DashboardPage.tsx`** — Main router; switches between views based on user role
  - SUPPLIER views: Overview, invoices, POs, receptions, documents upload, support requests
  - TENANT_ADMIN views: Supplier approval, subsidiary management, document settings, sync logs, invoice admin view
  - SUPERADMIN views: Tenant management
- **`DataTable.tsx`** — Reusable table component with pagination and filtering
- **Page components:** `LoginPage`, `RegistrationPage`, `ProfilePage`, `AdminInvoicesPage`, `SupplierApprovalPage`, `SubsidiariesPage`, etc.

**Styling:**
- Tailwind CSS 4 + custom PostCSS config
- Lucide React icons
- Recharts for dashboard metrics/graphs

### Background Jobs & Scheduled Tasks

**EventBridge Integration** (`infrastructure/eventbridge-sync.yml`):
- Automated CloudFormation template to deploy AWS EventBridge rule
- Calls `GET /api/sync/all-tenants` every 4 hours to sync all tenants
- Configured with retry policy (max 2 retries, 1-hour max age)
- Uses API key authentication (x-sync-key header with SYNC_API_KEY)

**SQS Consumer** (partial):
- `POST /api/workers/sqs-consumer` — Listener for invoice queue (AWS SQS)
- Expected integration: processes invoices from queue and syncs to NetSuite

**Lambda Function** (optional):
- `scripts/lambda-sync-oc/` — Alternative serverless sync mechanism

### Deployment

**AWS Amplify** (`amplify.yml`):
- Pre-build: `npm ci`, generate Prisma client
- Build: `npm run build`
- Artifacts: `.next/` directory cached
- Environment variables injected at build time

## Important Design Patterns & Constraints

### Multi-Tenancy
- Every major entity (User, Supplier, PO, Invoice, etc.) has a `tenantId` field
- **Tenant isolation:** Ensure all API queries filter by `tenantId` from JWT token or request context
- Subscription expiry: Tenants can expire; SUPPLIER role checks `tenant.subscriptionExpiresAt` on login with 7-day grace period
- **Supplier status:** Only ACTIVE suppliers sync from NetSuite; PENDING suppliers cannot view transactions

### NetSuite Integration
- **Credentials stored per tenant** in `Tenant` model (not global)
- **Sync direction:** NetSuite → Portal (read-only for POs/receipts), Portal → NetSuite (invoices/complements as write)
- **Folio uniqueness:** POs and invoices have `@@unique([tenantId, folio])` to prevent duplicates per tenant
- **NetSuite IDs:** Internal IDs from NetSuite stored in `netsuiteId` fields; essential for round-trip sync

### Document & Approval Workflows
- **Supplier documents:** Upload → PENDING → APPROVED or REJECTED
- **Invoice sync:** Upload → PENDING_SYNC → SYNCED or FAILED (with error message)
- **Payment complements:** Upload → PENDING → APPROVED or REJECTED (separate from invoice sync)
- **OCR:** Optional per DocumentRequirement; validates document before approval

### Security
- JWT-based session (stored in browser localStorage)
- Password hashing with bcrypt
- Rate limiting on login endpoint
- API key authentication for background sync (x-sync-key header)
- Presigned URLs for S3 (1-hour expiry) — no public URLs for documents

## Common Development Tasks

### Adding a New API Endpoint
1. Create route file: `src/app/api/[feature]/route.ts`
2. Validate tenant context from JWT (`extractTenantId()` or headers)
3. Use Prisma with tenant filter: `prisma.model.findMany({ where: { tenantId } })`
4. Return NextResponse.json() with appropriate status codes
5. Test with curl/Postman, include x-sync-key if protected endpoint

### Modifying the Data Model
1. Edit `prisma/schema.prisma`
2. Create migration: `npx prisma migrate dev --name description`
3. Update related API routes that query the new field
4. If adding a required field to existing records, consider default value or migration script

### Updating NetSuite Sync Logic
- Edit `lib/syncPurchaseOrdersForTenant.ts`
- Test with a single tenant first: `GET /api/admin/sync/purchase-orders?tenantId=xxx`
- Check SyncLog records in database for error details
- Verify RFC handling for generic vs. non-generic suppliers

### Deploying to AWS Amplify
1. Push to git (branch triggers build if connected)
2. AWS Amplify runs `amplify.yml` build steps
3. Verify environment variables are set in Amplify console
4. EventBridge rule must be deployed separately via CloudFormation (or manual EventBridge setup)

## File Paths & Key Locations

- **Prisma Schema:** `prisma/schema.prisma`
- **API Routes:** `src/app/api/` (organized by feature: login, suppliers, invoices, sync, etc.)
- **React Components:** `src/app/components/` (client components with "use client" directive)
- **Library Functions:** `src/app/lib/` (netsuite.ts, s3.ts, mailer.ts, ocr.ts, syncPurchaseOrdersForTenant.ts)
- **Database Migrations:** `prisma/migrations/`
- **Environment Config:** `.env` (local) / Amplify console (production)
- **AWS Infrastructure:** `infrastructure/eventbridge-sync.yml` (CloudFormation for scheduled sync)
- **NetSuite CustomScripts:** `Netsuite/IMR-PP-FACTURAS-REST.js` (RESTlet for invoice processing)
- **Type Definitions:** `types/netsuite-js.d.ts` (custom types for NetSuite SDK)

## Notes for Claude Code

- **Tenant context is critical:** Always check that API endpoints filter by tenant; multi-tenant bugs are severe
- **NetSuite credentials:** Stored per tenant; never hardcode them or assume global OAuth config
- **Sync operations are idempotent:** Multiple sync runs should not create duplicate POs; rely on folio uniqueness
- **RFC uniqueness is partial:** Generic RFCs (XAXX/XEXX) can be shared; implemented via partial unique constraint in migration
- **Error handling:** NetSuite API errors should be logged to SyncLog; user-facing errors should be clear and actionable
- **Performance:** Sync operations can be slow (querying all suppliers' POs); consider pagination for large tenants
- **Background jobs:** EventBridge and SQS are async; monitor logs in CloudWatch and check SyncLog table for failures
