import PDFDocument from 'pdfkit';
import { IOrder } from '../types';

interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  taxId?: string;
}

const COMPANY_INFO: CompanyInfo = {
  name: 'OMS Trading LLC',
  address: 'Dubai, United Arab Emirates',
  phone: '+971 4 123 4567',
  email: 'info@oms-trading.com',
  taxId: 'TRN: 100123456789012'
};

export class PDFService {
  /**
   * Generate order invoice PDF
   */
  static async generateOrderPDF(order: IOrder): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          bufferPages: true
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });
        doc.on('error', reject);

        // Generate PDF content
        this.generateHeader(doc);
        this.generateOrderInfo(doc, order);
        this.generateCustomerInfo(doc, order);
        this.generateAddresses(doc, order);
        this.generateItemsTable(doc, order);
        this.generateTotals(doc, order);
        this.generateFooter(doc);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate delivery note PDF
   */
  static async generateDeliveryNotePDF(order: IOrder): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          bufferPages: true
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });
        doc.on('error', reject);

        // Generate delivery note content
        this.generateHeader(doc, 'DELIVERY NOTE');
        this.generateOrderInfo(doc, order);
        this.generateCustomerInfo(doc, order);
        this.generateAddresses(doc, order);
        this.generateDeliveryItemsTable(doc, order);
        this.generateDeliveryFooter(doc);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private static generateHeader(doc: PDFKit.PDFDocument, title: string = 'INVOICE') {
    // Company Logo placeholder (text for now)
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .fillColor('#1976d2')
       .text(COMPANY_INFO.name, 50, 50);

    // Company details
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#666')
       .text(COMPANY_INFO.address, 50, 80)
       .text(`Tel: ${COMPANY_INFO.phone}`, 50, 95)
       .text(`Email: ${COMPANY_INFO.email}`, 50, 110)
       .text(COMPANY_INFO.taxId || '', 50, 125);

    // Invoice title
    doc.fontSize(28)
       .font('Helvetica-Bold')
       .fillColor('#333')
       .text(title, 400, 50, { align: 'right' });

    // Horizontal line
    doc.moveTo(50, 150)
       .lineTo(545, 150)
       .strokeColor('#1976d2')
       .lineWidth(2)
       .stroke();

    doc.moveDown(2);
  }

  private static generateOrderInfo(doc: PDFKit.PDFDocument, order: IOrder) {
    const top = 170;

    // Order details box
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#333')
       .text('Order Number:', 50, top)
       .text('Date:', 50, top + 15)
       .text('Status:', 50, top + 30)
       .text('Payment Status:', 50, top + 45)
       .text('Payment Method:', 50, top + 60);

    doc.font('Helvetica')
       .text(order.orderNumber, 150, top)
       .text(new Date(order.createdAt).toLocaleDateString('en-GB', {
         day: '2-digit',
         month: 'short',
         year: 'numeric'
       }), 150, top + 15)
       .text(order.status.replace(/_/g, ' ').toUpperCase(), 150, top + 30)
       .text(order.paymentStatus.toUpperCase(), 150, top + 45)
       .text((order.paymentMethod || 'N/A').toUpperCase(), 150, top + 60);
  }

  private static generateCustomerInfo(doc: PDFKit.PDFDocument, order: IOrder) {
    const top = 170;

    // Customer details box
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#333')
       .text('Bill To:', 350, top);

    doc.font('Helvetica')
       .text(order.customerName, 350, top + 15)
       .text(`Code: ${order.customerCode}`, 350, top + 30);

    if (order.customerPhone) {
      doc.text(`Tel: ${order.customerPhone}`, 350, top + 45);
    }
    if (order.customerEmail) {
      doc.text(order.customerEmail, 350, top + 60);
    }
  }

  private static generateAddresses(doc: PDFKit.PDFDocument, order: IOrder) {
    const top = 260;

    // Billing Address
    if (order.billingAddress) {
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor('#333')
         .text('Billing Address:', 50, top);

      doc.font('Helvetica')
         .text(order.billingAddress.addressLine1 || '', 50, top + 15)
         .text(order.billingAddress.addressLine2 || '', 50, top + 30)
         .text(`${order.billingAddress.city || ''}, ${order.billingAddress.state || ''}`, 50, top + 45)
         .text(order.billingAddress.country || '', 50, top + 60);
    }

    // Shipping Address
    if (order.shippingAddress) {
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor('#333')
         .text('Shipping Address:', 350, top);

      doc.font('Helvetica')
         .text(order.shippingAddress.addressLine1 || '', 350, top + 15)
         .text(order.shippingAddress.addressLine2 || '', 350, top + 30)
         .text(`${order.shippingAddress.city || ''}, ${order.shippingAddress.state || ''}`, 350, top + 45)
         .text(order.shippingAddress.country || '', 350, top + 60);

      if (order.shippingAddress.contactPerson) {
        doc.text(`Contact: ${order.shippingAddress.contactPerson}`, 350, top + 75);
      }
    }
  }

  private static generateItemsTable(doc: PDFKit.PDFDocument, order: IOrder) {
    const tableTop = 360;
    const tableHeaders = ['#', 'Description', 'SKU', 'Qty', 'Unit Price', 'Tax', 'Total'];
    const columnWidths = [25, 150, 80, 40, 70, 60, 70];
    const columnPositions = [50, 75, 225, 305, 345, 415, 475];

    // Table header background
    doc.rect(50, tableTop, 495, 25)
       .fillColor('#1976d2')
       .fill();

    // Table headers
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .fillColor('#fff');

    tableHeaders.forEach((header, i) => {
      doc.text(header, columnPositions[i], tableTop + 8, {
        width: columnWidths[i],
        align: i > 2 ? 'right' : 'left'
      });
    });

    // Table rows
    let rowTop = tableTop + 30;
    doc.font('Helvetica').fillColor('#333');

    order.items.forEach((item: any, index: number) => {
      // Check if we need a new page
      if (rowTop > 700) {
        doc.addPage();
        rowTop = 50;
      }

      // Alternate row background
      if (index % 2 === 1) {
        doc.rect(50, rowTop - 5, 495, 25)
           .fillColor('#f5f5f5')
           .fill();
        doc.fillColor('#333');
      }

      doc.fontSize(9);
      doc.text((index + 1).toString(), columnPositions[0], rowTop, { width: columnWidths[0] });
      doc.text(`${item.name}\n${item.variantName} (${item.displaySize})`, columnPositions[1], rowTop, { width: columnWidths[1] });
      doc.text(item.variantSku, columnPositions[2], rowTop, { width: columnWidths[2] });
      doc.text(item.quantity.toString(), columnPositions[3], rowTop, { width: columnWidths[3], align: 'right' });
      doc.text(`AED ${item.unitPrice.toFixed(2)}`, columnPositions[4], rowTop, { width: columnWidths[4], align: 'right' });
      doc.text(`AED ${item.taxAmount.toFixed(2)}`, columnPositions[5], rowTop, { width: columnWidths[5], align: 'right' });
      doc.text(`AED ${item.lineTotal.toFixed(2)}`, columnPositions[6], rowTop, { width: columnWidths[6], align: 'right' });

      rowTop += 30;
    });

    // Table border
    doc.rect(50, tableTop, 495, rowTop - tableTop)
       .strokeColor('#ddd')
       .lineWidth(1)
       .stroke();

    return rowTop;
  }

  private static generateDeliveryItemsTable(doc: PDFKit.PDFDocument, order: IOrder) {
    const tableTop = 360;
    const tableHeaders = ['#', 'Description', 'SKU', 'Quantity', 'Received', 'Remarks'];
    const columnWidths = [25, 180, 100, 60, 60, 70];
    const columnPositions = [50, 75, 255, 355, 415, 475];

    // Table header background
    doc.rect(50, tableTop, 495, 25)
       .fillColor('#1976d2')
       .fill();

    // Table headers
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .fillColor('#fff');

    tableHeaders.forEach((header, i) => {
      doc.text(header, columnPositions[i], tableTop + 8, {
        width: columnWidths[i],
        align: i > 2 ? 'center' : 'left'
      });
    });

    // Table rows
    let rowTop = tableTop + 30;
    doc.font('Helvetica').fillColor('#333');

    order.items.forEach((item: any, index: number) => {
      if (rowTop > 700) {
        doc.addPage();
        rowTop = 50;
      }

      if (index % 2 === 1) {
        doc.rect(50, rowTop - 5, 495, 25)
           .fillColor('#f5f5f5')
           .fill();
        doc.fillColor('#333');
      }

      doc.fontSize(9);
      doc.text((index + 1).toString(), columnPositions[0], rowTop, { width: columnWidths[0] });
      doc.text(`${item.name}\n${item.variantName} (${item.displaySize})`, columnPositions[1], rowTop, { width: columnWidths[1] });
      doc.text(item.variantSku, columnPositions[2], rowTop, { width: columnWidths[2] });
      doc.text(item.quantity.toString(), columnPositions[3], rowTop, { width: columnWidths[3], align: 'center' });
      // Empty boxes for received and remarks
      doc.rect(columnPositions[4] + 15, rowTop - 2, 30, 15).stroke();
      doc.rect(columnPositions[5], rowTop - 2, 65, 15).stroke();

      rowTop += 30;
    });

    doc.rect(50, tableTop, 495, rowTop - tableTop)
       .strokeColor('#ddd')
       .lineWidth(1)
       .stroke();

    return rowTop;
  }

  private static generateTotals(doc: PDFKit.PDFDocument, order: IOrder) {
    const totalsTop = doc.y + 20;

    // Totals box
    const boxX = 350;
    const boxWidth = 195;

    doc.rect(boxX, totalsTop, boxWidth, 120)
       .strokeColor('#ddd')
       .lineWidth(1)
       .stroke();

    const labels = ['Subtotal:', 'Discount:', 'Tax:', 'Shipping:', 'Grand Total:'];
    const values = [
      order.pricing.subtotal,
      order.pricing.itemDiscountTotal + (order.pricing.orderDiscount?.amount || 0),
      order.pricing.taxTotal,
      order.pricing.shippingCharge,
      order.pricing.grandTotal
    ];

    let y = totalsTop + 10;
    labels.forEach((label, i) => {
      const isGrandTotal = i === labels.length - 1;

      doc.fontSize(10)
         .font(isGrandTotal ? 'Helvetica-Bold' : 'Helvetica')
         .fillColor(isGrandTotal ? '#1976d2' : '#333')
         .text(label, boxX + 10, y)
         .text(`AED ${values[i].toFixed(2)}`, boxX + 100, y, { width: 85, align: 'right' });

      if (isGrandTotal) {
        doc.moveTo(boxX, y - 5)
           .lineTo(boxX + boxWidth, y - 5)
           .strokeColor('#ddd')
           .stroke();
      }

      y += 20;
    });

    // Payment info if partially paid
    if (order.paidAmount > 0 && order.balanceDue > 0) {
      doc.fontSize(10)
         .font('Helvetica')
         .fillColor('#2e7d32')
         .text('Paid:', boxX + 10, y)
         .text(`AED ${order.paidAmount.toFixed(2)}`, boxX + 100, y, { width: 85, align: 'right' });

      y += 20;
      doc.fillColor('#d32f2f')
         .text('Balance Due:', boxX + 10, y)
         .text(`AED ${order.balanceDue.toFixed(2)}`, boxX + 100, y, { width: 85, align: 'right' });
    }
  }

  private static generateFooter(doc: PDFKit.PDFDocument) {
    const footerTop = 720;

    // Terms and conditions
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#666')
       .text('Terms & Conditions:', 50, footerTop)
       .text('1. Payment is due within 30 days unless otherwise specified.', 50, footerTop + 12)
       .text('2. Goods remain property of seller until payment is received.', 50, footerTop + 24)
       .text('3. Returns accepted within 7 days with original packaging.', 50, footerTop + 36);

    // Thank you message
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#1976d2')
       .text('Thank you for your business!', 50, footerTop + 55, { align: 'center' });

    // Footer line
    doc.moveTo(50, 780)
       .lineTo(545, 780)
       .strokeColor('#ddd')
       .lineWidth(1)
       .stroke();

    // Page number
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#999')
       .text(`Generated on ${new Date().toLocaleString()}`, 50, 785, { align: 'center' });
  }

  private static generateDeliveryFooter(doc: PDFKit.PDFDocument) {
    const footerTop = 680;

    // Signature boxes
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#333')
       .text('Delivered By:', 50, footerTop)
       .text('Received By:', 300, footerTop);

    // Signature lines
    doc.moveTo(50, footerTop + 50)
       .lineTo(200, footerTop + 50)
       .strokeColor('#333')
       .stroke();

    doc.moveTo(300, footerTop + 50)
       .lineTo(450, footerTop + 50)
       .stroke();

    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#666')
       .text('Name:', 50, footerTop + 55)
       .text('Date:', 50, footerTop + 70)
       .text('Signature:', 50, footerTop + 85)
       .text('Name:', 300, footerTop + 55)
       .text('Date:', 300, footerTop + 70)
       .text('Signature:', 300, footerTop + 85);

    // Notes section
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .fillColor('#333')
       .text('Notes:', 50, footerTop + 110);

    doc.rect(50, footerTop + 125, 495, 40)
       .strokeColor('#ddd')
       .stroke();

    // Footer line
    doc.moveTo(50, 780)
       .lineTo(545, 780)
       .strokeColor('#ddd')
       .lineWidth(1)
       .stroke();

    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#999')
       .text(`Generated on ${new Date().toLocaleString()}`, 50, 785, { align: 'center' });
  }
}
