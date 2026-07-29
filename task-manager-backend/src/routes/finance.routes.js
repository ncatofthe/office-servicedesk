const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');
const {
    getTransactions,
    createTransaction,
    getAccounts,
    createAccount,
    updateAccount,
    deleteAccount
} = require('../controllers/finance.controller');
const { isAdminRole, isAgentRole } = require('../utils/roles.js');

const allowFinanceOrSelfAccountAccess = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'No authenticated user' });
    }

    if (isAdminRole(req.user.role) || isAgentRole(req.user.role) || req.user.id === req.params.userId) {
        return next();
    }

    return res.status(403).json({ error: 'Insufficient permissions' });
};

// Transactions
router.get('/transactions', authMiddleware, roleMiddleware(['ADMIN', 'AGENT']), getTransactions);
router.post('/transactions', authMiddleware, roleMiddleware(['ADMIN', 'AGENT']), createTransaction);

// Accounts
router.get('/accounts', authMiddleware, roleMiddleware(['ADMIN', 'AGENT']), getAccounts);
router.get('/accounts/:userId', authMiddleware, allowFinanceOrSelfAccountAccess, getAccounts);
router.post('/accounts', authMiddleware, roleMiddleware(['ADMIN', 'AGENT']), createAccount);
router.patch('/accounts/:id', authMiddleware, roleMiddleware(['ADMIN', 'AGENT']), updateAccount);
router.delete('/accounts/:id', authMiddleware, roleMiddleware(['ADMIN', 'AGENT']), deleteAccount);

module.exports = router;
