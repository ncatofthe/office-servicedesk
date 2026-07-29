const {
    getEmailOutboundConfig,
    retryPendingOutboundMessages
} = require('./email-outbound.service.js');

let outboxWorkerTimer = null;
let outboxWorkerRunning = false;

const runOutboxWorkerTick = async() => {
    if (outboxWorkerRunning) {
        return;
    }

    outboxWorkerRunning = true;
    try {
        const config = getEmailOutboundConfig();
        const result = await retryPendingOutboundMessages({
            source: 'worker',
            workerId: `worker-${process.pid}`,
            limit: config.workerBatchSize
        });

        if (result.processed > 0 || result.scanned > 0) {
            console.log(`[email-outbox-worker] scanned=${result.scanned} processed=${result.processed}`);
        }
    } catch (error) {
        console.error('[email-outbox-worker] tick failed:', error.message);
    } finally {
        outboxWorkerRunning = false;
    }
};

const startEmailOutboxWorker = () => {
    if (outboxWorkerTimer) {
        return getEmailOutboundConfig().workerIntervalMs;
    }

    const config = getEmailOutboundConfig();
    if (!config.workerEnabled) {
        console.log('[email-outbox-worker] disabled (EMAIL_OUTBOX_WORKER_ENABLED=false)');
        return config.workerIntervalMs;
    }

    outboxWorkerTimer = setInterval(() => {
        runOutboxWorkerTick().catch((error) => {
            console.error('[email-outbox-worker] unexpected error:', error.message);
        });
    }, config.workerIntervalMs);
    if (typeof outboxWorkerTimer.unref === 'function') {
        outboxWorkerTimer.unref();
    }

    runOutboxWorkerTick().catch((error) => {
        console.error('[email-outbox-worker] first tick failed:', error.message);
    });

    console.log(`[email-outbox-worker] started interval=${config.workerIntervalMs}ms batch=${config.workerBatchSize}`);
    return config.workerIntervalMs;
};

const stopEmailOutboxWorker = () => {
    if (!outboxWorkerTimer) {
        return false;
    }

    clearInterval(outboxWorkerTimer);
    outboxWorkerTimer = null;
    outboxWorkerRunning = false;
    return true;
};

module.exports = {
    runOutboxWorkerTick,
    startEmailOutboxWorker,
    stopEmailOutboxWorker
};
