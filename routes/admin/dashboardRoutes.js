// routes/admin/dashboardRoutes.js
// All admin dashboard related routes (login, dashboard, product & combo management)

const express = require('express');
const router = express.Router();

const adminController = require('../../controllers/admin/adminController');
const productAdminController = require('../../controllers/admin/productAdminController');
// const comboAdminController = require('../../controllers/admin/comboOfferAdminController'); // removed - not used
const auth = require('../../middleware/auth');
const upload = require('../../middleware/upload'); // multer config for file uploads

// Authentication routes
router.get('/login', adminController.showLogin);
router.post('/login', adminController.processLogin);
router.get('/logout', adminController.logout);

// Protected dashboard
router.get('/dashboard', auth, adminController.dashboard);

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
