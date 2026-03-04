import PDFDocument from 'pdfkit';
import { IOrder } from '../types';

interface CompanyInfo {
  name: string;
  nameAr?: string;
  tagline?: string;
  officeWarehouseNo?: string;
  address: string;
  plot?: string;
  poBox: string;
  tel: string;
  fax?: string;
  email: string;
  trn: string;
}

const COMPANY_INFO: CompanyInfo = {
  name: 'LAUREL SHINE TRADING LLC',
  tagline: 'Deals in all kinds of foodstuff',
  officeWarehouseNo: '9',
  address: 'Ind. Area Al Jurf-2',
  plot: '993 0959',
  poBox: 'P.O.Box 48099 Ajman - U.A.E.',
  tel: '+971-67444498',
  fax: '+971 6 7443297',
  email: 'laurelshinetrading@gmail.com',
  trn: '100356686000003',
};

/** Convert number to words for AED (e.g. 253260 -> "UAE Dirham Two Hundred Fifty Three Thousand Two Hundred Sixty") */
function amountInWordsAED(n: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  function toWords(num: number): string {
    if (num === 0) return '';
    if (num < 10) return ones[num];
    if (num < 20) return teens[num - 10];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + toWords(num % 100) : '');
    if (num < 1000000) return toWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + toWords(num % 1000) : '');
    if (num < 1000000000) return toWords(Math.floor(num / 1000000)) + ' Million' + (num % 1000000 ? ' ' + toWords(num % 1000000) : '');
    return toWords(Math.floor(num / 1000000000)) + ' Billion' + (num % 1000000000 ? ' ' + toWords(num % 1000000000) : '');
  }

  const intPart = Math.floor(n);
  const decPart = Math.round((n - intPart) * 100);
  let s = 'UAE Dirham ' + (intPart === 0 ? 'Zero' : toWords(intPart));
  if (decPart > 0) s += ' and ' + (decPart < 10 ? ones[decPart] : toWords(decPart)) + ' Fils';
  return s + '.';
}

export class PDFService {
  static async generateOrderPDF(order: IOrder): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        // Normalize for backward compatibility with old orders (missing or partial pricing/items)
        const safeOrder = this.normalizeOrderForPDF(order);

