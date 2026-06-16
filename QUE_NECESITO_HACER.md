# Qué necesito hacer — Junta con Esaú

**Fecha:** 2026-06-17  
**Preparado por:** Raúl Cárdenas

---

## Lo que ya está listo (no tocar)

- Bot de rechazo de documentos → funciona al 100% (status, motivo, fecha, email)
- Documentación de tablas y flujos del portal → subida a GitHub `dev_Raul`
- Ambiente local corriendo en `localhost:3001`
- Conexión a AWS RDS verificada

---

## Lo que falta ahora mismo

### 1. Botón "Rechazar Proveedor" — No implementado
El botón rojo grande en el modal del proveedor dice "No implementado".  
Necesito saber si Esaú ya tiene esa lógica en otra rama o si me toca implementarla.

**Lo que debería hacer ese botón:**
- Cambiar `SupplierProfile.status` a `REJECTED`
- Notificar al proveedor por email con el motivo
- Bloquear acceso del proveedor al portal

---

### 2. Configuración NetSuite
Esaú mencionó 3 pasos pendientes. Solo sé el primero:
- Lista `_imr_fd_estado`
- Los otros 2 pasos no me los ha pasado

Necesito los 3 pasos completos con capturas o instrucciones exactas para configurarlo.

---

### 3. Verificar flujo de "Aprobar Proveedor"
El botón verde "Aprobar Proveedor" existe pero no lo hemos probado en vivo.  
Necesito confirmar con Esaú si ya funciona o si tiene algo pendiente de su lado.

---

### 4. Configuración de Email en producción
Localmente el email no envía (no hay credenciales AWS SES).  
Necesito que Esaú confirme:
- Si en producción (Amplify) el email ya está funcionando
- O si falta configurar las variables `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS` en Amplify

---

### 5. Merge de ramas
Esaú tiene cambios en `dev_Raul` que no conozco (aparecieron al hacer push hoy).  
Necesito saber cuándo y cómo hace el merge de `dev_Raul` → `Desarrollo` → `main`.

---

## Preguntas para Esaú — que venga preparado

### Del portal
1. ¿El botón "Rechazar Proveedor" lo implementas tú o lo hago yo? ¿Hay una rama con ese código?
2. ¿Cuáles son los 3 pasos completos de configuración NetSuite? ¿Me los puedes mandar antes de la junta?
3. ¿"Aprobar Proveedor" ya funciona en producción o tiene algo pendiente?
4. ¿El email de notificaciones está funcionando en producción (Amplify)?
5. ¿Hay algo más en tu rama que no esté en `dev_Raul` que deba saber?
6. ¿Cuándo hacemos el merge a `Desarrollo` y quién lo hace?

### De la junta
7. ¿Qué van a revisar mañana en la junta — demo en vivo o solo avances?
8. ¿Hay alguna funcionalidad nueva que quieran ver terminada para mañana?
9. ¿Quién más va a estar en la junta además de nosotros?

---

## Lo que puedo avanzar yo solo (si hay tiempo antes de la junta)

- Probar el flujo completo de Aprobar Proveedor y documentarlo
- Subir las imágenes del diagrama de BD al repositorio
- Implementar "Rechazar Proveedor" si Esaú confirma que me toca a mí
