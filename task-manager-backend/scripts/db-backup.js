#!/usr/bin/env node

require('dotenv').config();

const {
    cleanupOldBackups,
    getBackupDir,
    getNextRunAt,
    getRetentionDays,
    listBackups,
    restoreBackup,
    runBackup
} = require('../src/services/backup.service.js');

const command = process.argv[2];
const args = process.argv.slice(3);

const printUsage = () => {
    console.log(`
Database backup utility

Usage:
  node scripts/db-backup.js create
  node scripts/db-backup.js list
  node scripts/db-backup.js cleanup
  node scripts/db-backup.js restore <fileName-or-path> --yes
  node scripts/db-backup.js next-run

Environment:
  DATABASE_URL              PostgreSQL connection string
  BACKUP_DIR                Backup directory, default: <project-root>/backups
  BACKUP_RETENTION_DAYS     Retention in days, default: 2
  BACKUP_HOUR               Daily scheduler hour, default: 3
  BACKUP_MINUTE             Daily scheduler minute, default: 0
`);
};

const printBackups = (backups) => {
    if (backups.length === 0) {
        console.log(`No backups found in ${getBackupDir()}`);
        return;
    }

    for (const backup of backups) {
        console.log(`${backup.fileName} | ${backup.sizeBytes} bytes | ${backup.modifiedAt}`);
    }
};

const main = async() => {
    if (!command || command === 'help' || command === '--help' || command === '-h') {
        printUsage();
        return;
    }

    if (command === 'create') {
        const backup = await runBackup({ reason: 'manual' });
        console.log('Backup created:');
        console.log(JSON.stringify(backup, null, 2));
        return;
    }

    if (command === 'list') {
        printBackups(listBackups());
        return;
    }

    if (command === 'cleanup') {
        const removed = cleanupOldBackups();
        console.log(`Removed ${removed.length} expired backup file(s). Retention: ${getRetentionDays()} day(s).`);
        for (const filePath of removed) {
            console.log(filePath);
        }
        return;
    }

    if (command === 'restore') {
        const filePath = args.find((arg) => !arg.startsWith('--'));
        if (!args.includes('--yes')) {
            throw new Error('Restore is destructive. Re-run with --yes to confirm.');
        }

        const result = await restoreBackup(filePath);
        console.log('Backup restored:');
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    if (command === 'next-run') {
        console.log(JSON.stringify({
            backupDir: getBackupDir(),
            retentionDays: getRetentionDays(),
            nextRunAt: getNextRunAt().toISOString()
        }, null, 2));
        return;
    }

    throw new Error(`Unknown command: ${command}`);
};

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