        const doc = new PDFDocument({
          size: 'A4',
          margin: 36,
          bufferPages: true,
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        this.generateTaxInvoiceHeader(doc, safeOrder);
        this.generateBillToShipTo(doc, safeOrder);
        const tableBottom = this.generateTaxInvoiceItemsTable(doc, safeOrder);
        const totalsBottom = this.generateTaxInvoiceTotals(doc, safeOrder, tableBottom);
        this.generateTaxInvoiceFooter(doc, safeOrder, totalsBottom);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /** Ensure order has required fields for PDF; safe for old/incomplete orders */
  private static normalizeOrderForPDF(order: IOrder): IOrder {
    const items = Array.isArray(order.items) ? order.items : [];
    const pricing = order.pricing || ({} as IOrder['pricing']);
    const subtotal = Number(pricing.subtotal) || 0;
    const taxTotal = Number(pricing.taxTotal) || 0;
    const grandTotal = Number(pricing.grandTotal) || 0;
    const orderDiscountAmount = pricing.orderDiscount?.amount != null ? Number(pricing.orderDiscount.amount) : 0;
    const itemDiscountTotal = Number(pricing.itemDiscountTotal) || 0;
    // Derive totals if missing on old orders
    const itemsTotal = items.reduce((sum: number, i: any) => sum + (Number(i.lineTotal) || 0), 0);
    const derivedGrandTotal = grandTotal > 0 ? grandTotal : itemsTotal || subtotal || 0;
    const derivedSubtotal = subtotal > 0 ? subtotal : Math.max(0, derivedGrandTotal - taxTotal);
    const derivedTaxTotal = taxTotal >= 0 ? taxTotal : Math.max(0, derivedGrandTotal - derivedSubtotal);

    return {
      ...order,
      createdAt: order.createdAt || new Date(),
      items,
      pricing: {
        ...pricing,
        subtotal: derivedSubtotal,
        itemDiscountTotal,
        taxTotal: derivedTaxTotal,
        grandTotal: derivedGrandTotal,
        orderDiscount: orderDiscountAmount > 0 ? { ...pricing.orderDiscount, amount: orderDiscountAmount } : pricing.orderDiscount,
        shippingCharge: Number(pricing.shippingCharge) || 0,
      },
      billingAddress: order.billingAddress || ({} as IOrder['billingAddress']),
      shippingAddress: order.shippingAddress ?? order.billingAddress ?? ({} as IOrder['shippingAddress']),
    } as IOrder;
  }

  /** Tax Invoice style header: company left, TAX INVOICE + Inv No/Date right (compact, like reference) */
  private static generateTaxInvoiceHeader(doc: PDFKit.PDFDocument, order: IOrder) {
    const left = 50;
    const right = 320;
    const lineHeight = 9;

    doc.fontSize(11).font('Helvetica-Bold').fillColor('#000');
    doc.text(COMPANY_INFO.name, left, 38);
    if (COMPANY_INFO.tagline) {
      doc.fontSize(7).font('Helvetica').fillColor('#444').text(COMPANY_INFO.tagline, left, 48);
    }

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('TAX INVOICE', right, 38, { width: 230, align: 'right' });

    doc.fontSize(7).font('Helvetica').fillColor('#333');
    let y = 56;
    if (COMPANY_INFO.officeWarehouseNo) doc.text(`Office & Warehouse No.: ${COMPANY_INFO.officeWarehouseNo}`, left, y), (y += lineHeight);
    doc.text(`${COMPANY_INFO.address}${COMPANY_INFO.plot ? `, Plot: ${COMPANY_INFO.plot}` : ''}`, left, y), (y += lineHeight);
    doc.text(COMPANY_INFO.poBox, left, y), (y += lineHeight);
    doc.text(`Tel.: ${COMPANY_INFO.tel}`, left, y), (y += lineHeight);
    if (COMPANY_INFO.fax) doc.text(`Fax: ${COMPANY_INFO.fax}`, left, y), (y += lineHeight);
    doc.text(`Email: ${COMPANY_INFO.email}`, left, y), (y += lineHeight);
    doc.text(`TRN: ${COMPANY_INFO.trn}`, left, y);

    const invNumber = order.creditInfo?.invoiceNumber || `INV-${order.orderNumber}`;
    const invDate = new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
    doc.fontSize(7).font('Helvetica-Bold').text('INV. NO.:', right, 56).font('Helvetica').text(invNumber, right + 50, 56);
    doc.font('Helvetica-Bold').text('Date:', right, 65).font('Helvetica').text(invDate, right + 50, 65);

    doc.moveTo(50, 118).lineTo(545, 118).strokeColor('#333').lineWidth(0.5).stroke();
  }

  /** Bill To (left) and Ship to / Deliver to (right) */
  private static generateBillToShipTo(doc: PDFKit.PDFDocument, order: IOrder) {
    const left = 50;
    const right = 300;
    const top = 125;
    const row = 10;

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#333');
    doc.text('Bill To', left, top);
    doc.text('Ship to / Deliver to', right, top);

    const billAddr = order.billingAddress;
    const shipAddr = order.shippingAddress || order.billingAddress;
    const cityState = (a: typeof billAddr) => [a?.city, a?.state].filter(Boolean).join(' / ') || '';
    const countryLine = (a: typeof billAddr) => (a?.country || 'UAE');

    doc.font('Helvetica').fontSize(7).fillColor('#000');
    doc.text('Cus. Code:', left, top + row).text(order.customerCode, left + 58, top + row);
    doc.text('TRN:', left, top + row * 2).text((order as any).customerTrn || '—', left + 58, top + row * 2);
    doc.text('M/s.:', left, top + row * 3).text((order.customerName || '') + ((order as any).paymentStatus === 'pending' ? ' (Dr)' : ''), left + 58, top + row * 3, { width: 220 });
    doc.text('Address:', left, top + row * 4).text(billAddr?.addressLine1 || '—', left + 58, top + row * 4, { width: 220 });
    doc.text('Emirates / Country:', left, top + row * 5).text(`${cityState || '—'} / ${countryLine(billAddr)}`, left + 58, top + row * 5, { width: 220 });

    doc.text('Cus. Code:', right, top + row).text(order.customerCode, right + 58, top + row);
    doc.text('M/s.:', right, top + row * 2).text(order.customerName, right + 58, top + row * 2, { width: 185 });
    doc.text('Address:', right, top + row * 3).text(shipAddr?.addressLine1 || '—', right + 58, top + row * 3, { width: 185 });
    doc.text('Emirates / Country:', right, top + row * 4).text(`${cityState(shipAddr) || '—'} / ${countryLine(shipAddr)}`, right + 58, top + row * 4, { width: 185 });

    doc.moveTo(50, top + row * 6 + 2).lineTo(545, top + row * 6 + 2).strokeColor('#333').lineWidth(0.5).stroke();
  }

  /** Items table: Sr. No., Item Description, Quantity, Unit, Rate, Amount */
  private static generateTaxInvoiceItemsTable(doc: PDFKit.PDFDocument, order: IOrder): number {
    const tableTop = 218;
    const col = {
      sr: 50,
      desc: 75,
      qty: 320,
      unit: 380,
      rate: 430,
      amount: 495,
    };
    const w = { sr: 22, desc: 240, qty: 55, unit: 45, rate: 62, amount: 55 };
    const rowHeight = 14;

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000');
    doc.text('Sr. No.', col.sr, tableTop + 4);
    doc.text('Item Description', col.desc, tableTop + 4);
    doc.text('Quantity', col.qty, tableTop + 4, { width: w.qty, align: 'right' });
    doc.text('Unit', col.unit, tableTop + 4, { width: w.unit, align: 'center' });
    doc.text('Rate', col.rate, tableTop + 4, { width: w.rate, align: 'right' });
    doc.text('Amount', col.amount, tableTop + 4, { width: w.amount, align: 'right' });

    doc.moveTo(50, tableTop).lineTo(545, tableTop).stroke();
    doc.moveTo(50, tableTop + 18).lineTo(545, tableTop + 18).stroke();

    let rowTop = tableTop + 22;
    doc.font('Helvetica').fontSize(7).fillColor('#333');

    (order.items || []).forEach((item: any, index: number) => {
      if (rowTop > 700) {
        doc.addPage();
        rowTop = 50;
      }
      const desc = `${item.name || ''} ${item.variantName ? `[${item.displaySize || ''}]` : ''}`.trim() || item.variantSku || '—';
      const unit = item.sellBy === 'pcs' ? 'pcs' : 'unit';
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      const lineTotal = Number(item.lineTotal) || qty * unitPrice;
      doc.text((index + 1).toString(), col.sr, rowTop);
      doc.text(desc, col.desc, rowTop, { width: w.desc });
      doc.text(String(qty), col.qty, rowTop, { width: w.qty, align: 'right' });
      doc.text(unit, col.unit, rowTop, { width: w.unit, align: 'center' });
      doc.text(unitPrice.toFixed(2), col.rate, rowTop, { width: w.rate, align: 'right' });
      doc.text(lineTotal.toFixed(2), col.amount, rowTop, { width: w.amount, align: 'right' });
      rowTop += rowHeight;
    });

    doc.moveTo(50, rowTop).lineTo(545, rowTop).stroke();
    return rowTop;
  }

  /** Totals: Discount, Total before VAT, VAT Amount, Grand Total AED, Grand Total in Words. Returns y after block. */
  private static generateTaxInvoiceTotals(doc: PDFKit.PDFDocument, order: IOrder, tableBottom: number): number {
    const p = order.pricing || ({} as any);
    const discount = Number(p.orderDiscount?.amount) || 0;
    const itemDiscount = Number(p.itemDiscountTotal) || 0;
    const subtotal = Number(p.subtotal) || 0;
    const taxTotal = Number(p.taxTotal) || 0;
    const grandTotal = Number(p.grandTotal) || 0;

    const boxLeft = 320;
    const labelWidth = 180;
    const valueLeft = boxLeft + labelWidth + 10;
    const lineH = 10;
    let y = tableBottom + 10;

    doc.fontSize(7).font('Helvetica').fillColor('#333');
    doc.text('Discount:', boxLeft, y);
    doc.text(discount.toFixed(2), valueLeft, y, { width: 45, align: 'right' });
    y += lineH;

    doc.text('Total Amount before Vat (Round off):', boxLeft, y);
    const beforeVat = Math.max(0, subtotal - discount - itemDiscount);
    doc.text(beforeVat.toFixed(2), valueLeft, y, { width: 45, align: 'right' });
    y += lineH;

    doc.text('VAT Amount:', boxLeft, y);
    doc.text(taxTotal.toFixed(2), valueLeft, y, { width: 45, align: 'right' });
    y += lineH;

    doc.font('Helvetica-Bold').fontSize(8);
    doc.text('Grand Total AED:', boxLeft, y);
    doc.text(grandTotal.toFixed(2), valueLeft, y, { width: 45, align: 'right' });
    y += lineH;

    doc.font('Helvetica').fontSize(7);
    const words = amountInWordsAED(grandTotal);
    doc.text('Grand Total In Words (AED):', boxLeft, y);
    doc.text(words, boxLeft, y + 8, { width: 225 });
    return y + 20;
  }

  /** Footer: Prepared/Checked/Authorised By, Customer Receipt, Terms, Payment Terms, Previous Balance, Payment instruction */
  private static generateTaxInvoiceFooter(doc: PDFKit.PDFDocument, order: IOrder, afterTotalsY: number) {
    const left = 50;
    const right = 300;
    let y = Math.max(afterTotalsY + 12, 380);
    const lineH = 8;

    doc.fontSize(7).font('Helvetica-Bold').fillColor('#333');
    doc.text('Prepared By:', left, y);
    doc.moveTo(left + 62, y + 9).lineTo(left + 165, y + 9).stroke();
    doc.text('Checked By:', left + 185, y);
    doc.moveTo(left + 252, y + 9).lineTo(left + 355, y + 9).stroke();
    doc.text('Authorised By:', left + 375, y);
    doc.moveTo(left + 445, y + 9).lineTo(545, y + 9).stroke();

    y += 38;
    doc.fontSize(7).font('Helvetica-Bold').text('CUSTOMER RECEIPT', right, y);
    doc.font('Helvetica').fontSize(7);
    doc.text('Name:', right, y + 10);
    doc.text('Designation:', right, y + 20);
    doc.text('Signature:', right, y + 30);
    doc.text('Date:', right, y + 40);
    doc.text('Stamp:', right, y + 50);
    doc.moveTo(right + 38, y + 10).lineTo(right + 220, y + 10).stroke();
    doc.moveTo(right + 38, y + 20).lineTo(right + 220, y + 20).stroke();
    doc.moveTo(right + 38, y + 30).lineTo(right + 220, y + 30).stroke();
    doc.moveTo(right + 38, y + 40).lineTo(right + 220, y + 40).stroke();
    doc.moveTo(right + 38, y + 50).lineTo(right + 220, y + 50).stroke();

    const termsY = Math.max(afterTotalsY + 12, 380);
    doc.fontSize(7).font('Helvetica').fillColor('#333');
    doc.text('Terms & Conditions:', left, termsY + 42);
    doc.text('1. Invoices are not to be altered. A separate credit note will be issued if appropriate and mutually agreed.', left, termsY + 50, { width: 250 });
    doc.text('2. Received the goods in good condition.', left, termsY + 59, { width: 250 });

    let fy = termsY + 78;
    doc.text('Sales Rep.:', left, fy);
    doc.text('Delivery Order No.:', left, fy + lineH);
    doc.text('Sale Order No.:', left, fy + lineH * 2);
    doc.text('Sale Order Date:', left, fy + lineH * 3);
    doc.text('LPO Number:', left, fy + lineH * 4);
    doc.text('LPO Date:', left, fy + lineH * 5);
    doc.text('Payment Terms:', left, fy + lineH * 6);
    const paymentMethod = (order as any).paymentMethod ?? order.paymentStatus;
    doc.text(paymentMethod === 'cod' ? 'Cash' : (paymentMethod || '—').toString().replace(/_/g, ' '), left + 72, fy + lineH * 6);
    doc.text('Previous Balance:', left, fy + lineH * 7);
    const balanceDue = Number((order as any).balanceDue) || 0;
    doc.text(balanceDue > 0 ? balanceDue.toFixed(2) : '0.00', left + 72, fy + lineH * 7);

    doc.font('Helvetica-Bold').fontSize(7);
    doc.text('Draw the Cheques in favour of "Laurel Shine Trading L.L.C." & Obtain an Official Receipt for Cash Payment.', left, fy + lineH * 9, { width: 500 });
  }

  /** Legacy header (for delivery note) */
  private static generateHeader(doc: PDFKit.PDFDocument, title: string = 'INVOICE') {
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#000').text(COMPANY_INFO.name, 50, 50);
    doc.fontSize(10).font('Helvetica').fillColor('#666');
    doc.text(COMPANY_INFO.address, 50, 75);
    doc.text(`Tel: ${COMPANY_INFO.tel}`, 50, 90);
    doc.text(`Email: ${COMPANY_INFO.email}`, 50, 105);
    doc.text(`TRN: ${COMPANY_INFO.trn}`, 50, 120);
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#333').text(title, 400, 50, { align: 'right' });
    doc.moveTo(50, 140).lineTo(545, 140).strokeColor('#333').lineWidth(0.5).stroke();
  }

  private static generateOrderInfo(doc: PDFKit.PDFDocument, order: IOrder) {
    const top = 155;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#333');
    doc.text('Order Number:', 50, top).text('Date:', 50, top + 15).text('Status:', 50, top + 30).text('Payment:', 50, top + 45);
    doc.font('Helvetica');
    doc.text(order.orderNumber, 130, top);
    doc.text(new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), 130, top + 15);
    doc.text(order.status.replace(/_/g, ' ').toUpperCase(), 130, top + 30);
    doc.text((order.paymentMethod || order.paymentStatus || '—').toString().replace(/_/g, ' '), 130, top + 45);
  }

  private static generateCustomerInfo(doc: PDFKit.PDFDocument, order: IOrder) {
    const top = 155;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#333').text('Bill To:', 350, top);
    doc.font('Helvetica').text(order.customerName, 350, top + 15).text(`Code: ${order.customerCode}`, 350, top + 30);
    if (order.customerPhone) doc.text(`Tel: ${order.customerPhone}`, 350, top + 45);
    if (order.customerEmail) doc.text(order.customerEmail, 350, top + 60);
  }

  private static generateAddresses(doc: PDFKit.PDFDocument, order: IOrder) {
    const top = 260;
    if (order.billingAddress) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#333').text('Billing Address:', 50, top);
      doc.font('Helvetica');
      doc.text(order.billingAddress.addressLine1 || '', 50, top + 15).text(order.billingAddress.addressLine2 || '', 50, top + 30);
      doc.text(`${order.billingAddress.city || ''}, ${order.billingAddress.state || ''}`, 50, top + 45).text(order.billingAddress.country || '', 50, top + 60);
    }
    if (order.shippingAddress) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#333').text('Shipping Address:', 350, top);
      doc.font('Helvetica');
      doc.text(order.shippingAddress.addressLine1 || '', 350, top + 15).text(order.shippingAddress.addressLine2 || '', 350, top + 30);
      doc.text(`${order.shippingAddress.city || ''}, ${order.shippingAddress.state || ''}`, 350, top + 45).text(order.shippingAddress.country || '', 350, top + 60);
    }
  }

  static async generateDeliveryNotePDF(order: IOrder): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);
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

  private static generateDeliveryItemsTable(doc: PDFKit.PDFDocument, order: IOrder) {
    const tableTop = 360;
    const columnPositions = [50, 75, 255, 355, 415, 475];
    const columnWidths = [25, 180, 100, 60, 60, 70];
    doc.rect(50, tableTop, 495, 25).fillColor('#333').fill();
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff');
    ['#', 'Description', 'SKU', 'Quantity', 'Received', 'Remarks'].forEach((h, i) => doc.text(h, columnPositions[i], tableTop + 8, { width: columnWidths[i], align: i > 2 ? 'center' : 'left' }));
    let rowTop = tableTop + 30;
    doc.font('Helvetica').fillColor('#333');
    order.items.forEach((item: any, index: number) => {
      doc.fontSize(9);
      doc.text((index + 1).toString(), columnPositions[0], rowTop);
      doc.text(`${item.name} ${item.variantName} (${item.displaySize})`, columnPositions[1], rowTop, { width: columnWidths[1] });
      doc.text(item.variantSku, columnPositions[2], rowTop);
      doc.text(item.quantity.toString(), columnPositions[3], rowTop, { width: columnWidths[3], align: 'center' });
      doc.rect(columnPositions[4] + 15, rowTop - 2, 30, 15).stroke();
      doc.rect(columnPositions[5], rowTop - 2, 65, 15).stroke();
      rowTop += 30;
    });
    doc.rect(50, tableTop, 495, rowTop - tableTop).strokeColor('#ddd').lineWidth(1).stroke();
    return rowTop;
  }

  private static generateDeliveryFooter(doc: PDFKit.PDFDocument) {
    const footerTop = 680;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#333').text('Delivered By:', 50, footerTop).text('Received By:', 300, footerTop);
    doc.moveTo(50, footerTop + 50).lineTo(200, footerTop + 50).stroke();
    doc.moveTo(300, footerTop + 50).lineTo(450, footerTop + 50).stroke();
    doc.fontSize(8).font('Helvetica').fillColor('#666').text('Name / Date / Signature', 50, footerTop + 55).text('Name / Date / Signature', 300, footerTop + 55);
    doc.moveTo(50, 780).lineTo(545, 780).strokeColor('#ddd').stroke();
    doc.fontSize(8).text(`Generated on ${new Date().toLocaleString()}`, 50, 785, { width: 495, align: 'center' });
  }
}
