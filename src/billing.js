// src/billing.js
// Calculates the bill for a given period

import config from '../config.json' with { type: 'json' };
import { RATE_PERIODS, RATE_METHOD_LABEL } from './rates.js';

const { ratePerThousandGallons, rateTier, billingCycles } = config.billing;

/**
 * Determine which billing cycle a date falls into.
 */
export function getBillingCycle(date = new Date()) {
  const month = date.getMonth() + 1; // 1-indexed
  const year = date.getFullYear();

  const cycle = billingCycles.find(
    (c) => month >= c.startMonth && month <= c.endMonth
  );

  if (!cycle) throw new Error(`No billing cycle found for month ${month}`);

  return {
    label: `${cycle.label} ${year}`,
    startDate: new Date(year, cycle.startMonth - 1, cycle.startDay),
    endDate: new Date(year, cycle.endMonth - 1, cycle.endDay, 23, 59, 59),
  };
}

/**
 * Get the previous billing cycle (for generating the bill that just ended).
 */
export function getPreviousBillingCycle(date = new Date()) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  // If we're in H1 (Jan-Jun), the previous cycle is H2 of last year
  // If we're in H2 (Jul-Dec), the previous cycle is H1 of this year
  if (month <= 6) {
    const prev = billingCycles.find((c) => c.label === 'H2');
    return {
      label: `H2 ${year - 1}`,
      startDate: new Date(year - 1, prev.startMonth - 1, prev.startDay),
      endDate: new Date(year - 1, prev.endMonth - 1, prev.endDay, 23, 59, 59),
    };
  } else {
    const prev = billingCycles.find((c) => c.label === 'H1');
    return {
      label: `H1 ${year}`,
      startDate: new Date(year, prev.startMonth - 1, prev.startDay),
      endDate: new Date(year, prev.endMonth - 1, prev.endDay, 23, 59, 59),
    };
  }
}

/**
 * Calculate the bill given start and end meter readings.
 */
export function calculateBill(startReading, endReading) {
  const gallonsUsed = endReading.gallons - startReading.gallons;

  if (gallonsUsed < 0) {
    throw new Error(
      `Negative usage detected: start=${startReading.gallons}, end=${endReading.gallons}. Meter may have been reset.`
    );
  }

  const ratePerGallon = ratePerThousandGallons / 1000;
  const totalDue = gallonsUsed * ratePerGallon;

  return {
    startReading: startReading.gallons,
    endReading: endReading.gallons,
    startDate: startReading.timestamp,
    endDate: endReading.timestamp,
    gallonsUsed,
    ratePerThousandGallons,
    rateTier,
    totalDue: Math.round(totalDue * 100) / 100, // round to cents
  };
}

// ---------------------------------------------------------------------------
// Rate-period billing (water Tier 2 + sewer)
// ---------------------------------------------------------------------------

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

// Parse 'YYYY-MM-DD' as local midnight (matches how billing cycles are built).
function localDate(str) {
  const parts = str.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/**
 * Split a billing cycle into segments, one per rate period it overlaps.
 * Returns [{ start, end, rates }] in date order.
 */
export function getRateSegments(startDate, endDate, ratePeriods = RATE_PERIODS) {
  const periods = ratePeriods
    .map(function (p) { return Object.assign({}, p, { start: localDate(p.effective) }); })
    .sort(function (a, b) { return a.start - b.start; });

  if (periods.length === 0 || periods[0].start > startDate) {
    throw new Error('No rate period covers ' + startDate.toDateString() + '. Add one to src/rates.js.');
  }

  const cycleEndExclusive = endDate.getTime() + 1;
  const segments = [];

  for (let i = 0; i < periods.length; i++) {
    const periodStart = periods[i].start.getTime();
    const periodEndExclusive = i + 1 < periods.length ? periods[i + 1].start.getTime() : Infinity;
    const segStart = Math.max(startDate.getTime(), periodStart);
    const segEndExclusive = Math.min(cycleEndExclusive, periodEndExclusive);
    if (segStart < segEndExclusive) {
      segments.push({
        start: new Date(segStart),
        end: new Date(segEndExclusive - 1),
        rates: periods[i],
      });
    }
  }

  return segments;
}

/**
 * Calculate a cycle's bill with one line per rate period.
 * readingNear(date) must return a reading { gallons, timestamp } closest to that date
 * (pass getReadingNear from readings.js).
 *
 * Each line: gallons x water Tier 2 rate, plus gallons x (city sewer + MMSD) rate.
 * Line amounts are rounded to cents, and totals are the sum of the rounded lines
 * so the invoice always adds up.
 */
export async function calculateSegmentedBill(cycle, readingNear, ratePeriods = RATE_PERIODS) {
  const segments = getRateSegments(cycle.startDate, cycle.endDate, ratePeriods);

  // Reading points: cycle start, each internal rate change, cycle end.
  // Adjacent segments share a boundary reading so no gallon is counted twice.
  const points = [cycle.startDate]
    .concat(segments.slice(1).map(function (s) { return s.start; }))
    .concat([cycle.endDate]);

  const readings = [];
  for (const p of points) {
    const r = await readingNear(p);
    if (!r) throw new Error('No meter reading found near ' + p.toDateString());
    readings.push(r);
  }

  const lines = segments.map(function (seg, i) {
    const a = readings[i];
    const b = readings[i + 1];
    const gallons = b.gallons - a.gallons;
    if (gallons < 0) {
      throw new Error('Negative usage between ' + a.timestamp + ' and ' + b.timestamp + '. Check the readings.');
    }
    const sewerRate = round3(seg.rates.sewerCity + seg.rates.sewerMmsd);
    const water = round2(gallons * seg.rates.waterTier2 / 1000);
    const sewer = round2(gallons * sewerRate / 1000);
    return {
      periodStart: seg.start,
      periodEnd: seg.end,
      startReading: a.gallons,
      endReading: b.gallons,
      startTimestamp: a.timestamp,
      endTimestamp: b.timestamp,
      gallons: gallons,
      waterRate: seg.rates.waterTier2,
      sewerCityRate: seg.rates.sewerCity,
      sewerMmsdRate: seg.rates.sewerMmsd,
      sewerRate: sewerRate,
      water: water,
      sewer: sewer,
      subtotal: round2(water + sewer),
    };
  });

  const sum = function (key) {
    return round2(lines.reduce(function (t, l) { return t + l[key]; }, 0));
  };
  const gallonsUsed = lines.reduce(function (t, l) { return t + l.gallons; }, 0);
  const totalDue = sum('subtotal');

  return {
    lines: lines,
    startReading: readings[0].gallons,
    endReading: readings[readings.length - 1].gallons,
    startDate: readings[0].timestamp,
    endDate: readings[readings.length - 1].timestamp,
    gallonsUsed: gallonsUsed,
    waterTotal: sum('water'),
    sewerTotal: sum('sewer'),
    totalDue: totalDue,
    // Blended effective rate, kept for the billing table and dashboard
    ratePerThousandGallons: gallonsUsed > 0 ? round2(totalDue / gallonsUsed * 1000) : 0,
    rateTier: RATE_METHOD_LABEL,
  };
}
