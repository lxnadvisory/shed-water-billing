// src/yolink.js
// YoLink Open API V2 client — handles auth + meter reads

import config from '../config.json' with { type: 'json' };

const { uaid, secretKey, apiHost, tokenEndpoint, apiEndpoint, deviceId, deviceToken } = config.yolink;

let accessToken = null;
let tokenExpiresAt = 0;

/**
 * Get an OAuth2 access token using UAC credentials.
 * Tokens are cached and refreshed automatically.
 */
async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) {
    return accessToken;
  }

  const res = await fetch(`${apiHost}${tokenEndpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: uaid,
      client_secret: secretKey,
    }),
  });

  if (!res.ok) {
    throw new Error(`YoLink token request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  accessToken = data.access_token;
  // YoLink tokens typically expire in 2 hours; use their value or default
  const expiresIn = data.expires_in || 7200;
  tokenExpiresAt = Date.now() + expiresIn * 1000;

  return accessToken;
}

/**
 * Call the YoLink API with a device method.
 */
async function callApi(method, params = {}) {
  const token = await getAccessToken();

const body = {
    method,
    time: Date.now(),
    msgid: String(Date.now()),
    targetDevice: deviceId,
    token: deviceToken,
    params,
  };

  const res = await fetch(`${apiHost}${apiEndpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`YoLink API call failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (data.code !== '000000') {
    throw new Error(`YoLink API error: ${data.code} — ${data.desc}`);
  }

  return data;
}

/**
 * Read the current state of the water meter.
 * Returns the full state object including:
 *   - state.meter (cumulative reading)
 *   - attributes.meterUnit (0=GAL, 1=CCF, 2=M3, 3=L)
 *   - dailyUsage
 *   - recentUsage { amount, duration }
 */
export async function getMeterState() {
  const result = await callApi('WaterMeterController.getState');
  return result.data;
}

/**
 * Get just the current cumulative meter reading in gallons.
 */
export async function getMeterReading() {
  const state = await getMeterState();

const rawMeter = state.state.meter;
  const unit = state.attributes.meterUnit;
  const stepFactor = state.attributes.meterStepFactor || 1;

  // The API returns raw integer ticks. Divide by meterStepFactor
  // to get the actual reading in the display unit (GAL, CCF, M3, or L).
  const reading = rawMeter / stepFactor;

  const UNIT_LABELS = ['GAL', 'CCF', 'M3', 'L'];
	const unitLabel = UNIT_LABELS[unit] || 'UNKNOWN';
  const outputUnit = 'GAL'; // We always convert to gallons

  // Convert display-unit reading to gallons
  let gallons = reading;
  if (unit === 1) gallons = reading * 748.052;      // CCF to gallons
  else if (unit === 2) gallons = reading * 264.172;  // M3 to gallons
  else if (unit === 3) gallons = reading * 0.264172; // L to gallons

return {
    raw: rawMeter,
    stepFactor,
    sourceUnit: unitLabel,
    unit: outputUnit,
    gallons: Math.round(gallons),
    dailyUsage: Math.round((state.dailyUsage / stepFactor) * 0.264172),
    battery: state.battery,
    online: state.online ?? state.state?.online ?? 'N/A',
    timestamp: new Date().toISOString(),
  };
}
