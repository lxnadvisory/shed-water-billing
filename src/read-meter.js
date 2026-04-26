// src/read-meter.js
// Standalone script to take a meter reading and save it.
// Run periodically (daily or weekly) to build up reading history.
// Usage: npm run read-meter

import { getMeterReading } from './yolink.js';
import { saveReading } from './readings.js';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

async function main() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  console.log('📡 Reading Shed water meter...');

  const reading = await getMeterReading();

  console.log(`   Reading:     ${reading.gallons.toLocaleString()} gallons (${reading.unit})`);
  console.log(`   Daily usage: ${reading.dailyUsage}`);
  console.log(`   Battery:     ${reading.battery}/4`);
  console.log(`   Online:      ${reading.online}`);

  await saveReading(reading);
  console.log(`💾 Saved at ${reading.timestamp}`);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
