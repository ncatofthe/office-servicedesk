const financeService = require('../services/finance.service.js');

const createAccount = async(req, res) => {
    try {
        const account = await financeService.createAccount(req.body, req.user);
        res.status(201).json(account);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const getTransactions = async(req, res) => {
    try {
        const transactions = await financeService.getTransactions(req.user, req.query);
        res.json(transactions);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const createTransaction = async(req, res) => {
    try {
        const transaction = await financeService.createTransaction(req.body, req.user);
        res.status(201).json(transaction);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const getAccounts = async(req, res) => {
    try {
        const { userId } = req.params;
        const accounts = await financeService.getAccounts(req.user, userId);
        res.json(accounts);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const updateAccount = async(req, res) => {
    try {
        const account = await financeService.updateAccount(req.params.id, req.body, req.user);
        res.json(account);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const deleteAccount = async(req, res) => {
    try {
        await financeService.deleteAccount(req.params.id, req.user);
        res.json({ message: 'Account deleted successfully' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

module.exports = {
    createAccount,
    getTransactions,
    createTransaction,
    getAccounts,
    updateAccount,
    deleteAccount
};