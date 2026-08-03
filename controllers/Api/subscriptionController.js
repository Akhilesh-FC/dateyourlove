// controllers/Api/subscriptionController.js
const db = require('../../config/db');
const { buildTransactionParams } = require('../../services/paytmService');
const { v4: uuidv4 } = require('uuid');

// List all available plans (public)
exports.listPlans = async (req, res) => {
  try {
    const planId = req.query.id ? Number(req.query.id) : null;
    if (req.query.id && Number.isNaN(planId)) {
      return res.status(400).json({ message: 'Invalid plan id' });
    }

    const planWhere = planId ? ' WHERE id = ?' : ' WHERE name IN (\'Silver\', \'Gold\', \'Platinum Plus\')';
    const planParams = planId ? [planId] : [];
    const [plansRows] = await db.query(
      `SELECT id, name, description
       FROM plans${planWhere}
       ORDER BY FIELD(name,'Silver','Gold','Platinum Plus'), id`,
      planParams
    );

    if (!plansRows.length) {
      return res.status(200).json({ plans: [] });
    }

    const planIds = plansRows.map(plan => plan.id);
    const planIdPlaceholders = planIds.map(() => '?').join(',');

    const [durationRows] = await db.query(
      `SELECT id, plan_id, type, price
       FROM plan_durations
       WHERE plan_id IN (${planIdPlaceholders})
       ORDER BY FIELD(type,'1_week','1_month','6_months')`,
      planIds
    );

    const [allFeatures] = await db.query(
      `SELECT id, label AS name FROM features ORDER BY id`
    );

    const [planFeatureRows] = await db.query(
      `SELECT plan_id, feature_id, is_active
       FROM plan_features
       WHERE plan_id IN (${planIdPlaceholders})`,
      planIds
    );

    const featureMap = planFeatureRows.reduce((map, row) => {
      if (!map[row.plan_id]) {
        map[row.plan_id] = {};
      }
      map[row.plan_id][row.feature_id] = row.is_active === 1;
      return map;
    }, {});

    const durationsByPlan = durationRows.reduce((map, row) => {
      if (!map[row.plan_id]) {
        map[row.plan_id] = [];
      }
      map[row.plan_id].push({
        id: row.id,
        type: row.type,
        price: row.price
      });
      return map;
    }, {});

    const plans = plansRows.map(plan => ({
      plan_id: plan.id,
      plan_name: plan.name,
      description: plan.description,
      starting_price: durationsByPlan[plan.id] && durationsByPlan[plan.id].length ? Math.min(...durationsByPlan[plan.id].map(d => d.price)) : 0,
      durations: durationsByPlan[plan.id] || [],
      features: allFeatures
        .filter(feature => Boolean(featureMap[plan.id] && featureMap[plan.id][feature.id]))
        .map(feature => feature.name)
    }));

    return res.status(200).json({ plans });
  } catch (err) {
    console.error('LIST PLANS ERROR:', err);
    return res.status(500).json({ message: 'Unable to fetch plans', error: err.message });
  }
};

// Get plan details by ID with durations and features
exports.getPlanDetail = async (req, res) => {
  try {
    const planId = Number(req.params.id);
    if (!planId || Number.isNaN(planId)) {
      return res.status(400).json({ message: 'Invalid plan id' });
    }

    const [planRows] = await db.query('SELECT id, name, description FROM plans WHERE id = ?', [planId]);
    if (!planRows.length) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    const plan = planRows[0];

    const [durations] = await db.query(
      `SELECT id, type, price
       FROM plan_durations
       WHERE plan_id = ?
       ORDER BY FIELD(type,'1_week','1_month','6_months')`,
      [planId]
    );

    const [features] = await db.query(
      `SELECT f.label AS name,
              IFNULL(pf.is_active, 0) AS is_active
       FROM features f
       LEFT JOIN plan_features pf
         ON pf.feature_id = f.id
         AND pf.plan_id = ?
       WHERE IFNULL(pf.is_active, 0) = 1
       ORDER BY f.id`,
      [planId]
    );

    return res.status(200).json({
      plan_id: plan.id,
      plan_name: plan.name,
      description: plan.description,
      starting_price: durations.length ? Math.min(...durations.map(d => d.price)) : 0,
      durations: durations.map(d => ({
        id: d.id,
        type: d.type,
        price: d.price
      })),
      features: features.map(f => f.name)
    });
  } catch (err) {
    console.error('GET PLAN DETAIL ERROR:', err);
    return res.status(500).json({ message: 'Unable to fetch plan detail', error: err.message });
  }
};

// Initiate payment for a selected plan (authenticated)
exports.initiatePayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const plan_duration_id = req.body.plan_duration_id || req.body.planDurationId || req.body.plan_duration_id || req.body.planDuration_id;

    if (!plan_duration_id) {
      return res.status(400).json({ message: 'Missing plan_duration_id in request body' });
    }

    const planDurationId = Number(plan_duration_id);
    if (!planDurationId || Number.isNaN(planDurationId)) {
      return res.status(400).json({ message: 'Invalid plan_duration_id value' });
    }

    const [planDurationRows] = await db.query(
      'SELECT pd.*, p.name FROM plan_durations pd JOIN plans p ON p.id = pd.plan_id WHERE pd.id = ?',
      [planDurationId]
    );
    if (!planDurationRows.length) {
      return res.status(400).json({ message: 'Invalid plan duration selected' });
    }
    const planDuration = planDurationRows[0];

    const orderId = `ORD-${uuidv4()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // placeholder

    await db.query(
      `INSERT INTO user_subscriptions (user_id, plan_duration_id, paytm_order_id, plan_name, duration_type, price_paid, status, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        userId,
        planDurationId,
        orderId,
        planDuration.name,
        planDuration.type,
        planDuration.price,
        now.toISOString().slice(0, 10),
        expiresAt.toISOString().slice(0, 10)
      ]
    );

    const txnParams = {
      orderId,
      custId: String(userId),
      amount: planDuration.price.toFixed(2),
      email: req.user.email || '',
      mobile: req.user.mobile || ''
    };
    const { params, checksum } = buildTransactionParams(txnParams);

    return res.status(200).json({
      message: 'Payment initiation successful',
      paytmParams: params,
      checksum,
      paytmUrl: process.env.PAYTM_ENV === 'PROD'
        ? 'https://securegw.paytm.in/theia/api/v1/initiateTransaction?mid=' + process.env.PAYTM_MID + '&orderId=' + orderId
        : 'https://securegw-stage.paytm.in/theia/api/v1/initiateTransaction?mid=' + process.env.PAYTM_MID + '&orderId=' + orderId
    });
  } catch (err) {
    console.error('PAYMENT INIT ERROR:', err);
    return res.status(500).json({ message: 'Unable to initiate payment', error: err.message });
  }
};
