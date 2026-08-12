const db = require('../../config/db');

exports.showPlans = async (req, res) => {
  try {
    const [plans]        = await db.query('SELECT id, name, description, created_at FROM plans ORDER BY id ASC');
    const [durations]    = await db.query('SELECT id, plan_id, type, price FROM plan_durations ORDER BY plan_id, id ASC');
    const [features]     = await db.query('SELECT id, `key`, label FROM features ORDER BY id ASC');
    const [planFeatures] = await db.query('SELECT plan_id, feature_id, is_active FROM plan_features');

    const durationsByPlan = {};
    durations.forEach(d => {
      if (!durationsByPlan[d.plan_id]) durationsByPlan[d.plan_id] = [];
      durationsByPlan[d.plan_id].push(d);
    });

    const featureMap = {};
    features.forEach(f => { featureMap[f.id] = f; });

    const planFeaturesMap = {};
    planFeatures.forEach(pf => {
      if (!planFeaturesMap[pf.plan_id]) planFeaturesMap[pf.plan_id] = [];
      if (featureMap[pf.feature_id]) {
        planFeaturesMap[pf.plan_id].push({ ...featureMap[pf.feature_id], is_active: pf.is_active });
      }
    });

    const enrichedPlans = plans.map(p => ({
      ...p,
      durations: durationsByPlan[p.id] || [],
      features:  planFeaturesMap[p.id]  || [],
    }));

    return res.render('administrator/plans', {
      admin: req.session.admin,
      plans: enrichedPlans,
      activePage: 'plans',
      message: req.query.message || null,
      error: null,
    });
  } catch (err) {
    console.error('ADMIN PLANS ERROR:', err);
    return res.render('administrator/plans', {
      admin: req.session.admin, plans: [], activePage: 'plans',
      message: null, error: 'Unable to load plans',
    });
  }
};

// Update a single duration price
exports.updateDurationPrice = async (req, res) => {
  try {
    const id    = Number(req.params.id);
    const price = Number(req.body.price);
    if (!id || isNaN(price) || price < 0) throw new Error('Invalid data');
    await db.query('UPDATE plan_durations SET price = ?, updated_at = NOW() WHERE id = ?', [price, id]);
    return res.redirect('/admin/plans?message=' + encodeURIComponent('Price updated successfully'));
  } catch (err) {
    console.error('UPDATE DURATION ERROR:', err);
    return res.redirect('/admin/plans?error=' + encodeURIComponent('Unable to update price'));
  }
};

// Toggle a plan feature active/inactive
exports.togglePlanFeature = async (req, res) => {
  try {
    const planId    = Number(req.params.planId);
    const featureId = Number(req.params.featureId);
    await db.query(
      'UPDATE plan_features SET is_active = NOT is_active, updated_at = NOW() WHERE plan_id = ? AND feature_id = ?',
      [planId, featureId]
    );
    return res.redirect('/admin/plans?message=' + encodeURIComponent('Feature updated'));
  } catch (err) {
    console.error('TOGGLE FEATURE ERROR:', err);
    return res.redirect('/admin/plans?error=' + encodeURIComponent('Unable to update feature'));
  }
};
