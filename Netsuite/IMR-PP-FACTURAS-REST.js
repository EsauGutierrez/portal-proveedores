/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/file', 'N/https', 'N/query'], function (record, file, https, query) {

    const FOLDER_ID = 135902; // Carpeta destino en el File Cabinet de NetSuite

    /**
     * Descarga un archivo desde una URL (presigned S3) y lo guarda en el File Cabinet.
     * Devuelve el internal ID del archivo creado, o null si falla.
     */
    function uploadToFileCabinet(url, fileName, fileType) {
        try {
            const response = https.get({ url: url });

            if (response.code < 200 || response.code >= 300) {
                log.error('uploadToFileCabinet: respuesta HTTP inesperada', { fileName, code: response.code });
                return null;
            }

            const nsFile = file.create({
                name: fileName,
                fileType: fileType,
                contents: response.body,
                folder: FOLDER_ID,
                isOnline: false
            });

            const fileId = nsFile.save();
            log.audit('uploadToFileCabinet: archivo guardado', { fileName, fileId });
            return fileId;

        } catch (e) {
            log.error('uploadToFileCabinet: excepción', { fileName, error: e.message });
            return null;
        }
    }

    // Función que se dispara cuando AWS manda el POST con el JSON
    function doPost(requestBody) {
        try {
            log.debug('Petición recibida desde AWS', requestBody);

            const action = requestBody.action || 'createVendorBill';

            // ─── Acción 1: Crear Vendor Bill desde Recepción / Orden de Compra ───────────
            if (action === 'createVendorBill') {
                const { fromId, fromType, uuidFactura, facturaXMLUrl, facturaPDFUrl } = requestBody;

                const vendorBill = record.transform({
                    fromType: fromType,
                    fromId: fromId,
                    toType: record.Type.VENDOR_BILL,
                    isDynamic: true
                });

                vendorBill.setValue({ fieldId: 'tranid', value: uuidFactura });

                // Subir XML al File Cabinet y asignar al campo custbody_fe_sf_xml_sat
                if (facturaXMLUrl) {
                    const xmlFileId = uploadToFileCabinet(
                        facturaXMLUrl,
                        uuidFactura + '.xml',
                        file.Type.XMLDOC
                    );
                    if (xmlFileId) {
                        vendorBill.setValue({ fieldId: 'custbody_fe_sf_xml_sat', value: xmlFileId });
                    }
                }

                // Subir PDF al File Cabinet y asignar al campo custbody_fe_sf_pdf
                if (facturaPDFUrl) {
                    const pdfFileId = uploadToFileCabinet(
                        facturaPDFUrl,
                        uuidFactura + '.pdf',
                        file.Type.PDF
                    );
                    if (pdfFileId) {
                        vendorBill.setValue({ fieldId: 'custbody_fe_sf_pdf', value: pdfFileId });
                    }
                }

                const newBillId = vendorBill.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: false
                });

                log.audit('Vendor Bill creado exitosamente', newBillId);

                return {
                    success: true,
                    vendorBillId: newBillId,
                    message: 'Vendor Bill creado correctamente.'
                };
            }

            // ─── Acción 2: Crear Vendor Payment (Complemento de Pago) ───────────────────
            if (action === 'createVendorPayment') {
                const {
                    vendorNetsuiteId, // Internal ID del proveedor en NS
                    vendorBillId,     // Internal ID del VendorBill al que aplica
                    amount,           // Monto del complemento
                    trandate,         // Fecha del complemento (ISO string)
                    uuidComplemento   // UUID del CFDI de pago (folio único)
                } = requestBody;

                if (!vendorNetsuiteId || !vendorBillId || !amount) {
                    return {
                        success: false,
                        error: 'Faltan campos requeridos: vendorNetsuiteId, vendorBillId, amount'
                    };
                }

                // Crear el VendorPayment en modo dinámico para que NS cargue
                // automáticamente la cuenta bancaria configurada del proveedor
                const payment = record.create({
                    type: record.Type.VENDOR_PAYMENT,
                    isDynamic: true
                });

                payment.setValue({ fieldId: 'entity', value: parseInt(vendorNetsuiteId) });

                if (trandate) {
                    payment.setValue({ fieldId: 'trandate', value: new Date(trandate) });
                }

                if (uuidComplemento) {
                    payment.setValue({ fieldId: 'tranid', value: uuidComplemento });
                }

                // Recorrer la sublista "apply" y marcar el bill correspondiente
                const lineCount = payment.getLineCount({ sublistId: 'apply' });
                let billFound = false;

                for (let i = 0; i < lineCount; i++) {
                    const lineDocId = payment.getSublistValue({
                        sublistId: 'apply',
                        fieldId: 'internalid',
                        line: i
                    });

                    if (String(lineDocId) === String(vendorBillId)) {
                        payment.selectLine({ sublistId: 'apply', line: i });
                        payment.setCurrentSublistValue({ sublistId: 'apply', fieldId: 'apply', value: true });
                        payment.setCurrentSublistValue({ sublistId: 'apply', fieldId: 'amount', value: parseFloat(amount) });
                        payment.commitLine({ sublistId: 'apply' });
                        billFound = true;
                        break;
                    }
                }

                if (!billFound) {
                    log.error('VendorBill no encontrado en sublista apply', { vendorBillId, vendorNetsuiteId });
                    return {
                        success: false,
                        error: 'El Vendor Bill ' + vendorBillId + ' no aparece en la sublista apply del proveedor ' + vendorNetsuiteId + '.'
                    };
                }

                const newPaymentId = payment.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: false
                });

                log.audit('Vendor Payment creado exitosamente', newPaymentId);

                return {
                    success: true,
                    vendorPaymentId: newPaymentId,
                    message: 'Vendor Payment creado correctamente.'
                };
            }

            // ─── Acción 3: Crear Vendor Bill independiente (sin OC/Recepción) ───────────
            // Usado cuando el CARGADOR o admin sube una factura sin orden de compra
            if (action === 'createStandaloneVendorBill') {
                const {
                    vendorNetsuiteId, // Internal ID del proveedor en NetSuite
                    uuidFactura,
                    totalFactura,
                    subtotalFactura,
                    taxFactura,
                    fechaFactura,
                    facturaXMLUrl,
                    facturaPDFUrl
                } = requestBody;

                if (!vendorNetsuiteId || !uuidFactura || !totalFactura) {
                    return {
                        success: false,
                        error: 'Faltan campos requeridos: vendorNetsuiteId, uuidFactura, totalFactura'
                    };
                }

                const vendorBill = record.create({
                    type: record.Type.VENDOR_BILL,
                    isDynamic: true
                });

                vendorBill.setValue({ fieldId: 'entity', value: parseInt(vendorNetsuiteId) });
                vendorBill.setValue({ fieldId: 'tranid', value: uuidFactura });

                if (fechaFactura) {
                    vendorBill.setValue({ fieldId: 'trandate', value: new Date(fechaFactura) });
                }

                // Línea de cargo genérica con el monto total
                vendorBill.selectNewLine({ sublistId: 'expense' });
                vendorBill.setCurrentSublistValue({ sublistId: 'expense', fieldId: 'amount', value: parseFloat(subtotalFactura || totalFactura) });
                vendorBill.setCurrentSublistValue({ sublistId: 'expense', fieldId: 'memo', value: 'Factura sin OC: ' + uuidFactura });
                vendorBill.commitLine({ sublistId: 'expense' });

                // Subir XML y PDF al File Cabinet
                if (facturaXMLUrl) {
                    const xmlFileId = uploadToFileCabinet(facturaXMLUrl, uuidFactura + '.xml', file.Type.XMLDOC);
                    if (xmlFileId) vendorBill.setValue({ fieldId: 'custbody_fe_sf_xml_sat', value: xmlFileId });
                }
                if (facturaPDFUrl) {
                    const pdfFileId = uploadToFileCabinet(facturaPDFUrl, uuidFactura + '.pdf', file.Type.PDF);
                    if (pdfFileId) vendorBill.setValue({ fieldId: 'custbody_fe_sf_pdf', value: pdfFileId });
                }

                // Campo custom para identificar que no tiene OC ligada
                try {
                    vendorBill.setValue({ fieldId: 'custbody_sin_oc', value: true });
                } catch (_) { /* campo custom puede no existir en todos los ambientes */ }

                const newBillId = vendorBill.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: true
                });

                log.audit('Vendor Bill standalone creado', { newBillId, uuidFactura });

                return {
                    success: true,
                    vendorBillId: newBillId,
                    message: 'Vendor Bill sin OC creado correctamente.'
                };
            }

            // ─── Acción 4: Crear Proveedor (Vendor) desde la invitación del portal ───────
            if (action === 'createVendor') {
                const {
                    companyName,        // Razón social / nombre del proveedor
                    rfc,                // RFC (se guarda en vatregnumber o custentity_mx_rfc)
                    email,              // Correo del proveedor
                    subsidiaryId,       // Internal ID de subsidiaria (solo OneWorld; opcional)
                    isPerson            // true = persona física, false/omitido = compañía
                } = requestBody;

                if (!companyName || !rfc) {
                    return { success: false, error: 'Faltan campos requeridos: companyName, rfc' };
                }

                // Salvaguarda anti-duplicado: si ya existe un Vendor con ese RFC, no crear otro.
                // Se busca tanto en vatregnumber (no-SuiteTax) como en custentity_mx_rfc (SuiteTax).
                var existingId = null;
                try {
                    var rows = query.runSuiteQL({
                        query: "SELECT id FROM Vendor WHERE UPPER(vatregnumber) = ? OR UPPER(custentity_mx_rfc) = ?",
                        params: [String(rfc).toUpperCase(), String(rfc).toUpperCase()]
                    }).asMappedResults();
                    if (rows && rows.length > 0) existingId = rows[0].id;
                } catch (qErr) {
                    log.error('createVendor: no se pudo verificar RFC existente', qErr.message);
                }

                if (existingId) {
                    return {
                        success: false,
                        alreadyExists: true,
                        vendorId: existingId,
                        error: 'Ya existe un proveedor en NetSuite con el RFC ' + rfc + ' (internalId ' + existingId + ').'
                    };
                }

                var vendor = record.create({ type: record.Type.VENDOR, isDynamic: true });

                vendor.setValue({ fieldId: 'isperson', value: isPerson ? 'T' : 'F' });
                if (isPerson) {
                    // Persona física: NetSuite pide nombre/apellido; usamos la razón social completa.
                    vendor.setValue({ fieldId: 'firstname', value: String(companyName).substring(0, 32) });
                    vendor.setValue({ fieldId: 'lastname', value: String(companyName).substring(0, 32) });
                } else {
                    vendor.setValue({ fieldId: 'companyname', value: companyName });
                }

                if (email) {
                    try { vendor.setValue({ fieldId: 'email', value: email }); } catch (_) {}
                }

                // RFC: intentar primero el campo estándar y, si no existe, el campo custom.
                try {
                    vendor.setValue({ fieldId: 'vatregnumber', value: rfc });
                } catch (_) {
                    try { vendor.setValue({ fieldId: 'custentity_mx_rfc', value: rfc }); } catch (__) {}
                }

                // Subsidiaria: obligatoria en cuentas OneWorld; se omite en cuentas simples.
                if (subsidiaryId) {
                    try { vendor.setValue({ fieldId: 'subsidiary', value: parseInt(subsidiaryId) }); } catch (_) {}
                }

                var newVendorId = vendor.save({ enableSourcing: true, ignoreMandatoryFields: false });
                log.audit('Vendor creado exitosamente desde invitación', { newVendorId, rfc });

                return {
                    success: true,
                    vendorId: newVendorId,
                    message: 'Proveedor creado correctamente en NetSuite.'
                };
            }

            // ─── Acción desconocida ──────────────────────────────────────────────────────
            return {
                success: false,
                error: 'Acción no reconocida: ' + action
            };

        } catch (e) {
            log.error('Error al procesar petición desde AWS', e);
            return {
                success: false,
                error: e.message || e.toString()
            };
        }
    }

    return {
        post: doPost
    };
});
