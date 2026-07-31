require('dotenv').config();
const settingsService = require('../src/services/email-settings.service.js');

settingsService.loadEmailSettings()
    .then(async() => ({
        settings: settingsService.publicSettings(settingsService.getRuntimeEmailSettings()),
        connections: await settingsService.testEmailConnection('BOTH')
    }))
    .then((result) => {
        const settings = result.settings;
        console.log(JSON.stringify({
            intakeEnabled: settings.intakeEnabled,
            intakePollIntervalMs: settings.intakePollIntervalMs,
            outboundEnabled: settings.outboundEnabled,
            workerEnabled: settings.workerEnabled,
            workerIntervalMs: settings.workerIntervalMs,
            notificationsEnabled: settings.notificationsEnabled,
            notificationEvents: {
                created: settings.notifyRequesterCreated,
                comment: settings.notifyRequesterComment,
                status: settings.notifyRequesterStatus,
                assigned: settings.notifyRequesterAssigned,
                assigneeAssigned: settings.notifyAssigneeAssigned
            },
            imapPasswordConfigured: settings.imapPasswordConfigured,
            smtpPasswordConfigured: settings.smtpPasswordConfigured,
            connections: result.connections
        }, null, 2));
        if (Object.values(result.connections).some((item) => !item.ok)) process.exitCode = 1;
    })
    .catch((error) => { console.error(error); process.exitCode = 1; });
