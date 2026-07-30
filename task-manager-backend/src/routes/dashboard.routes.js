const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/auth.middleware');
const { requireFeature } = require('../middlewares/feature.middleware');
const { getDashboard } = require('../controllers/dashboard.controller');

// Dashboard available to all authenticated users (data filtered by role)
router.get('/dashboard', authMiddleware, requireFeature('dashboard'), getDashboard);

module.exports = router;
