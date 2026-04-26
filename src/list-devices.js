// src/list-devices.js
// Utility to list all YoLink devices on your account.
// Run this once to find your water meter's deviceId and token.
// Usage: node src/list-devices.js

import config from '../config.json' with { type: 'json' };

const { uaid, secretKey, apiHost, tokenEndpoint, apiEndpoint } = config.yolink;

async function main() {
  // Step 1: Get access token
  console.log('🔑 Authenticating with YoLink...');

  const tokenRes = await fetch(`${apiHost}${tokenEndpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: uaid,
      client_secret: secretKey,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`Auth failed: ${tokenRes.status} ${tokenRes.statusText}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  console.log('✅ Authenticated.\n');

  // Step 2: Get device list
  console.log('📡 Fetching device list...\n');

  const devRes = await fetch(`${apiHost}${apiEndpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
	method: 'Home.getDeviceList',
	time: Date.now(),
	msgid: String(Date.now()),
    }),
  });

  const devData = await devRes.json();

  if (devData.code !== '000000') {
    throw new Error(`API error: ${devData.code} — ${devData.desc}`);
  }

  const devices = devData.data.devices;
  console.log(`Found ${devices.length} device(s):\n`);
  console.log('─'.repeat(80));

  devices.forEach((d, i) => {
    console.log(`  Device ${i + 1}:`);
    console.log(`    Name:      ${d.name}`);
    console.log(`    Model:     ${d.modelName}`);
    console.log(`    Type:      ${d.type}`);
    console.log(`    Device ID: ${d.deviceId}`);
    console.log(`    Token:     ${d.token}`);
    console.log('─'.repeat(80));
  });

  // Highlight the water meter if found
  const waterMeter = devices.find(
    (d) => d.type === 'WaterMeterController' || d.modelName?.startsWith('YS5008')
  );

  if (waterMeter) {
    console.log('\n🎯 Water meter found! Add these to your config.json:\n');
    console.log(`    "deviceId": "${waterMeter.deviceId}",`);
    console.log(`    "deviceToken": "${waterMeter.token}"`);
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  if (err.message.includes('Auth failed')) {
    console.error('\n   Check your UAID and secret key in config.json.');
    console.error('   Get them from: YoLink App → Account → Advanced Settings → Personal Access Credentials');
  }
  process.exit(1);
});
