// src/readings.js
// Supabase-backed reading history for audit purposes
// Replaces the old JSON file storage with a proper database

import { createClient } from '@supabase/supabase-js';
import config from '../config.json' with { type: 'json' };

// Writes need the private service key (config.supabase.serviceKey). The public
// anon key is read-only once 02-lock-down-public-key.sql has been run.
const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceKey || config.supabase.anonKey
);

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
 * Load Madison rate periods (water Tier 2 + sewer) from Supabase.
 * Returns null if the table isn't there yet, so callers can fall back to rates.js.
 */
export async function loadRatePeriods() {
  const { data, error } = await supabase
    .from('rate_periods')
    .select('effective_date, water_tier2, sewer_city, sewer_mmsd, source')
    .order('effective_date', { ascending: true });

  if (error || !data || data.length === 0) return null;
  return data.map((r) => ({
    effective: r.effective_date,
    waterTier2: Number(r.water_tier2),
    sewerCity: Number(r.sewer_city),
    sewerMmsd: Number(r.sewer_mmsd),
    source: r.source,
  }));
}

function isoDate(d) {
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
}

/**
 * Upload the invoice PDF to the public "invoices" bucket and return its URL.
 * Returns null (and warns) if the upload isn't possible, so billing still completes.
 */
export async function uploadInvoice(localPath, cycleLabel) {
  try {
    const { readFileSync } = await import('fs');
    const key = 'shed-water-invoice-' + cycleLabel.replace(/\s+/g, '-').toLowerCase() + '.pdf';
    const { error } = await supabase.storage
      .from('invoices')
      .upload(key, readFileSync(localPath), { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
    return supabase.storage.from('invoices').getPublicUrl(key).data.publicUrl;
  } catch (e) {
    console.warn('   Invoice upload skipped: ' + (e.message || e));
    return null;
  }
}

/**
 * Save a cycle's bill and its line items to Supabase.
 *
 * One row per cycle. Re-running the bill replaces a draft. A bill that has
 * been sent or paid is locked: this refuses to change it, so the record
 * always matches what Tyler and Stacey received.
 */
export async function saveBilling(bill, cycleLabel, invoicePath = null, invoiceUrl = null) {
  const { data: existing, error: findError } = await supabase
    .from('billing')
    .select('id, status')
    .eq('cycle_label', cycleLabel);

  if (findError) throw new Error('Failed to look up existing bill: ' + findError.message);

  const locked = (existing || []).find((b) => b.status && b.status !== 'draft');
  if (locked) {
    throw new Error(cycleLabel + ' is already marked ' + locked.status + ' and is locked. '
      + 'Corrections go on the next bill as an adjustment.');
  }

  // Clear old drafts for this cycle (their lines go with them).
  if (existing && existing.length > 0) {
    const { error: clearError } = await supabase
      .from('billing')
      .delete()
      .in('id', existing.map((b) => b.id))
      .select('id');
    if (clearError) throw new Error('Failed to clear old draft: ' + clearError.message);
  }

  const lines = bill.lines || [];
  const row = {
    cycle_label: cycleLabel,
    start_reading: Math.round(bill.startReading),
    end_reading: Math.round(bill.endReading),
    start_date: bill.startDate,
    end_date: bill.endDate,
    period_start: lines.length ? isoDate(lines[0].periodStart) : null,
    period_end: lines.length ? isoDate(lines[lines.length - 1].periodEnd) : null,
    gallons_used: Math.round(bill.gallonsUsed),
    rate_per_thousand: bill.ratePerThousandGallons,
    rate_tier: bill.rateTier,
    water_total: bill.waterTotal ?? null,
    sewer_total: bill.sewerTotal ?? null,
    total_due: bill.totalDue,
    invoice_number: 'SWB-' + cycleLabel.replace(/\s+/g, '-').toUpperCase(),
    invoice_path: invoicePath,
    invoice_url: invoiceUrl,
    status: 'draft',
  };

  const { data, error } = await supabase
    .from('billing')
    .insert(row)
    .select()
    .single();

  if (error) {
    if (/duplicate key/.test(error.message)) {
      throw new Error('A bill for ' + cycleLabel + ' already exists and could not be replaced. '
        + 'Add serviceKey to config.json (see SETUP-DASHBOARD.md).');
    }
    throw new Error(`Failed to save billing: ${error.message}`);
  }

  if (lines.length) {
    const lineRows = lines.map((l, i) => ({
      billing_id: data.id,
      line_no: i + 1,
      period_start: isoDate(l.periodStart),
      period_end: isoDate(l.periodEnd),
      start_reading: l.startReading,
      end_reading: l.endReading,
      gallons: l.gallons,
      water_rate: l.waterRate,
      sewer_city_rate: l.sewerCityRate,
      sewer_mmsd_rate: l.sewerMmsdRate,
      water_amount: l.water,
      sewer_amount: l.sewer,
      subtotal: l.subtotal,
    }));
    const { error: lineError } = await supabase.from('billing_lines').insert(lineRows);
    if (lineError) throw new Error('Saved the bill but not its line items: ' + lineError.message);
  }

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
