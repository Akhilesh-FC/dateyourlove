// services/paytmService.js
const PaytmChecksum = require('paytmchecksum');

// Load PayTM credentials from environment variables
const MID = process.env.PAYTM_MID;
const MERCHANT_KEY = process.env.PAYTM_MERCHANT_KEY;
const WEBSITE = process.env.PAYTM_WEBSITE || 'WEBSTAGING';

const PAYTM_ENV = String(process.env.PAYTM_ENV || '').toLowerCase();
const isProd = PAYTM_ENV === 'prod' || PAYTM_ENV === 'production';
const INITIATE_URL = isProd
  ? 'https://secure.paytmpayments.com/theia/api/v1/initiateTransaction'
  : 'https://securestage.paytmpayments.com/theia/api/v1/initiateTransaction';

const CALLBACK_URL = process.env.PAYTM_CALLBACK_URL ||
  `${process.env.BASE_URL || 'http://localhost:3001'}/api/subscription/paytm/webhook`;

if (!process.env.PAYTM_CALLBACK_URL) {
  console.warn('PAYTM_CALLBACK_URL is not set. Using fallback callback URL:', CALLBACK_URL);
}

async function generateSignature(body) {
  try {
    const signature = await PaytmChecksum.generateSignature(
      JSON.stringify(body),
      MERCHANT_KEY
    );
    return signature;
  } catch (err) {
    console.error('SIGNATURE GENERATION ERROR:', err);
    throw err;
  }
}

async function verifyChecksum(body, checksum) {
  try {
    const isValid = await PaytmChecksum.verifySignature(
      JSON.stringify(body),
      MERCHANT_KEY,
      checksum
    );
    return isValid;
  } catch (err) {
    console.error('CHECKSUM VERIFICATION ERROR:', err);
    return false;
  }
}

async function buildTransactionParams({ orderId, custId, amount }) {
  const body = {
    requestType: 'Payment',
    mid: MID,
    websiteName: WEBSITE,
    orderId,
    callbackUrl: CALLBACK_URL,
    txnAmount: {
      value: amount,
      currency: 'INR'
    },
    userInfo: {
      custId
    }
  };

  const signature = await generateSignature(body);
  const head = { signature };
  return { body, head };
}

module.exports = {
  buildTransactionParams,
  verifyChecksum,
  generateSignature,
  INITIATE_URL
};