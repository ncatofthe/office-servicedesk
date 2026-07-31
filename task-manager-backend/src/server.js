require('dotenv').config();
const prisma = require('./prisma/prisma.js');
const app = require('./app.js');
const { startBackupScheduler, stopBackupScheduler } = require('./services/backup.service.js');
const { startEmailIntakeScheduler, stopEmailIntakeScheduler } = require('./services/email-intake.service.js');
const { startEmailOutboxWorker, stopEmailOutboxWorker } = require('./services/email-outbox-worker.service.js');
const { loadEmailSettings } = require('./services/email-settings.service.js');
const PORT = process.env.PORT || 5001;

// Graceful shutdown
process.on('SIGTERM', async() => {
    console.log('SIGTERM received, shutting down gracefully');
    stopBackupScheduler();
    stopEmailIntakeScheduler();
    stopEmailOutboxWorker();
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGINT', async() => {
    console.log('SIGINT received, shutting down gracefully');
    stopBackupScheduler();
    stopEmailIntakeScheduler();
    stopEmailOutboxWorker();
    await prisma.$disconnect();
    process.exit(0);
});

const startServer = async() => {
    await loadEmailSettings();
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        startBackupScheduler();
        startEmailIntakeScheduler();
        startEmailOutboxWorker();
    });
};

startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

module.exports = app;
