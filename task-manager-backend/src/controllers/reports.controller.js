const reportsService = require('../services/reports.service.js');

const getReports = async(req, res) => {
    try {
        const reports = await reportsService.getReports(req.user, req.query);
        res.json(reports);
    } catch (error) {
        if (error.message === 'Access denied') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        res.status(500).json({ error: 'Failed to fetch reports' });
    }
};

module.exports = { getReports };
