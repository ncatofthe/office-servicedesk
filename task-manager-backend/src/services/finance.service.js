const prisma = require('../prisma/prisma.js');
const ledgerService = require('./ledger.service.js');
const { USER_NAME_SELECT, USER_NAME_ROLE_SELECT } = require('../utils/user.select.js');
const { isAdminRole, isAgentRole } = require('../utils/roles.js');

/**
 * Finance service for transactions and accounts
 */

const createAccount = async(data, user) => {
    const { userId, type, balance = 0 } = data;

    if (!userId || !type) {
        throw new Error('Missing required fields: userId, type');
    }

    // Check user exists
    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) throw new Error('User not found');

    // Check if account already exists
    const existingAccount = await prisma.account.findUnique({ where: { userId } });
    if (existingAccount) throw new Error('Account already exists for this user');

    return prisma.account.create({
        data: {
            userId,
            type,
            balance,
        },
        include: {
            user: { select: USER_NAME_ROLE_SELECT },
        },
    });
};

const getTransactions = async(user, filters = {}) => {
    const where = {};

    // Role-based filtering
    if (!isAdminRole(user.role) && !isAgentRole(user.role)) {
        const account = await prisma.account.findUnique({
            where: { userId: user.id }
        });
        if (!account) return [];
        where.accountId = account.id;
    }

    // Filters
    if (filters.dateFrom) where.createdAt = { gte: new Date(filters.dateFrom) };
    if (filters.dateTo) {
        if (!where.createdAt) where.createdAt = {};
        where.createdAt.lte = new Date(filters.dateTo);
    }
    if (filters.category) where.category = { contains: filters.category, mode: 'insensitive' };

    const transactions = await prisma.transaction.findMany({
        where,
        include: {
            account: { include: { user: { select: USER_NAME_SELECT } } },
            task: true
        },
        orderBy: { createdAt: 'desc' }
    });

    return transactions;
};

const createTransaction = async(data, user) => {
    // Validate
    const { amount, type, category, accountId, date, description, taskId } = data;
    if (!amount || !type || !accountId) {
        throw new Error('Missing required fields: amount, type, accountId');
    }
    if (!['INCOME', 'EXPENSE'].includes(type)) {
        throw new Error('Type must be INCOME or EXPENSE');
    }
    const normalizedAmount = ledgerService.assertPositiveAmount(amount);

    // Check account exists and permission
    const account = await prisma.account.findUnique({
        where: { id: accountId }
    });
    if (!account) throw new Error('Account not found');

    if (!isAdminRole(user.role) && !isAgentRole(user.role) && account.userId !== user.id) {
        throw new Error('Access denied');
    }

    const transaction = await prisma.$transaction(async(tx) => {
        const created = await ledgerService.createTransactionWithBalanceUpdate(tx, {
            amount: normalizedAmount,
            type,
            category,
            accountId,
            description,
            taskId: taskId || null,
            createdAt: date ? new Date(date) : new Date()
        });

        return tx.transaction.findUnique({
            where: { id: created.id },
            include: {
                account: { include: { user: { select: USER_NAME_ROLE_SELECT } } },
                task: true
            }
        });
    });

    return transaction;
};

const getAccounts = async(user, targetUserId) => {
    let where = {};

    // If specific user requested
    if (targetUserId) {
        // Non-admin/finance can only view their own accounts
        if (!isAdminRole(user.role) && !isAgentRole(user.role) && user.id !== targetUserId) {
            throw new Error('Access denied');
        }
        where.userId = targetUserId;
    }

    const accounts = await prisma.account.findMany({
        where,
        include: {
            user: { select: USER_NAME_ROLE_SELECT },
            transactions: { take: 5, orderBy: { createdAt: 'desc' } }
        }
    });

    return accounts;
};

const updateAccount = async(id, data, user) => {
    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) throw new Error('Account not found');

    if (!isAdminRole(user.role) && !isAgentRole(user.role)) {
        throw new Error('Access denied');
    }

    const updated = await prisma.account.update({
        where: { id },
        data,
        include: { user: { select: USER_NAME_ROLE_SELECT } }
    });

    return updated;
};

const deleteAccount = async(id, user) => {
    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) throw new Error('Account not found');

    if (!isAdminRole(user.role) && !isAgentRole(user.role)) {
        throw new Error('Access denied');
    }

    // Delete transactions first
    await prisma.transaction.deleteMany({ where: { accountId: id } });
    await prisma.account.delete({ where: { id } });

    return { message: 'Account deleted' };
};

module.exports = {
    createAccount,
    getTransactions,
    createTransaction,
    getAccounts,
    updateAccount,
    deleteAccount
};
