/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/search', 'N/error'], function (record, search, error) {

    // Función que se dispara cuando AWS manda el POST con el JSON
    function doPost(requestBody) {
        try {
            log.debug('Petición recibida desde AWS', requestBody);

            const action = requestBody.action || 'createVendorBill';

            // ─── Acción 1: Crear Vendor Bill desde Recepción / Orden de Compra ───────────
            if (action === 'createVendorBill') {
                const { fromId, fromType, uuidFactura } = requestBody;

                const vendorBill = record.transform({
                    fromType: fromType,
                    fromId: fromId,
                    toType: record.Type.VENDOR_BILL,
                    isDynamic: true
                });

                vendorBill.setValue({ fieldId: 'tranid', value: uuidFactura });

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
