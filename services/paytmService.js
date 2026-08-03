// services/paytmService.js
const PaytmChecksum = require('paytmchecksum');

// Load PayTM credentials from environment variables
const MID = process.env.PAYTM_MID;
const MERCHANT_KEY = process.env.PAYTM_MERCHANT_KEY;
const WEBSITE = process.env.PAYTM_WEBSITE || 'WEBSTAGING'; // use staging name for sandbox
const CHANNEL_ID = process.env.PAYTM_CHANNEL_ID || 'WEB';
const INDUSTRY_TYPE_ID = process.env.PAYTM_INDUSTRY_TYPE_ID || 'Retail';
const CALLBACK_URL = process.env.PAYTM_CALLBACK_URL; // e.g., https://your-domain.com/api/paytm/webhook

/** Generate checksum using PaytmChecksum library (returns a Promise) */
function generateChecksum(params) {
  return PaytmChecksum.generateSignature(JSON.stringify(params), MERCHANT_KEY);
}

/** Verify checksum returned by PayTM */
function verifyChecksum(params, checksum) {
  return PaytmChecksum.verifySignature(JSON.stringify(params), MERCHANT_KEY, checksum);
}

/** Build transaction request payload for initiateTransaction */
async function buildTransactionParams({ orderId, custId, amount, email, mobile }) {
  const body = {
    requestType: 'Payment',
    mid: MID,
    websiteName: WEBSITE,
    orderId,
    callbackUrl: CALLBACK_URL,
    txnAmount: { value: amount, currency: 'INR' },
    userInfo: { custId, email: email || undefined, mobile: mobile || undefined },
    channelId: CHANNEL_ID,
    industryTypeId: INDUSTRY_TYPE_ID
  };

  const signature = await generateChecksum(body);
  const head = { signature };
  return { body, head };
}

module.exports = { buildTransactionParams, verifyChecksum };