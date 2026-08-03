// controllers/Api/paytmWebhookController.js
const db = require('../../config/db');
const { verifyChecksum } = require('../../services/paytmService');

exports.handle = async (req, res) => {
  try {
    const received = req.body;
    console.log('PAYTM WEBHOOK RECEIVED:', JSON.stringify(received));

    let signature;
    let params;

    if (received.head && received.body) {
      signature = received.head.signature;
      params = received.body;
    } else {
      signature = received.CHECKSUMHASH;
      const { CHECKSUMHASH, ...rest } = received;
      params = rest;
    }

    if (!signature || !params) {
      console.warn('PayTM webhook missing signature or payload');
      return res.status(400).json({ message: 'Invalid PayTM webhook payload' });
    }

    const isValid = await verifyChecksum(params, signature);

    if (!isValid) {
      console.warn('PayTM checksum verification failed');
      return res.status(400).json({ message: 'Checksum verification failed' });
    }

    const orderId = params.orderId || params.ORDERID;
    const txnStatus = params.STATUS || params.status || params.resultInfo?.resultStatus;
    const txnId = params.TXNID || params.txnId || params.txnId || params.TXNID || null;

    const [subs] = await db.query(
      `SELECT us.*, pd.type AS duration_type
       FROM user_subscriptions us
       JOIN plan_durations pd ON pd.id = us.plan_duration_id
       WHERE us.paytm_order_id = ?`,
      [orderId]
    );

    if (!subs.length) {
      return res.status(404).json({ message: 'Subscription not found' });
    }
    const subscription = subs[0];

    const successStatuses = new Set(['TXN_SUCCESS', 'SUCCESS', 'S']);
    const isSuccess = successStatuses.has(txnStatus);

    if (isSuccess) {
      const now = new Date();
      let durationDays = 30;
      if (subscription.duration_type === '1_week') durationDays = 7;
      else if (subscription.duration_type === '1_month') durationDays = 30;
      else if (subscription.duration_type === '6_months') durationDays = 180;

      const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

      await db.query(
        `UPDATE user_subscriptions
         SET status = 'active', paytm_txn_id = ?, start_date = ?, end_date = ?, updated_at = NOW()
         WHERE id = ?`,
        [txnId, now.toISOString().slice(0, 10), expiresAt.toISOString().slice(0, 10), subscription.id]
      );

      return res.status(200).json({ message: 'Subscription activated' });
    } else {
      await db.query(
        `UPDATE user_subscriptions
         SET status = 'cancelled', paytm_txn_id = ?, updated_at = NOW()
         WHERE id = ?`,
        [txnId, subscription.id]
      );

      return res.status(200).json({ message: 'Payment failed, subscription cancelled' });
    }
  } catch (err) {
    console.error('PAYTM WEBHOOK ERROR:', err);
    return res.status(500).json({ message: 'Webhook processing error', error: err.message });
  }
};