# Shed Water Billing System

Automated water billing for the Shed at 1634 Baker Ave, Madison WI.

## How It Works

1. **Read the meter** — pulls the cumulative reading from the YoLink FlowSmart water meter via their cloud API
2. **Calculate the bill** — multiplies gallons used by Madison's Tier 2 water rate
3. **Generate a PDF invoice** — professional invoice showing the billing period, readings, and amount due
4. **Review & send** — invoice is emailed to Jake for approval before forwarding to Tyler & Stacey

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Edit `config.json` with your YoLink credentials:
   - **UAID** and **Secret Key**: Create in YoLink App → Account → Advanced Settings → Personal Access Credentials → +
   - **Device ID** and **Device Token**: Run `npm run read-meter` after adding UAID/Secret Key — the script will list your devices (or find them in the YoLink app under device settings)

3. Set your email addresses in `config.json`

## Usage

### Take a meter reading (run daily or weekly)
```
npm run read-meter
```
This saves readings to `data/readings.json` for the billing calculation.

### Generate a bill for the previous 6-month cycle
```
npm run bill
```
This reads the meter, calculates usage for the last completed cycle (H1: Jan–Jun or H2: Jul–Dec), and generates a PDF invoice in `invoices/`.

### Preview a sample invoice
```
npm run test-invoice
```
Generates a dummy invoice with sample data so you can see the PDF format.

## Billing Details

- **Rate**: Madison Water Utility Tier 2 (currently $7.71/1,000 gal effective 5/1/2026)
- **Cycle**: Every 6 months — H1 (Jan 1 – Jun 30) and H2 (Jul 1 – Dec 31)
- **No base charge split** — Tyler & Stacey pay the $14 base regardless
- **Marginal tier billing** — Shed gallons are the "extra" gallons on Tyler & Stacey's city bill

## Project Structure

```
shed-water-billing/
├── config.json          # Credentials, rates, party info
├── package.json
├── README.md
├── src/
│   ├── index.js         # Main billing workflow
│   ├── yolink.js        # YoLink API client
│   ├── billing.js       # Rate calculation
│   ├── invoice.js       # PDF generation
│   ├── readings.js      # Reading history storage
│   ├── read-meter.js    # Standalone meter reading script
│   └── test-invoice.js  # Sample invoice generator
├── data/
│   └── readings.json    # Meter reading history (auto-created)
└── invoices/            # Generated PDF invoices (auto-created)
```

## Rate Updates

When Madison changes water rates (~every 2 years), update `billing.ratePerThousandGallons` in `config.json`. The current rate schedule is at:
https://www.cityofmadison.com/water/billing-rates/view-current-rates-fees

## Still To Do

- [ ] Plug in YoLink UAC credentials
- [ ] Confirm meter device ID and token
- [ ] Set up Gmail integration for email delivery
- [ ] Choose and configure the scheduler/runner (GitHub Actions, Railway, etc.)
