// src/readings.js
// Supabase-backed reading history for audit purposes
// Replaces the old JSON file storage with a proper database

import { createClient } from '@supabase/supabase-js';
import config from '../config.json' with { type: 'json' };

const supabase = createClient(config.supabase.url, config.supabase.anonKey);

/**
 * Load all stored readings, ordered by timestamp descending.
 */
export async function loadReadings() {
  const { data, error } = await supabase
    .from('readings')
    .select('*')
    .order('timestamp', { ascending: true });

  if (error) throw new Error(`Failed to load readings: ${error.message}`);
  return data;
}

/**
 * Save a new meter reading to Supabase.
 */
export async function saveReading(reading) {
  const row = {
    raw: reading.raw,
    step_factor: reading.stepFactor,
    source_unit: reading.sourceUnit,
    unit: reading.unit,
    gallons: reading.gallons,
    daily_usage: reading.dailyUsage,
    battery: reading.battery,
    online: String(reading.online ?? 'N/A'),
    timestamp: reading.timestamp,
    recorded_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('readings')
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(`Failed to save reading: ${error.message}`);
  return data;
}

/**
 * Get the reading closest to a target date.
 * Used to find start-of-period and end-of-period readings.
 */
export async function getReadingNear(targetDate) {
  // Pull all readings and find the closest in JS
  // (Supabase doesn't have a native "closest to date" query)
  const all = await loadReadings();
  if (all.length === 0) return null;

  const target = new Date(targetDate).getTime();

  return all.reduce((closest, r) => {
    const diff = Math.abs(new Date(r.timestamp).getTime() - target);
    const closestDiff = Math.abs(new Date(closest.timestamp).getTime() - target);
    return diff < closestDiff ? r : closest;
  });
}

/**
 * Get readings within a date range.
 */
export async function getReadingsInRange(startDate, endDate) {
  const { data, error } = await supabase
    .from('readings')
    .select('*')
    .gte('timestamp', new Date(startDate).toISOString())
    .lte('timestamp', new Date(endDate).toISOString())
    .order('timestamp', { ascending: true });

  if (error) throw new Error(`Failed to query readings: ${error.message}`);
  return data;
}

/**
 * Save a billing record to Supabase.
 */
export async function saveBilling(bill, cycleLabel, invoicePath = null) {
  const row = {
    cycle_label: cycleLabel,
    start_reading: bill.startReading,
    end_reading: bill.endReading,
    start_date: bill.startDate,
    end_date: bill.endDate,
    gallons_used: bill.gallonsUsed,
    rate_per_thousand: bill.ratePerThousandGallons,
    rate_tier: bill.rateTier,
    total_due: bill.totalDue,
    invoice_path: invoicePath,
    status: 'draft',
  };

  const { data, error } = await supabase
    .from('billing')
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(`Failed to save billing: ${error.message}`);
  return data;
}

/**
 * Get all billing records, most recent first.
 */
export async function loadBillingHistory() {
  const { data, error } = await supabase
    .from('billing')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load billing history: ${error.message}`);
  return data;
}

/**
 * Update billing record status (e.g., 'draft' -> 'approved' -> 'sent').
 */
export async function updateBillingStatus(id, status) {
  const { data, error } = await supabase
    .from('billing')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update billing status: ${error.message}`);
  return data;
}
