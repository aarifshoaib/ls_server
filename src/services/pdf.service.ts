import PDFDocument from 'pdfkit';
import { IOrder } from '../types';
import { roundToTwo } from '../utils/helpers';

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

function pdfSafeString(v: unknown, fallback: string): string {
  if (v == null) return fallback;
  const s = String(v).trim();
  if (s === '' || s === 'undefined') return fallback;
  return s;
}

/** City / state and country for invoice address lines (no stray "undefined", no function-to-string bugs). */
function formatEmiratesCountry(a: IOrder['billingAddress'] | undefined | null): string {
  if (!a) return '—';
  const city = a.city != null ? String(a.city).trim() : '';
  const state = a.state != null ? String(a.state).trim() : '';
  const emirate = [city, state].filter(Boolean).join(' / ');
  const country = a.country != null && String(a.country).trim() !== '' ? String(a.country).trim() : 'UAE';
  if (emirate) return `${emirate} / ${country}`;
  return country;
}

/** Invoice no. shown on PDF — tolerates bad stored values like "INV-undefined". */
function invoiceNumberForPdf(order: IOrder): string {
  const orderNo = pdfSafeString(order.orderNumber, '');
  const raw = order.creditInfo?.invoiceNumber;
  let fromStored = raw != null && raw !== undefined ? String(raw).trim() : '';
  if (fromStored === '' || fromStored === 'undefined' || /undefined/i.test(fromStored)) {
    fromStored = '';
  }
  if (fromStored) return fromStored;
  if (orderNo) return `INV-${orderNo}`;
  const id = (order as any)._id != null ? String((order as any)._id) : '';
  const tail = id.replace(/[^a-fA-F0-9]/g, '').slice(-10);
  if (tail) return `INV-${tail}`;
  return 'INV';
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

  /**
   * Mongoose documents do not spread/copy with `{ ...doc }` — PDF would lose orderNumber, pricing, creditInfo, etc.
   * Always convert to a plain object first.
   */
  private static orderDocumentToPlain(order: IOrder): IOrder {
    const anyDoc = order as any;
    if (anyDoc != null && typeof anyDoc.toObject === 'function') {
      return anyDoc.toObject({ flattenMaps: true }) as IOrder;
    }
    return order;
  }

  /** Ensure order has required fields for PDF; safe for old/incomplete orders */
  private static normalizeOrderForPDF(order: IOrder): IOrder {
    const base = PDFService.orderDocumentToPlain(order);
    const items = Array.isArray(base.items) ? base.items : [];
    const pricing = base.pricing || ({} as IOrder['pricing']);
    const subtotal = Number(pricing.subtotal) || 0;
    const taxTotal = Number(pricing.taxTotal) || 0;
    const grandTotal = Number(pricing.grandTotal) || 0;
    const orderDiscountAmount = pricing.orderDiscount?.amount != null ? Number(pricing.orderDiscount.amount) : 0;
    const itemDiscountTotal = Number(pricing.itemDiscountTotal) || 0;
    const customerDiscountTotal = Number(pricing.customerDiscountTotal) || 0;
    const shippingDiscount = Number(pricing.shippingDiscount) || 0;
    const roundingAdjustment = Number(pricing.roundingAdjustment) || 0;
    // Derive totals if missing on old orders
    const itemsTotal = items.reduce((sum: number, i: any) => sum + (Number(i.lineTotal) || 0), 0);
    const derivedGrandTotal = grandTotal > 0 ? grandTotal : itemsTotal || subtotal || 0;
    const derivedSubtotal = subtotal > 0 ? subtotal : Math.max(0, derivedGrandTotal - taxTotal);
    const derivedTaxTotal = taxTotal >= 0 ? taxTotal : Math.max(0, derivedGrandTotal - derivedSubtotal);

    const orderDiscountMeta =
      pricing.orderDiscount && (orderDiscountAmount > 0 || pricing.orderDiscount.type)
        ? { ...pricing.orderDiscount, amount: orderDiscountAmount }
        : pricing.orderDiscount;

    return {
      ...base,
      createdAt: base.createdAt || new Date(),
      items,
      pricing: {
        ...pricing,
        subtotal: derivedSubtotal,
        itemDiscountTotal,
        customerDiscountTotal,
        taxTotal: derivedTaxTotal,
        grandTotal: derivedGrandTotal,
        orderDiscount: orderDiscountMeta,
        shippingCharge: Number(pricing.shippingCharge) || 0,
        shippingDiscount,
        roundingAdjustment,
      },
      billingAddress: base.billingAddress || ({} as IOrder['billingAddress']),
      shippingAddress: base.shippingAddress ?? base.billingAddress ?? ({} as IOrder['shippingAddress']),
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

    const invNumber = invoiceNumberForPdf(order);
    const invDate = new Date(order.createdAt || Date.now()).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
    });
    const invLabelW = 52;
    const invValueW = 230 - invLabelW;
    doc.fontSize(7).font('Helvetica-Bold').text('INV. NO.:', right, 56, { width: invLabelW, align: 'left' });
    doc.font('Helvetica').text(invNumber, right + invLabelW, 56, { width: invValueW, align: 'right' });
    doc.font('Helvetica-Bold').text('Date:', right, 65, { width: invLabelW, align: 'left' });
    doc.font('Helvetica').text(invDate, right + invLabelW, 65, { width: invValueW, align: 'right' });

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

    doc.font('Helvetica').fontSize(7).fillColor('#000');
    doc.text('Cus. Code:', left, top + row).text(pdfSafeString(order.customerCode, '—'), left + 58, top + row);
    doc.text('TRN:', left, top + row * 2).text((order as any).customerTrn || '—', left + 58, top + row * 2);
    doc.text('M/s.:', left, top + row * 3).text((order.customerName || '') + ((order as any).paymentStatus === 'pending' ? ' (Dr)' : ''), left + 58, top + row * 3, { width: 220 });
    doc.text('Address:', left, top + row * 4).text(billAddr?.addressLine1 || '—', left + 58, top + row * 4, { width: 220 });
    doc.text('Emirates / Country:', left, top + row * 5).text(formatEmiratesCountry(billAddr), left + 58, top + row * 5, { width: 220 });

    doc.text('Cus. Code:', right, top + row).text(pdfSafeString(order.customerCode, '—'), right + 58, top + row);
    doc.text('M/s.:', right, top + row * 2).text(order.customerName, right + 58, top + row * 2, { width: 185 });
    doc.text('Address:', right, top + row * 3).text(shipAddr?.addressLine1 || '—', right + 58, top + row * 3, { width: 185 });
    doc.text('Emirates / Country:', right, top + row * 4).text(formatEmiratesCountry(shipAddr), right + 58, top + row * 4, { width: 185 });

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
      const rawLineTotal = item.lineTotal;
      let amount: number;
      if (rawLineTotal != null && rawLineTotal !== '' && Number.isFinite(Number(rawLineTotal))) {
        amount = roundToTwo(Number(rawLineTotal));
      } else {
        amount = qty > 0 && unitPrice > 0 ? roundToTwo(qty * unitPrice) : 0;
      }
      const rateDisplay = qty > 0 ? roundToTwo(amount / qty) : unitPrice;
      doc.text((index + 1).toString(), col.sr, rowTop);
      doc.text(desc, col.desc, rowTop, { width: w.desc });
      doc.text(String(qty), col.qty, rowTop, { width: w.qty, align: 'right' });
      doc.text(unit, col.unit, rowTop, { width: w.unit, align: 'center' });
      doc.text(rateDisplay.toFixed(2), col.rate, rowTop, { width: w.rate, align: 'right' });
      doc.text(amount.toFixed(2), col.amount, rowTop, { width: w.amount, align: 'right' });
      rowTop += rowHeight;
    });

    doc.moveTo(50, rowTop).lineTo(545, rowTop).stroke();
    return rowTop;
  }

  /** Totals: merchandise subtotal, discounts, net before VAT (sum of line amounts ex VAT), VAT, shipping, grand total. */
  private static generateTaxInvoiceTotals(doc: PDFKit.PDFDocument, order: IOrder, tableBottom: number): number {
    const p = order.pricing || ({} as any);
    const items = order.items || [];
    const orderDiscAmt = Number(p.orderDiscount?.amount) || 0;
    const itemDiscount = Number(p.itemDiscountTotal) || 0;
    const customerDisc = Number(p.customerDiscountTotal) || 0;
    const subtotal = Number(p.subtotal) || 0;
    const taxTotal = Number(p.taxTotal) || 0;
    const shippingCharge = Number(p.shippingCharge) || 0;
    const shippingDisc = Number(p.shippingDiscount) || 0;
    const roundingAdj = Number(p.roundingAdjustment) || 0;
    const grandTotal = Number(p.grandTotal) || 0;

    const sumLineNet = roundToTwo(items.reduce((s: number, i: any) => s + (Number(i.lineTotal) || 0), 0));
    const composedNet = roundToTwo(Math.max(0, subtotal - itemDiscount - customerDisc - orderDiscAmt));
    const beforeVat = items.length > 0 ? sumLineNet : composedNet;

    const od = p.orderDiscount as { type?: string; value?: number; amount?: number } | undefined;
    let orderDiscountLabel = 'Order discount:';
    if (od?.type === 'percent' && od.value != null && orderDiscAmt > 0.005) {
      orderDiscountLabel = `Order discount (${Number(od.value)}%):`;
    } else if (od?.type === 'fixed' && orderDiscAmt > 0.005) {
      orderDiscountLabel = 'Order discount (fixed):';
    }

    const boxLeft = 270;
    const labelWidth = 200;
    const valueRight = 540;
    const valueWidth = 72;
    const lineH = 10;
    let y = tableBottom + 12;

    const moneyRow = (label: string, value: string) => {
      doc.fontSize(7).font('Helvetica').fillColor('#333');
      doc.text(label, boxLeft, y, { width: labelWidth, align: 'left' });
      doc.text(value, valueRight - valueWidth, y, { width: valueWidth, align: 'right' });
      y += lineH;
    };

    moneyRow('Subtotal (merchandise):', subtotal.toFixed(2));
    if (itemDiscount > 0.005) {
      moneyRow('Item / line discount:', `-${itemDiscount.toFixed(2)}`);
    }
    if (customerDisc > 0.005) {
      moneyRow('Customer discount:', `-${customerDisc.toFixed(2)}`);
    }
    if (orderDiscAmt > 0.005) {
      moneyRow(orderDiscountLabel, `-${orderDiscAmt.toFixed(2)}`);
    }
    moneyRow('Total amount before VAT (round off):', beforeVat.toFixed(2));
    moneyRow('VAT amount:', taxTotal.toFixed(2));
    if (shippingCharge > 0.005) {
      moneyRow('Shipping / delivery:', shippingCharge.toFixed(2));
    }
    if (shippingDisc > 0.005) {
      moneyRow('Shipping discount:', `-${shippingDisc.toFixed(2)}`);
    }
    if (Math.abs(roundingAdj) > 0.005) {
      moneyRow('Rounding adjustment:', roundingAdj.toFixed(2));
    }

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#333');
    doc.text('Grand total AED:', boxLeft, y, { width: labelWidth, align: 'left' });
    doc.text(grandTotal.toFixed(2), valueRight - valueWidth, y, { width: valueWidth, align: 'right' });
    y += lineH;

    doc.font('Helvetica').fontSize(7);
    const words = amountInWordsAED(grandTotal);
    doc.text('Grand total in words (AED):', boxLeft, y, { width: labelWidth });
    doc.text(words, boxLeft, y + 8, { width: valueRight - boxLeft });
    return y + 28;
  }

  /** Footer: Prepared/Checked/Authorised By, Customer Receipt, Terms, Payment Terms, Previous Balance, Payment instruction */
  private static generateTaxInvoiceFooter(doc: PDFKit.PDFDocument, order: IOrder, afterTotalsY: number) {
    const left = 50;
    const right = 300;
    let y = afterTotalsY + 12;
    if (y > 500) {
      doc.addPage();
      y = 50;
    }
    const blockTop = y;
    const lineH = 8;

    doc.fontSize(7).font('Helvetica-Bold').fillColor('#333');
    doc.text('Prepared By:', left, y);
    doc.moveTo(left + 62, y + 9).lineTo(left + 165, y + 9).stroke();
    doc.text('Checked By:', left + 185, y);
    doc.moveTo(left + 252, y + 9).lineTo(left + 355, y + 9).stroke();
    doc.text('Authorised By:', left + 375, y);
    doc.moveTo(left + 445, y + 9).lineTo(545, y + 9).stroke();

    const receiptTop = blockTop + 40;
    doc.fontSize(7).font('Helvetica-Bold').text('CUSTOMER RECEIPT', right, receiptTop);
    doc.font('Helvetica').fontSize(7);
    doc.text('Name:', right, receiptTop + 10);
    doc.text('Designation:', right, receiptTop + 20);
    doc.text('Signature:', right, receiptTop + 30);
    doc.text('Date:', right, receiptTop + 40);
    doc.text('Stamp:', right, receiptTop + 50);
    doc.moveTo(right + 38, receiptTop + 10).lineTo(right + 220, receiptTop + 10).stroke();
    doc.moveTo(right + 38, receiptTop + 20).lineTo(right + 220, receiptTop + 20).stroke();
    doc.moveTo(right + 38, receiptTop + 30).lineTo(right + 220, receiptTop + 30).stroke();
    doc.moveTo(right + 38, receiptTop + 40).lineTo(right + 220, receiptTop + 40).stroke();
    doc.moveTo(right + 38, receiptTop + 50).lineTo(right + 220, receiptTop + 50).stroke();

    const receiptBottom = receiptTop + 62;
    const termsTop = receiptBottom + 16;
    doc.fontSize(7).font('Helvetica').fillColor('#333');
    doc.text('Terms & Conditions:', left, termsTop);
    const term1 = '1. Invoices are not to be altered. A separate credit note will be issued if appropriate and mutually agreed.';
    const term1Y = termsTop + 9;
    const term1Opts = { width: 250, lineGap: 1 };
    doc.text(term1, left, term1Y, term1Opts);
    const term1H = doc.heightOfString(term1, { ...term1Opts, width: 250 });
    const term2Y = term1Y + Math.max(term1H, 10) + 4;
    doc.text('2. Received the goods in good condition.', left, term2Y, { width: 250, lineGap: 1 });
    const term2H = doc.heightOfString('2. Received the goods in good condition.', { width: 250, lineGap: 1 });
    let fy = term2Y + Math.max(term2H, 10) + 8;
    const refX = left + 102;
    const o = order as any;
    const fmtShort = (d: Date | string | undefined) =>
      d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
    const saleOrderNo =
      pdfSafeString(order.sourceOrderNumber, '') ||
      pdfSafeString(order.orderNumber, '') ||
      '—';
    const deliveryNoRaw =
      o.deliveryOrderNumber || (order.isFulfillmentSubOrder ? order.orderNumber : undefined);
    const deliveryNo = pdfSafeString(deliveryNoRaw, '—');
    doc.text('Sales Rep.:', left, fy);
    doc.text(o.salesRepName || o.salesRep || '—', refX, fy, { width: 200 });
    doc.text('Delivery Order No.:', left, fy + lineH);
    doc.text(deliveryNo, refX, fy + lineH, { width: 200 });
    doc.text('Sale Order No.:', left, fy + lineH * 2);
    doc.text(saleOrderNo, refX, fy + lineH * 2, { width: 200 });
    doc.text('Sale Order Date:', left, fy + lineH * 3);
    doc.text(fmtShort(o.sourceOrderDate || order.createdAt), refX, fy + lineH * 3, { width: 200 });
    doc.text('LPO Number:', left, fy + lineH * 4);
    doc.text(o.lpoNumber || o.customerPoNumber || '—', refX, fy + lineH * 4, { width: 200 });
    doc.text('LPO Date:', left, fy + lineH * 5);
    doc.text(fmtShort(o.lpoDate), refX, fy + lineH * 5, { width: 200 });
    doc.text('Payment Terms:', left, fy + lineH * 6);
    const paymentMethod = o.paymentMethod ?? order.paymentStatus;
    doc.text(paymentMethod === 'cod' ? 'Cash' : (paymentMethod || '—').toString().replace(/_/g, ' '), refX, fy + lineH * 6, { width: 200 });
    doc.text('Previous Balance:', left, fy + lineH * 7);
    const balanceDue = Number(o.balanceDue) || 0;
    doc.text(balanceDue > 0 ? balanceDue.toFixed(2) : '0.00', refX, fy + lineH * 7, { width: 200 });

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
