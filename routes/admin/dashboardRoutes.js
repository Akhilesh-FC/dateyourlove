// routes/admin/dashboardRoutes.js
// All admin dashboard related routes (login, dashboard, product & combo management)

const express = require('express');
const router = express.Router();

const adminController = require('../../controllers/Admin/adminController');
const productAdminController = require('../../controllers/Admin/productAdminController');
const userAdminController = require('../../controllers/Admin/userAdminController');
const planAdminController = require('../../controllers/Admin/planAdminController');
const likeAdminController = require('../../controllers/Admin/likeAdminController');
const settingAdminController = require('../../controllers/Admin/settingAdminController');
const subscriptionAdminController = require('../../controllers/Admin/subscriptionAdminController');
// const comboAdminController = require('../../controllers/Admin/comboOfferAdminController'); // removed - not used
const auth = require('../../middleware/auth');
const upload = require('../../middleware/upload'); // multer config for file uploads

// Authentication routes
router.get('/login', adminController.showLogin);
router.post('/login', adminController.processLogin);
router.get('/logout', adminController.logout);

// Protected dashboard
router.get('/dashboard', auth, adminController.dashboard);
router.get('/users', auth, userAdminController.showUsers);
router.get('/plans', auth, planAdminController.showPlans);
router.post('/plans/duration/:id/price', auth, planAdminController.updateDurationPrice);
router.post('/plans/:planId/feature/:featureId/toggle', auth, planAdminController.togglePlanFeature);
router.get('/subscriptions', auth, subscriptionAdminController.showSubscriptions);
router.get('/like-limits', auth, likeAdminController.showLikeLimits);
router.post('/like-limits', auth, likeAdminController.saveLikeLimits);
router.post('/like-limits/:id', auth, likeAdminController.saveSingleLimit);
router.get('/settings', auth, settingAdminController.showSettings);
router.post('/settings', auth, settingAdminController.saveSetting);
router.get('/change-password', auth, adminController.showChangePassword);
router.post('/change-password', auth, adminController.processChangePassword);

// Product management (CRUD)
router.get('/products', auth, productAdminController.listProducts);
router.get('/products/add', auth, productAdminController.showAddProductForm);
router.post('/products/add', auth, upload.single('image'), productAdminController.createProduct);
router.get('/products/edit/:id', auth, productAdminController.showEditProductForm);
router.post('/products/edit/:id', auth, upload.single('image'), productAdminController.updateProduct);
router.post('/products/delete/:id', auth, productAdminController.deleteProduct);

// Combo offer management (CRUD placeholders)
// Combo routes removed (no combo offers in this project)

module.exports = router;
