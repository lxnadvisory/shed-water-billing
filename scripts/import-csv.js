// scripts/import-csv.js
// Imports YoLink CSV or XLSX export into Supabase readings table as daily summaries.
// Usage: node scripts/import-csv.js <path-to-csv-or-xlsx>
//
// The export has hourly rows with columns:
//   Device Id, Time, Water Meter(GAL), Water Consumption(GAL)
//
// This script groups by day, takes the last meter reading of each day,
// sums the daily consumption, and inserts one row per day into Supabase.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import config from '../config.json' with { type: 'json' };

const supabase = createClient(config.supabase.url, config.supabase.anonKey);

function parseTimestamp(timeStr) {
  // Format: "2026/01/11 00:00:00-0600"
  // Convert to ISO 8601: "2026-01-11T00:00:00-06:00"
  const iso = timeStr
    .replace(/^(\d{4})\/(\d{2})\/(\d{2})/, '$1-$2-$3')
    .replace(' ', 'T')
    .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  return new Date(iso);
}

async function parseFile(filepath) {
  const ext = filepath.split('.').pop().toLowerCase();

  if (ext === 'xlsx' || ext === 'xls') {
    const { default: XLSX } = await import('xlsx');
    const workbook = XLSX.readFile(filepath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(sheet);

    console.log(`📄 XLSX file: ${jsonData.length} rows`);

    return jsonData.map((row) => ({
      deviceId: row['Device Id'],
      timestamp: parseTimestamp(row['Time']),
      meterGallons: parseFloat(row['Water Meter(GAL)']),
      consumption: parseFloat(row['Water Consumption(GAL)']),
    }));
  } else {
    const raw = readFileSync(filepath, 'utf-8');
    const lines = raw.trim().split(/\r?\n/);
    console.log(`📄 CSV file: ${lines.length - 1} rows`);

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length < 4) continue;

      rows.push({
        deviceId: parts[0].trim(),
        timestamp: parseTimestamp(parts[1].trim()),
        meterGallons: parseFloat(parts[2]),
        consumption: parseFloat(parts[3]),
      });
    }
    return rows;
  }
}

function groupByDay(rows) {
  const days = new Map();

  for (const row of rows) {
    const dateKey = row.timestamp.toISOString().split('T')[0];

    if (!days.has(dateKey)) {
      days.set(dateKey, {
        date: dateKey,
        firstReading: row.meterGallons,
        lastReading: row.meterGallons,
        lastTimestamp: row.timestamp,
        totalConsumption: 0,
        rowCount: 0,
      });
    }

    const day = days.get(dateKey);
    day.totalConsumption += row.consumption;
    day.rowCount++;

    if (row.timestamp >= day.lastTimestamp) {
      day.lastReading = row.meterGallons;
      day.lastTimestamp = row.timestamp;
    }
  }

  return Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function importToSupabase(dailySummaries) {
  console.log(`\n📊 Importing ${dailySummaries.length} daily summaries to Supabase...\n`);

  const rows = dailySummaries.map((day) => ({
    raw: Math.round(day.lastReading * 10),
    step_factor: 10,
    source_unit: 'L',
    unit: 'GAL',
    gallons: Math.round(day.lastReading),
    daily_usage: Math.round(day.totalConsumption),
    battery: 4,
    online: 'N/A',
    timestamp: day.lastTimestamp.toISOString(),
    recorded_at: day.lastTimestamp.toISOString(),
  }));

  const batchSize = 50;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('readings').insert(batch);

    if (error) {
      console.error(`❌ Error inserting batch at row ${i}: ${error.message}`);
      return;
    }

    inserted += batch.length;
    console.log(`   ✅ Inserted ${inserted} / ${rows.length}`);
  }

  console.log(`\n🎉 Done! ${inserted} daily readings imported.`);

  const first = dailySummaries[0];
  const last = dailySummaries[dailySummaries.length - 1];
  console.log(`   Date range: ${first.date} to ${last.date}`);
  console.log(`   Start meter: ${Math.round(first.lastReading)} GAL`);
  console.log(`   End meter:   ${Math.round(last.lastReading)} GAL`);
  console.log(`   Total usage: ${Math.round(last.lastReading - first.firstReading)} GAL`);
}

// --- Main ---
const filepath = process.argv[2];
if (!filepath) {
  console.error('Usage: node scripts/import-csv.js <path-to-csv-or-xlsx>');
  process.exit(1);
}

const rows = await parseFile(filepath);
const dailySummaries = groupByDay(rows);

console.log(`\n📅 Daily summaries:`);
console.log(`   Days: ${dailySummaries.length}`);
console.log(`   First: ${dailySummaries[0].date} — ${Math.round(dailySummaries[0].lastReading)} GAL`);
console.log(`   Last:  ${dailySummaries[dailySummaries.length - 1].date} — ${Math.round(dailySummaries[dailySummaries.length - 1].lastReading)} GAL`);

await importToSupabase(dailySummaries);
