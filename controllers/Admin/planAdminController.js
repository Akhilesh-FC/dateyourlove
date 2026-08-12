const db = require('../../config/db');

exports.showPlans = async (req, res) => {
  try {
    // All plans
    const [plans] = await db.query(
      `SELECT id, name, description, created_at FROM plans ORDER BY id ASC`
    );

    // All durations grouped by plan_id
    const [durations] = await db.query(
      `SELECT id, plan_id, type, price FROM plan_durations ORDER BY plan_id, id ASC`
    );

    // All features
    const [features] = await db.query(
      `SELECT id, \`key\`, label FROM features ORDER BY id ASC`
    );

    // All plan_features (active/inactive per plan)
    const [planFeatures] = await db.query(
      `SELECT plan_id, feature_id, is_active FROM plan_features`
    );

    // Build lookup maps
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
      planFeaturesMap[pf.plan_id].push({ ...featureMap[pf.feature_id], is_active: pf.is_active });
    });

    // Attach to each plan
    const enrichedPlans = plans.map(p => ({
      ...p,
      durations: durationsByPlan[p.id] || [],
      features: planFeaturesMap[p.id] || [],
    }));

    return res.render('administrator/plans', {
      admin: req.session.admin,
      plans: enrichedPlans,
      activePage: 'plans',
      error: null,
    });
  } catch (err) {
    console.error('ADMIN PLANS ERROR:', err);
    return res.render('administrator/plans', {
      admin: req.session.admin,
      plans: [],
      activePage: 'plans',
      error: 'Unable to load plans',
    });
  }
};
