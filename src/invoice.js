// src/invoice.js
// Generates the PDF invoice for Shed water + sewer billing.
//
// Expects a bill from calculateSegmentedBill() in billing.js, which has one
// line per rate period (bill.lines) plus water/sewer/total amounts.

import PDFDocument from 'pdfkit';
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../config.json' with { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));
const INVOICES_DIR = join(__dirname, '..', 'invoices');

const SERVICE_LOCATION = 'The Shed, 1632 Baker Ave, Madison, WI 53705';
const DASHBOARD_URL = 'shed-dashboard.vercel.app';

const INK = '#1a1a1a';
const MUTED = '#666666';
const RULE = '#d0d0d0';
const PANEL = '#f3f5f7';

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtMoney(n) {
  return '$' + n.toFixed(2);
}

function fmtGal(n) {
  return Math.round(n).toLocaleString('en-US');
}

// $6.10 -> "$6.10", $5.422 -> "$5.422"
function fmtRate(n) {
  const three = Math.round(n * 1000) / 1000;
  const decimals = Math.round(three * 100) === three * 100 ? 2 : 3;
  return '$' + three.toFixed(decimals);
}

/**
 * Generate a PDF invoice and return the file path.
 */
export async function generateInvoice(bill, cycleLabel) {
  if (!bill.lines || bill.lines.length === 0) {
    throw new Error('generateInvoice needs a segmented bill (bill.lines). Use calculateSegmentedBill() from billing.js.');
  }

  if (!existsSync(INVOICES_DIR)) {
    mkdirSync(INVOICES_DIR, { recursive: true });
  }

  const slug = cycleLabel.replace(/\s+/g, '-');
  const filepath = join(INVOICES_DIR, 'shed-water-invoice-' + slug.toLowerCase() + '.pdf');
  const invoiceNumber = 'SWB-' + slug.toUpperCase();
  const issued = fmtDate(new Date());
  const lines = bill.lines;
  const periodStart = lines[0].periodStart;
  const periodEnd = lines[lines.length - 1].periodEnd;
  const { payer, payee } = config.parties;

  return new Promise(function (resolve, reject) {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 54, bottom: 54, left: 56, right: 56 },
      info: { Title: 'Shed Water & Sewer Invoice ' + cycleLabel },
    });
    const stream = createWriteStream(filepath);
    doc.pipe(stream);

    const L = doc.page.margins.left;
    const R = doc.page.width - doc.page.margins.right;
    const W = R - L;

    function rule(y, color, width) {
      doc.moveTo(L, y).lineTo(R, y).strokeColor(color || RULE).lineWidth(width || 0.75).stroke();
    }

    // ---- Header -----------------------------------------------------------
    doc.font('Helvetica-Bold').fontSize(20).fillColor(INK)
      .text('Shed Water & Sewer Invoice', L, 54, { width: W * 0.6 });
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED)
      .text(cycleLabel + '  |  ' + fmtDate(periodStart) + ' – ' + fmtDate(periodEnd), L, doc.y + 3, { width: W * 0.6 });

    const meta = [
      ['Invoice', invoiceNumber],
      ['Issued', issued],
      ['Due', 'On receipt'],
    ];
    const metaX = R - 190;
    meta.forEach(function (m, i) {
      const y = 56 + i * 14;
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(m[0], metaX, y, { width: 60 });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(m[1], metaX + 60, y, { width: 130, align: 'right' });
    });

    let y = 112;
    rule(y);

    // ---- Parties ----------------------------------------------------------
    y += 14;
    const half = W / 2;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED)
      .text('BILLED TO', L, y)
      .text('PAYABLE TO', L + half, y);
    y += 12;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK)
      .text(payer.name, L, y, { width: half - 12 })
      .text(payee.name, L + half, y, { width: half - 12 });
    y += 15;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text('Service: ' + SERVICE_LOCATION, L, y, { width: half - 12 })
      .text(payee.address, L + half, y, { width: half - 12 });
    y += 32;

    // ---- Meter summary panel ---------------------------------------------
    const panelH = 48;
    doc.rect(L, y, W, panelH).fillColor(PANEL).fill();
    const cells = [
      ['Start reading', fmtGal(bill.startReading) + ' gal', fmtDate(periodStart)],
      ['End reading', fmtGal(bill.endReading) + ' gal', fmtDate(periodEnd)],
      ['Shed usage', fmtGal(bill.gallonsUsed) + ' gal', 'YoLink meter YS5008-UC'],
    ];
    cells.forEach(function (c, i) {
      const x = L + 14 + i * (W / 3);
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(c[0].toUpperCase(), x, y + 8);
      doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(c[1], x, y + 19);
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(c[2], x, y + 35, { width: W / 3 - 20 });
    });
    y += panelH + 22;

    // ---- Charges table ----------------------------------------------------
    const cols = [
      { label: 'Period', w: 0.31, align: 'left' },
      { label: 'Gallons', w: 0.13, align: 'right' },
      { label: 'Water', w: 0.19, align: 'right' },
      { label: 'Sewer', w: 0.19, align: 'right' },
      { label: 'Amount', w: 0.18, align: 'right' },
    ];
    const xs = [];
    let cx = L;
    cols.forEach(function (c) { xs.push(cx); cx += c.w * W; });

    function cell(text, i, yy) {
      const pad = i === cols.length - 1 ? 0 : 10;
      doc.text(text, xs[i], yy, { width: cols[i].w * W - pad, align: cols[i].align, lineBreak: false });
    }

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED);
    cols.forEach(function (c, i) { cell(c.label.toUpperCase(), i, y); });
    y += 13;
    rule(y, INK, 0.75);
    y += 9;

    lines.forEach(function (line) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK);
      cell(fmtDate(line.periodStart) + ' – ' + fmtDate(line.periodEnd), 0, y);
      cell(fmtGal(line.gallons), 1, y);
      cell(fmtMoney(line.water), 2, y);
      cell(fmtMoney(line.sewer), 3, y);
      cell(fmtMoney(line.subtotal), 4, y);
      y += 14;
      doc.font('Helvetica').fontSize(8).fillColor(MUTED);
      cell('Meter ' + fmtGal(line.startReading) + ' to ' + fmtGal(line.endReading), 0, y);
      cell(fmtRate(line.waterRate) + ' / 1k gal', 2, y);
      cell(fmtRate(line.sewerRate) + ' / 1k gal', 3, y);
      y += 16;
      rule(y);
      y += 9;
    });

    // ---- Totals -----------------------------------------------------------
    const labelX = xs[2];
    const labelW = (cols[2].w + cols[3].w) * W - 10;
    const valX = xs[4];
    const valW = cols[4].w * W;

    function totalRow(label, value, strong) {
      doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 12 : 9.5).fillColor(INK);
      doc.text(label, labelX, y, { width: labelW, align: 'right', lineBreak: false });
      doc.text(value, valX, y, { width: valW, align: 'right', lineBreak: false });
      y += strong ? 20 : 15;
    }

    totalRow('Water', fmtMoney(bill.waterTotal));
    totalRow('Sewer', fmtMoney(bill.sewerTotal));
    doc.moveTo(labelX + labelW - 60, y).lineTo(R, y).strokeColor(INK).lineWidth(1).stroke();
    y += 7;
    totalRow('Total due', fmtMoney(bill.totalDue), true);

    // ---- How this is calculated -----------------------------------------
    y += 14;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text('How this is calculated', L, y);
    y = doc.y + 5;

    const notes = [
      'Usage comes from the Shed’s own water meter (YoLink YS5008-UC). Each period’s gallons are the difference between cumulative meter readings at its start and end.',
      'Water is billed at Madison Water Utility’s Tier 2 rate. The Shed’s gallons are the last gallons on the 1634 Baker Ave bill, above the household’s 3,000-gallon Tier 1 allowance. The monthly base charge is not shared.',
      'Sewer is billed because the city charges City Sewer Service and MMSD Treatment on every gallon through the water meter. The sewer rate shown is those two combined.',
    ];
    if (lines.length > 1) {
      const changes = lines.slice(1).map(function (l) { return fmtDate(l.periodStart); }).join(' and ');
      notes.push('Madison rates changed on ' + changes + ', so each rate period is billed separately at the rates in effect at the time.');
    }
    lines.forEach(function (l) {
      notes.push(fmtDate(l.periodStart) + ' – ' + fmtDate(l.periodEnd) + ' rates per 1,000 gal: water ' + fmtRate(l.waterRate)
        + ', city sewer ' + fmtRate(l.sewerCityRate) + ', MMSD treatment ' + fmtRate(l.sewerMmsdRate) + '.');
    });
    notes.push('Billed under Section 4 of the Water Line Easement (Dane County Doc #6076685), which provides for payment of expenses related to the Shed’s water usage on or about January 1 and July 1.');

    notes.forEach(function (n) {
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text('•', L, y, { width: 10 });
      doc.text(n, L + 12, y, { width: W - 12, lineGap: 1 });
      y = doc.y + 4;
    });

    // ---- Footer -----------------------------------------------------------
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text('Daily usage and billing history: ' + DASHBOARD_URL, L, doc.page.height - 72, { width: W, align: 'center', lineBreak: false });

    doc.end();
    stream.on('finish', function () { resolve(filepath); });
    stream.on('error', reject);
  });
}
