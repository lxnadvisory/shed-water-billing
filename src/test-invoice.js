// src/test-invoice.js
// Generate a sample invoice with dummy data to preview the PDF output.
// Usage: npm run test-invoice

import { generateInvoice } from './invoice.js';

async function main() {
  console.log('📄 Generating test invoice with sample data...');

  // Simulate a 6-month billing period: H1 2026
  const sampleBill = {
    startReading: 1200,
    endReading: 4350,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-06-30T23:59:59.000Z',
    gallonsUsed: 3150,
    ratePerThousandGallons: 7.71,
    rateTier: 'Tier 2',
    totalDue: 24.29,
  };

  const filepath = await generateInvoice(sampleBill, 'H1 2026');
  console.log(`✅ Test invoice saved: ${filepath}`);
  console.log('');
  console.log('Sample data used:');
  console.log(`   Period:   H1 2026 (Jan 1 – Jun 30)`);
  console.log(`   Usage:    ${sampleBill.gallonsUsed.toLocaleString()} gallons (~525/month)`);
  console.log(`   Rate:     $${sampleBill.ratePerThousandGallons}/1,000 gal (${sampleBill.rateTier})`);
  console.log(`   Total:    $${sampleBill.totalDue.toFixed(2)}`);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
