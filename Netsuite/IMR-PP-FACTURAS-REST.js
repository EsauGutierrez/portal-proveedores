/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/file', 'N/https', 'N/query', 'N/search'], function (record, file, https, query, search) {

    const FOLDER_ID = 135902; // Carpeta destino en el File Cabinet de NetSuite

    // Límite práctico del nombre de archivo en el File Cabinet de NetSuite
    const MAX_FILE_NAME = 95;

    /**
     * Nombre con el que se guarda un documento adicional: "<Documento> - <archivo> [<idPortal>].<ext>".
     * Se ve legible en Communication > Files del Vendor Bill, y el ID del Portal en el nombre lo
     * hace único y permite reconocer el archivo al reintentar (idempotencia).
     */
    function attachmentStoredName(documentName, fileName, portalAttachmentId) {
        var clean = function (v) { return String(v || '').replace(/[\\\/:*?"<>|\[\]]/g, '_').trim(); };
        var dot = String(fileName).lastIndexOf('.');
        var ext = dot > 0 ? clean(String(fileName).substring(dot + 1)) : '';
        var base = clean(documentName) + ' - ' + clean(dot > 0 ? String(fileName).substring(0, dot) : fileName);
        var suffix = ' [' + portalAttachmentId + ']' + (ext ? '.' + ext : '');
        return base.substring(0, Math.max(10, MAX_FILE_NAME - suffix.length)) + suffix;
    }

    /** Tipo de archivo de NetSuite según la extensión del documento. */
    function fileTypeFor(fileName) {
        var ext = String(fileName || '').split('.').pop().toLowerCase();
        switch (ext) {
            case 'pdf': return file.Type.PDF;
            case 'jpg':
            case 'jpeg': return file.Type.JPGIMAGE;
            case 'png': return file.Type.PNGIMAGE;
            case 'xlsx':
            case 'xls': return file.Type.EXCEL;
            case 'docx':
            case 'doc': return file.Type.WORD;
            default: return file.Type.PLAINTEXT;
        }
    }

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

                // Idempotencia: si ya existe un VendorBill con este UUID (tranid), no crear otro.
                // Cubre el caso de timeout: el bill se creó pero el portal no recibió respuesta y
                // reintenta; así se reconoce el bill existente en vez de duplicar o dar
                // "invalid reference" (la OC ya quedó Fully Billed).
                if (uuidFactura) {
                    try {
                        var billDupRows = query.runSuiteQL({
                            query: "SELECT id FROM transaction WHERE type = 'VendBill' AND tranid = ?",
                            params: [String(uuidFactura)]
                        }).asMappedResults();
                        if (billDupRows && billDupRows.length > 0) {
                            log.audit('createVendorBill: bill ya existente (idempotente)', { uuidFactura, vendorBillId: billDupRows[0].id });
                            return {
                                success: true,
                                alreadyExists: true,
                                vendorBillId: billDupRows[0].id,
                                message: 'La factura ya estaba registrada en NetSuite; no se duplicó.'
                            };
                        }
                    } catch (billDupErr) {
                        log.error('createVendorBill: no se pudo verificar duplicado', billDupErr.message);
                    }
                }

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
                    uuidComplemento,  // UUID del CFDI de pago (folio único)
                    complementoXMLUrl, // URL (presigned S3) del XML del complemento
                    complementoPDFUrl  // URL (presigned S3) del PDF del complemento
                } = requestBody;

                if (!vendorNetsuiteId || !vendorBillId || !amount) {
                    return {
                        success: false,
                        error: 'Faltan campos requeridos: vendorNetsuiteId, vendorBillId, amount'
                    };
                }

                // Idempotencia: si ya existe un VendorPayment con este UUID (tranid), no crear
                // otro. Cubre el caso en que un pago se creó pero el portal lo marcó FAILED y
                // se reintenta. Se dedup por UUID (no por bill) para permitir pagos parciales
                // con distinto UUID sobre la misma factura.
                if (uuidComplemento) {
                    try {
                        var dupRows = query.runSuiteQL({
                            query: "SELECT id FROM transaction WHERE type = 'VendPymt' AND tranid = ?",
                            params: [String(uuidComplemento)]
                        }).asMappedResults();
                        if (dupRows && dupRows.length > 0) {
                            var existingPaymentId = dupRows[0].id;
                            log.audit('createVendorPayment: pago ya existente (idempotente)', { uuidComplemento, vendorPaymentId: existingPaymentId });

                            // Backfill: si el pago existente no tiene el XML/PDF adjunto, lo
                            // adjuntamos ahora (cubre pagos creados antes de este cambio).
                            try {
                                // Consultar los valores actuales por separado (no en el query de
                                // duplicado, para no arriesgar la detección si el campo no fuera consultable).
                                var curXml = null, curPdf = null;
                                try {
                                    var curRows = query.runSuiteQL({
                                        query: "SELECT custbody_fe_sf_xml_sat, custbody_fe_sf_pdf FROM transaction WHERE id = ?",
                                        params: [existingPaymentId]
                                    }).asMappedResults();
                                    if (curRows && curRows.length > 0) {
                                        curXml = curRows[0].custbody_fe_sf_xml_sat;
                                        curPdf = curRows[0].custbody_fe_sf_pdf;
                                    }
                                } catch (curErr) {
                                    log.error('createVendorPayment: no se pudieron leer campos actuales', curErr.message);
                                }
                                var bfBase = uuidComplemento || ('pago_' + vendorBillId);
                                var bfValues = {};
                                if (complementoXMLUrl && !curXml) {
                                    var bfXmlId = uploadToFileCabinet(complementoXMLUrl, bfBase + '.xml', file.Type.XMLDOC);
                                    if (bfXmlId) bfValues.custbody_fe_sf_xml_sat = bfXmlId;
                                }
                                if (complementoPDFUrl && !curPdf) {
                                    var bfPdfId = uploadToFileCabinet(complementoPDFUrl, bfBase + '.pdf', file.Type.PDF);
                                    if (bfPdfId) bfValues.custbody_fe_sf_pdf = bfPdfId;
                                }
                                if (bfValues.custbody_fe_sf_xml_sat || bfValues.custbody_fe_sf_pdf) {
                                    record.submitFields({ type: record.Type.VENDOR_PAYMENT, id: existingPaymentId, values: bfValues });
                                    log.audit('createVendorPayment: XML/PDF adjuntados al pago existente', { existingPaymentId, bfValues });
                                }
                            } catch (bfErr) {
                                log.error('createVendorPayment: no se pudo adjuntar XML/PDF al pago existente', bfErr.message);
                            }

                            return {
                                success: true,
                                alreadyExists: true,
                                vendorPaymentId: existingPaymentId,
                                message: 'El complemento ya estaba registrado en NetSuite; no se duplicó.'
                            };
                        }
                    } catch (dupErr) {
                        log.error('createVendorPayment: no se pudo verificar duplicado', dupErr.message);
                    }
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

                // Adjuntar XML y PDF del complemento al File Cabinet y asignarlos a los
                // campos custom (mismo patrón que createVendorBill).
                var baseName = uuidComplemento || ('pago_' + vendorBillId);
                if (complementoXMLUrl) {
                    var pXmlFileId = uploadToFileCabinet(complementoXMLUrl, baseName + '.xml', file.Type.XMLDOC);
                    if (pXmlFileId) {
                        try { payment.setValue({ fieldId: 'custbody_fe_sf_xml_sat', value: pXmlFileId }); }
                        catch (e) { log.error('createVendorPayment: no se pudo asignar custbody_fe_sf_xml_sat', e.message); }
                    }
                }
                if (complementoPDFUrl) {
                    var pPdfFileId = uploadToFileCabinet(complementoPDFUrl, baseName + '.pdf', file.Type.PDF);
                    if (pPdfFileId) {
                        try { payment.setValue({ fieldId: 'custbody_fe_sf_pdf', value: pPdfFileId }); }
                        catch (e) { log.error('createVendorPayment: no se pudo asignar custbody_fe_sf_pdf', e.message); }
                    }
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

                // Idempotencia: no duplicar si ya existe un VendorBill con este UUID (tranid).
                try {
                    var stdDupRows = query.runSuiteQL({
                        query: "SELECT id FROM transaction WHERE type = 'VendBill' AND tranid = ?",
                        params: [String(uuidFactura)]
                    }).asMappedResults();
                    if (stdDupRows && stdDupRows.length > 0) {
                        log.audit('createStandaloneVendorBill: bill ya existente (idempotente)', { uuidFactura, vendorBillId: stdDupRows[0].id });
                        return {
                            success: true,
                            alreadyExists: true,
                            vendorBillId: stdDupRows[0].id,
                            message: 'La factura ya estaba registrada en NetSuite; no se duplicó.'
                        };
                    }
                } catch (stdDupErr) {
                    log.error('createStandaloneVendorBill: no se pudo verificar duplicado', stdDupErr.message);
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

            // ─── Acción 5: Adjuntar un documento adicional a la factura ──────────────────
            // Sube el archivo al File Cabinet y lo adjunta al Vendor Bill (subtab Communication >
            // Files). El Portal la invoca DESPUÉS de crear el bill y de forma independiente: un
            // fallo aquí nunca invalida la factura. Es idempotente: se reconoce el archivo por su
            // nombre (incluye el ID del adjunto en el Portal) y se verifica si ya está adjunto.
            if (action === 'createInvoiceAttachment') {
                const {
                    vendorBillId,       // Internal ID del Vendor Bill
                    portalAttachmentId, // ID del adjunto en el Portal
                    documentName,       // Nombre del documento configurado (ej. "Evidencia de entrega")
                    fileName,           // Nombre original del archivo
                    fileUrl             // URL (presigned S3) para descargar el archivo
                } = requestBody;

                if (!vendorBillId || !portalAttachmentId || !fileName || !fileUrl) {
                    return {
                        success: false,
                        error: 'Faltan campos requeridos: vendorBillId, portalAttachmentId, fileName, fileUrl'
                    };
                }
                var billId = parseInt(vendorBillId, 10);

                // El bill debe existir (pudo haberse eliminado en NetSuite después de sincronizarse)
                var billRows = query.runSuiteQL({
                    query: "SELECT id FROM transaction WHERE id = ? AND type = 'VendBill'",
                    params: [billId]
                }).asMappedResults();
                if (!billRows || billRows.length === 0) {
                    return { success: false, error: 'El Vendor Bill ' + vendorBillId + ' no existe en NetSuite.' };
                }

                var storedName = attachmentStoredName(documentName || fileName, fileName, portalAttachmentId);

                // Si un intento anterior ya subió el archivo, reutilizarlo en vez de subirlo otra vez
                var attFileId = null;
                try {
                    var attFileRows = query.runSuiteQL({
                        query: 'SELECT id FROM file WHERE name = ? AND folder = ?',
                        params: [storedName, FOLDER_ID]
                    }).asMappedResults();
                    if (attFileRows && attFileRows.length > 0) attFileId = attFileRows[0].id;
                } catch (attFileErr) {
                    log.error('createInvoiceAttachment: no se pudo buscar archivo existente', attFileErr.message);
                }
                if (!attFileId) {
                    attFileId = uploadToFileCabinet(fileUrl, storedName, fileTypeFor(fileName));
                }
                if (!attFileId) {
                    return {
                        success: false,
                        error: 'No se pudo descargar el archivo desde el Portal (¿URL vencida?) o guardarlo en el File Cabinet.'
                    };
                }

                // ¿Ya está adjunto a este bill? Si no se puede verificar, se intenta adjuntar de todos modos.
                try {
                    var attachedRows = search.create({
                        type: 'transaction',
                        filters: [['internalid', 'anyof', billId], 'AND', ['mainline', 'is', 'T']],
                        columns: [search.createColumn({ name: 'internalid', join: 'file' })]
                    }).run().getRange({ start: 0, end: 1000 });
                    for (var i = 0; i < attachedRows.length; i++) {
                        var attachedId = attachedRows[i].getValue({ name: 'internalid', join: 'file' });
                        if (attachedId && String(attachedId) === String(attFileId)) {
                            log.audit('createInvoiceAttachment: archivo ya adjunto (idempotente)', { vendorBillId: billId, fileId: attFileId });
                            return {
                                success: true,
                                alreadyExists: true,
                                recordId: attFileId,
                                message: 'El documento ya estaba adjunto a la factura en NetSuite; no se duplicó.'
                            };
                        }
                    }
                } catch (attSearchErr) {
                    log.error('createInvoiceAttachment: no se pudo verificar adjuntos existentes', attSearchErr.message);
                }

                record.attach({
                    record: { type: 'file', id: attFileId },
                    to: { type: record.Type.VENDOR_BILL, id: billId }
                });

                log.audit('Documento adicional adjuntado', { vendorBillId: billId, portalAttachmentId: portalAttachmentId, fileId: attFileId });

                return {
                    success: true,
                    recordId: attFileId,
                    message: 'Documento adicional adjuntado correctamente a la factura.'
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
