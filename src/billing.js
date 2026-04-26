// src/billing.js
// Calculates the bill for a given period

import config from '../config.json' with { type: 'json' };

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
