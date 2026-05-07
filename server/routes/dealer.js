'use strict';

const router = require('express').Router();
const adminRouter = require('express').Router();
const { verifyToken, requireDealer, requireAdmin } = require('../middleware/auth');
const dealerController = require('../controllers/dealerController');

// Dealer routes
router.post('/apply', verifyToken, dealerController.applyDealer);
router.get('/dashboard', verifyToken, requireDealer, dealerController.getDealerDashboard);
router.get('/players', verifyToken, requireDealer, dealerController.getDealerPlayers);
router.post('/bulk-purchase', verifyToken, requireDealer, dealerController.createDealerBulkPurchase);
router.get('/revenue', verifyToken, requireDealer, dealerController.getDealerRevenue);

// Admin dealer management routes
adminRouter.use(verifyToken, requireAdmin);
adminRouter.patch('/:id/status', dealerController.updateDealerStatus);
adminRouter.get('/', dealerController.listDealers);

module.exports = { dealerRouter: router, adminDealerRouter: adminRouter };
