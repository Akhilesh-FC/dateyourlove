// controllers/Api/paytmWebhookController.js
const db = require('../../config/db');
const { verifyChecksum } = require('../../services/paytmService');

exports.handle = async (req, res) => {
  try {
    const received = req.body;
    const checksum = received.CHECKSUMHASH;
    const { CHECKSUMHASH, ...params } = received;
    if (!verifyChecksum(params, checksum)) {
      console.warn('PayTM checksum verification failed');
      return res.status(400).json({ message: 'Checksum verification failed' });
    }
    const orderId = params.ORDERID;
    const txnStatus = params.STATUS;
    const [subs] = await db.query('SELECT * FROM user_subscriptions WHERE paytm_order_id = ?', [orderId]);
    if (!subs.length) {
      return res.status(404).json({ message: 'Subscription not found' });
    }
    const subscription = subs[0];
    if (txnStatus === 'TXN_SUCCESS') {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await db.query(
        `UPDATE user_subscriptions SET status = 'active', paytm_txn_id = ?, started_at = ?, expires_at = ?, updated_at = NOW() WHERE id = ?`,
        [params.TXNID, now, expiresAt, subscription.id]
      );
      return res.status(200).json({ message: 'Subscription activated' });
    } else {
      await db.query(`UPDATE user_subscriptions SET status = 'cancelled', updated_at = NOW() WHERE id = ?`, [subscription.id]);
      return res.status(200).json({ message: 'Payment failed, subscription cancelled' });
    }
  } catch (err) {
    console.error('PAYTM WEBHOOK ERROR:', err);
    return res.status(500).json({ message: 'Webhook processing error', error: err.message });
  }
};
