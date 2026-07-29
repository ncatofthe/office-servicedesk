const assertPositiveAmount = (amount) => {
    const normalized = Number(amount);
    if (!Number.isFinite(normalized) || normalized <= 0) {
        throw new Error('Amount must be a positive number');
    }
    return normalized;
};

const assertNonNegativeAmount = (amount) => {
    const normalized = Number(amount);
    if (!Number.isFinite(normalized) || normalized < 0) {
        throw new Error('Amount must be a non-negative number');
    }
    return normalized;
};

const createTransactionWithBalanceUpdate = async(tx, data) => {
    const {
        accountId,
        amount,
        type,
        category,
        description,
        taskId = null,
        createdAt
    } = data;

    if (!['INCOME', 'EXPENSE'].includes(type)) {
        throw new Error('Type must be INCOME or EXPENSE');
    }

    const normalizedAmount = assertPositiveAmount(amount);
    const balanceDelta = type === 'INCOME' ? normalizedAmount : -normalizedAmount;

    await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: balanceDelta } }
    });

    return tx.transaction.create({
        data: {
            accountId,
            amount: normalizedAmount,
            type,
            category,
            description,
            taskId,
            createdAt: createdAt || new Date()
        }
    });
};

const createTaskPayment = async(tx, data) => {
    const { recipientUserId, taskId, taskTitle, amount, reviewId } = data;
    const normalizedAmount = assertPositiveAmount(amount);

    // Idempotency check: prevent duplicate payments for same review
    const existingTransaction = await tx.transaction.findFirst({
        where: {
            taskId,
            description: `Payment for task ${taskTitle} (review: ${reviewId})`
        }
    });

    if (existingTransaction) {
        return existingTransaction;
    }

    // Get company system account
    const companyAccount = await tx.account.findFirst({
        where: { userId: null, type: 'COMPANY' }
    });

    // Get recipient user account
    const recipientAccount = await tx.account.findFirst({
        where: { userId: recipientUserId }
    });

    if (!recipientAccount) {
        throw new Error('Recipient user account not found');
    }

    // 1. EXPENSE from company balance
    if (companyAccount) {
        await createTransactionWithBalanceUpdate(tx, {
            accountId: companyAccount.id,
            amount: normalizedAmount,
            type: 'EXPENSE',
            category: 'task_payment',
            taskId,
            description: `Payment outflow for task ${taskTitle} (review: ${reviewId})`
        });
    }

    // 2. INCOME to employee balance
    return createTransactionWithBalanceUpdate(tx, {
        accountId: recipientAccount.id,
        amount: normalizedAmount,
        type: 'INCOME',
        category: 'task_payment',
        taskId,
        description: `Payment for task ${taskTitle} (review: ${reviewId})`
    });
};

module.exports = {
    assertPositiveAmount,
    assertNonNegativeAmount,
    createTransactionWithBalanceUpdate,
    createTaskPayment
};
