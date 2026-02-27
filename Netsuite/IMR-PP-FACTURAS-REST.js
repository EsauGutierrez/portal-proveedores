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

            const {
                proveedorId,
                recepcionId,
                uuidFactura,
                facturaPDFUrl,
                facturaXMLUrl
            } = requestBody;

            // 1. Transformar la Recepción de Artículo (Item Receipt) a Factura de Proveedor (Vendor Bill)
            // Nota: Si facturan desde la Orden de Compra directo, cambia record.Type.ITEM_RECEIPT por record.Type.PURCHASE_ORDER
            const vendorBill = record.transform({
                fromType: record.Type.ITEM_RECEIPT,
                fromId: recepcionId,
                toType: record.Type.VENDOR_BILL,
                isDynamic: true
            });

            // 2. Setear campos obligatorios de México (Si tienes la Localización de LATAM instalada)
            // vendorBill.setValue({ fieldId: 'custbody_mx_cfdi_uuid', value: uuidFactura });

            // Setear el número de factura externa
            vendorBill.setValue({ fieldId: 'tranid', value: uuidFactura });

            // 3. Guardar en NetSuite
            const newBillId = vendorBill.save({
                enableSourcing: true,
                ignoreMandatoryFields: false
            });

            log.audit('Factura de proveedor creada exitosamente', newBillId);

            // 4. Devolver confirmación a AWS
            return {
                success: true,
                vendorBillId: newBillId,
                message: "Vendor Bill creado correctamente."
            };

        } catch (e) {
            log.error('Error al procesar Factura desde AWS', e);
            // Devolver el error a AWS para que no pierda la petición
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
