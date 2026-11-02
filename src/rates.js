// src/rates.js
// Madison rates used for Shed billing, by effective date.
//
// Each entry holds every rate in effect from its "effective" date (inclusive)
// until the next entry starts. Add a new entry whenever Madison changes rates;
// billing.js automatically splits a cycle at each change.
//
// All rates are dollars per 1,000 gallons.
//   waterTier2 - Madison Water Utility, Water Consumption Tier 2
//   sewerCity  - City Sewer Service (volume charge)
//   sewerMmsd  - MMSD Treatment Service (volume charge)
//
// Why Tier 2: the Shed's gallons are the last gallons on the 1634 Baker Ave
// bill, after the household has used its 3,000-gallon Tier 1 allowance.
// Why sewer: the city bills both sewer charges on every gallon through the meter.

export const RATE_PERIODS = [
  {
    effective: '2025-05-01',
    waterTier2: 6.10,
    sewerCity: 1.652,
    sewerMmsd: 3.770,
    source: 'City bill dated 3/13/2026 (water rates eff. 3/1/2023, sewer eff. 5/1/2025)',
  },
  {
    effective: '2026-05-01',
    waterTier2: 7.71,
    sewerCity: 1.608,
    sewerMmsd: 4.036,
    source: 'City bill dated 10/14/2026 (water and sewer eff. 5/1/2026)',
  },
];

export const RATE_METHOD_LABEL = 'Water Tier 2 + sewer volume';
