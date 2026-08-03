// services/paytmService.js
const crypto = require('crypto');

// Load PayTM credentials from environment variables
const MID = process.env.PAYTM_MID;
const MERCHANT_KEY = process.env.PAYTM_MERCHANT_KEY;
const WEBSITE = process.env.PAYTM_WEBSITE || 'DEFAULT';
const CHANNEL_ID = process.env.PAYTM_CHANNEL_ID || 'WEB';
const INDUSTRY_TYPE_ID = process.env.PAYTM_INDUSTRY_TYPE_ID || 'Retail';
const CALLBACK_URL = process.env.PAYTM_CALLBACK_URL; // e.g., https://your-domain.com/api/paytm/webhook

/**
 * Generate a checksum for PayTM transaction parameters.
 * The checksum algorithm here uses SHA‑256 over a pipe‑joined string of sorted key|value pairs
 * plus the merchant key, matching the simple implementation used in the controller.
 */
function generateChecksum(params) {
  const data = Object.keys(params)
    .sort()
    .map((k) => `${k}|${params[k]}`)
    .join('|');
  return crypto.createHash('sha256').update(data + '|' + MERCHANT_KEY).digest('hex');
}

/** Verify the checksum returned by PayTM */
function verifyChecksum(params, checksum) {
  const expected = generateChecksum(params);
  return expected === checksum;
}

/** Build transaction parameters for a given order */
function buildTransactionParams({ orderId, custId, amount, email, mobile }) {
  const params = {
    MID,
    WEBSITE,
    CHANNEL_ID,
    INDUSTRY_TYPE_ID,
    ORDER_ID: orderId,
    CUST_ID: custId,
    TXN_AMOUNT: amount,
    EMAIL: email,
    MOBILE_NO: mobile,
    CALLBACK_URL,
  };
  const checksum = generateChecksum(params);
  return { params, checksum };
}

module.exports = { buildTransactionParams, verifyChecksum };
