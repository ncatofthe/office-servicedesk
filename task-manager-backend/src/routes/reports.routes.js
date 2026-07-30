const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');
const { requireFeature } = require('../middlewares/feature.middleware');
const { getReports } = require('../controllers/reports.controller');

// Full ServiceDesk reports are limited to admin and read-only auditor roles.
router.get('/reports', authMiddleware, roleMiddleware(['ADMIN', 'VIEWER']), requireFeature('reports'), getReports);

module.exports = router;
