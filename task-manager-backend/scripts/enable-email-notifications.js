require('dotenv').config();
const settingsService = require('../src/services/email-settings.service.js');

settingsService.loadEmailSettings()
    .then(() => settingsService.updateEmailSettings({
        notificationsEnabled: true,
        notifyRequesterCreated: true,
        notifyRequesterComment: true,
        notifyRequesterStatus: true
    }))
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
