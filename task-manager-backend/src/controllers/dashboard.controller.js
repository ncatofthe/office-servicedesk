const dashboardService = require('../services/dashboard.service.js');

const getDashboard = async(req, res) => {
    try {
        const dashboard = await dashboardService.getDashboard(req.user);
        res.json(dashboard);
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
};

module.exports = { getDashboard };