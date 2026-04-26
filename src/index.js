// src/index.js
// Main entry point — run with: npm run bill
//
// Workflow:
//   1. Read the meter via YoLink API
//   2. Save the reading
//   3. Calculate the bill for the previous cycle
//   4. Generate a PDF invoice
//   5. (Future) Email to Jake for review

import { getMeterReading } from './yolink.js';
import { saveReading, getReadingNear, loadReadings } from './readings.js';
import { getPreviousBillingCycle, calculateBill } from './billing.js';
import { generateInvoice } from './invoice.js';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

async function main() {
  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  console.log('╔══════════════════════════════════════╗');
  console.log('║     Shed Water Billing System        ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  // Step 1: Read the meter
  console.log('📡 Reading meter via YoLink API...');
  const reading = await getMeterReading();
  console.log(`   Meter reading: ${reading.gallons.toLocaleString()} gallons`);
  console.log(`   Unit: ${reading.unit}`);
  console.log(`   Battery: ${reading.battery}/4`);
  console.log(`   Online: ${reading.online}`);
  console.log('');

  // Step 2: Save the reading
  saveReading(reading);
  console.log('💾 Reading saved to history.');
  console.log('');

  // Step 3: Determine billing cycle
  const cycle = getPreviousBillingCycle();
  console.log(`📅 Billing cycle: ${cycle.label}`);
  console.log(`   ${cycle.startDate.toLocaleDateString()} — ${cycle.endDate.toLocaleDateString()}`);
  console.log('');

  // Step 4: Find start/end readings for the cycle
  const allReadings = loadReadings();
  const startReading = getReadingNear(cycle.startDate, allReadings);
  const endReading = getReadingNear(cycle.endDate, allReadings);

  if (!startReading || !endReading) {
    console.error('❌ Not enough readings to calculate a bill.');
    console.error('   Need readings near the start and end of the billing period.');
    console.error('   Run "npm run read-meter" periodically to build up history.');
    process.exit(1);
  }

  console.log(`   Start reading: ${startReading.gallons.toLocaleString()} gal (${startReading.timestamp})`);
  console.log(`   End reading:   ${endReading.gallons.toLocaleString()} gal (${endReading.timestamp})`);
  console.log('');

  // Step 5: Calculate the bill
  const bill = calculateBill(startReading, endReading);
  console.log('💰 Bill calculated:');
  console.log(`   Usage:    ${bill.gallonsUsed.toLocaleString()} gallons`);
  console.log(`   Rate:     $${bill.ratePerThousandGallons}/1,000 gal (${bill.rateTier})`);
  console.log(`   Total:    $${bill.totalDue.toFixed(2)}`);
  console.log('');

  // Step 6: Generate PDF invoice
  console.log('📄 Generating invoice...');
  const invoicePath = await generateInvoice(bill, cycle.label);
  console.log(`   Saved: ${invoicePath}`);
  console.log('');

  // Step 7: Email placeholder
  console.log('📧 Email integration pending — invoice ready for manual review.');
  console.log('');
  console.log('✅ Done.');
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
