// src/invoice.js
// Generates a professional PDF invoice for Shed water billing

import PDFDocument from 'pdfkit';
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../config.json' with { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));
const INVOICES_DIR = join(__dirname, '..', 'invoices');

/**
 * Format a date as "Month Day, Year"
 */
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format currency
 */
function formatCurrency(amount) {
  return `$${amount.toFixed(2)}`;
}

/**
 * Generate a PDF invoice and return the file path.
 */
export async function generateInvoice(bill, cycleLabel) {
  if (!existsSync(INVOICES_DIR)) {
    mkdirSync(INVOICES_DIR, { recursive: true });
  }

  const filename = `shed-water-invoice-${cycleLabel.replace(/\s+/g, '-').toLowerCase()}.pdf`;
  const filepath = join(INVOICES_DIR, filename);

  const { payer, payee } = config.parties;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
    });

    const stream = createWriteStream(filepath);
    doc.pipe(stream);

    // ── Header ──
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('WATER BILL', { align: 'left' });

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#666666')
      .text('Shed Water Usage Invoice', { align: 'left' });

    doc.moveDown(0.5);

    // Invoice metadata — right-aligned block
    const invoiceDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const invoiceNumber = `SWB-${cycleLabel.replace(/\s+/g, '-').toUpperCase()}`;

    doc
      .fontSize(10)
      .fillColor('#333333')
      .font('Helvetica-Bold')
      .text(`Invoice #: ${invoiceNumber}`, 60, doc.y, { align: 'right' })
      .font('Helvetica')
      .text(`Date: ${invoiceDate}`, { align: 'right' })
      .text(`Period: ${cycleLabel}`, { align: 'right' });

    doc.moveDown(1.5);

    // ── Parties ──
    const partiesY = doc.y;

    // From (Payee — who gets paid)
    doc
      .fontSize(9)
      .fillColor('#999999')
      .font('Helvetica-Bold')
      .text('BILL TO:', 60, partiesY);

    doc
      .fontSize(11)
      .fillColor('#333333')
      .font('Helvetica-Bold')
      .text(payer.name, 60, partiesY + 16)
      .font('Helvetica')
      .fontSize(10)
      .text(payer.property)
      .text(payer.address);

    // Payee
    doc
      .fontSize(9)
      .fillColor('#999999')
      .font('Helvetica-Bold')
      .text('FROM:', 350, partiesY);

    doc
      .fontSize(11)
      .fillColor('#333333')
      .font('Helvetica-Bold')
      .text(payee.name, 350, partiesY + 16)
      .font('Helvetica')
      .fontSize(10)
      .text(payee.address);

    doc.y = Math.max(doc.y, partiesY + 80);
    doc.moveDown(1.5);

    // ── Divider ──
    doc
      .strokeColor('#DDDDDD')
      .lineWidth(1)
      .moveTo(60, doc.y)
      .lineTo(552, doc.y)
      .stroke();

    doc.moveDown(1);

    // ── Meter Readings ──
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#333333')
      .text('Meter Readings');

    doc.moveDown(0.5);

    const readingsData = [
      ['Start of Period', formatDate(bill.startDate), `${bill.startReading.toLocaleString()} gal`],
      ['End of Period', formatDate(bill.endDate), `${bill.endReading.toLocaleString()} gal`],
      ['Total Usage', '', `${bill.gallonsUsed.toLocaleString()} gallons`],
    ];

    const col1X = 60;
    const col2X = 250;
    const col3X = 420;

    // Table header
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#999999')
      .text('DESCRIPTION', col1X, doc.y)
      .text('DATE', col2X, doc.y - doc.currentLineHeight())
      .text('READING', col3X, doc.y - doc.currentLineHeight(), { align: 'right', width: 132 });

    doc.moveDown(0.5);

    doc
      .strokeColor('#EEEEEE')
      .lineWidth(0.5)
      .moveTo(60, doc.y)
      .lineTo(552, doc.y)
      .stroke();

    doc.moveDown(0.3);

    // Table rows
    readingsData.forEach((row, i) => {
      const isTotal = i === readingsData.length - 1;
      const y = doc.y;

      doc
        .fontSize(10)
        .font(isTotal ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor('#333333')
        .text(row[0], col1X, y)
        .text(row[1], col2X, y)
        .text(row[2], col3X, y, { align: 'right', width: 132 });

      doc.moveDown(0.6);
    });

    doc.moveDown(1);

    // ── Divider ──
    doc
      .strokeColor('#DDDDDD')
      .lineWidth(1)
      .moveTo(60, doc.y)
      .lineTo(552, doc.y)
      .stroke();

    doc.moveDown(1);

    // ── Charges ──
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#333333')
      .text('Charges');

    doc.moveDown(0.5);

    const chargeY = doc.y;
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#333333')
      .text(
        `${bill.gallonsUsed.toLocaleString()} gallons × ${formatCurrency(bill.ratePerThousandGallons)}/1,000 gal (${bill.rateTier})`,
        col1X,
        chargeY
      )
      .font('Helvetica-Bold')
      .text(formatCurrency(bill.totalDue), col3X, chargeY, { align: 'right', width: 132 });

    doc.moveDown(2);

    // ── Total ──
    doc
      .strokeColor('#333333')
      .lineWidth(2)
      .moveTo(350, doc.y)
      .lineTo(552, doc.y)
      .stroke();

    doc.moveDown(0.5);

    const totalY = doc.y;
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#333333')
      .text('TOTAL DUE', 350, totalY)
      .fontSize(18)
      .text(formatCurrency(bill.totalDue), col3X, totalY - 2, { align: 'right', width: 132 });

    doc.moveDown(3);

    // ── Footer ──
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#999999')
      .text(
        `Rate: Madison Water Utility ${bill.rateTier} — ${formatCurrency(bill.ratePerThousandGallons)} per 1,000 gallons`,
        60
      )
      .text('Meter: YoLink FlowSmart Water Meter')
      .text('Per water agreement filed with property deeds, January 2026');

    // Finalize
    doc.end();

    stream.on('finish', () => resolve(filepath));
    stream.on('error', reject);
  });
}
