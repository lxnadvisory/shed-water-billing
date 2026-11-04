// src/index.js
// Main entry point - run with: npm run bill
//
// Workflow:
//   1. Read the meter via YoLink API
//   2. Save the reading
//   3. Calculate the bill for the current (or previous) cycle
//   4. Generate a PDF invoice
//   5. Save billing record to Supabase
//   6. (Future) Email to Jake for review

import { getMeterReading } from './yolink.js';
import { saveReading, getReadingNear, saveBilling, loadRatePeriods, uploadInvoice } from './readings.js';
import { getBillingCycle, getPreviousBillingCycle, calculateBill } from './billing.js';
import { calculateSegmentedBill } from './billing.js';
import { generateInvoice } from './invoice.js';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

// Check for --current flag to bill the current cycle instead of previous
const billCurrent = process.argv.includes('--current');

async function main() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  console.log('========================================');
  console.log('     Shed Water Billing System');
  console.log('========================================');
  console.log('');

  // Step 1: Read the meter
  console.log('Reading meter via YoLink API...');
  const reading = await getMeterReading();
  console.log('   Meter reading: ' + reading.gallons.toLocaleString() + ' gallons');
  console.log('   Unit: ' + reading.unit);
  console.log('   Battery: ' + reading.battery + '/4');
  console.log('   Online: ' + reading.online);
  console.log('');

  // Step 2: Save the reading
  await saveReading(reading);
  console.log('Reading saved to Supabase.');
  console.log('');

  // Step 3: Determine billing cycle
  const cycle = billCurrent ? getBillingCycle() : getPreviousBillingCycle();
  console.log('Billing cycle: ' + cycle.label + (billCurrent ? ' (current)' : ' (previous)'));
  console.log('   ' + cycle.startDate.toLocaleDateString() + ' - ' + cycle.endDate.toLocaleDateString());
  console.log('');

  // Step 4-5: Calculate the bill, split at any rate change within the cycle
  const dbRates = await loadRatePeriods();
  console.log('   Rates: ' + (dbRates ? 'from Supabase rate_periods' : 'from src/rates.js (rate_periods table not found)'));
  const bill = await calculateSegmentedBill(cycle, getReadingNear, dbRates || undefined);

  console.log('   Start reading: ' + bill.startReading.toLocaleString() + ' gal (' + bill.startDate + ')');
  console.log('   End reading:   ' + bill.endReading.toLocaleString() + ' gal (' + bill.endDate + ')');
  console.log('');
  console.log('Bill calculated (' + bill.rateTier + '):');
  bill.lines.forEach(function (l) {
    console.log('   ' + l.periodStart.toLocaleDateString() + ' - ' + l.periodEnd.toLocaleDateString() + ': '
      + l.gallons.toLocaleString() + ' gal | water $' + l.water.toFixed(2) + ' @ $' + l.waterRate + '/1k'
      + ' | sewer $' + l.sewer.toFixed(2) + ' @ $' + l.sewerRate + '/1k'
      + ' | $' + l.subtotal.toFixed(2));
  });
  console.log('   Water total: $' + bill.waterTotal.toFixed(2));
  console.log('   Sewer total: $' + bill.sewerTotal.toFixed(2));
  console.log('   TOTAL DUE:   $' + bill.totalDue.toFixed(2));
  console.log('');

  // Step 6: Generate PDF invoice
  console.log('Generating invoice...');
  const invoicePath = await generateInvoice(bill, cycle.label);
  console.log('   Saved: ' + invoicePath);
  console.log('');

  // Step 7: Save billing record to Supabase
  const invoiceUrl = await uploadInvoice(invoicePath, cycle.label);
  if (invoiceUrl) console.log('   Uploaded: ' + invoiceUrl);
  await saveBilling(bill, cycle.label, invoicePath, invoiceUrl);
  console.log('Billing record saved to Supabase.');
  console.log('');

  // Step 8: Email placeholder
  console.log('Email integration pending - invoice ready for manual review.');
  console.log('');
  console.log('Done.');
}

main().catch(function(err) {
  console.error('Error: ' + err.message);
  process.exit(1);
});
