#!/usr/bin/env node

require('dotenv').config();

const {
    cleanupOldFileBackups,
    getFilesBackupDir,
    listFileBackups,
    restoreFilesBackup,
    runFilesBackup
} = require('../src/services/file-backup.service.js');

const command = process.argv[2];
const args = process.argv.slice(3);

const printUsage = () => {
    console.log(`
Files backup utility

Usage:
  node scripts/files-backup.js create
  node scripts/files-backup.js list
  node scripts/files-backup.js cleanup
  node scripts/files-backup.js restore <fileName-or-path> [target-dir] [--yes]

Environment:
  BACKUP_DIR                Backup directory root, default: <project-root>/backups
  BACKUP_RETENTION_DAYS     Retention in days, default: 2
`);
};

const printBackups = (backups) => {
    if (backups.length === 0) {
        console.log(`No file backups found in ${getFilesBackupDir()}`);
        return;
    }

    for (const backup of backups) {
        const sourceFileCount = backup.manifest?.sourceFileCount ?? 'n/a';
        console.log(`${backup.fileName} | ${backup.sizeBytes} bytes | files=${sourceFileCount} | ${backup.modifiedAt}`);
    }
};

const main = async() => {
    if (!command || command === 'help' || command === '--help' || command === '-h') {
        printUsage();
        return;
    }

    if (command === 'create') {
        const backup = await runFilesBackup({ reason: 'manual' });
        console.log('File backup created:');
        console.log(JSON.stringify(backup, null, 2));
        return;
    }

    if (command === 'list') {
        printBackups(listFileBackups());
        return;
    }

    if (command === 'cleanup') {
        const removed = cleanupOldFileBackups();
        console.log(`Removed ${removed.length} expired file backup artifact(s).`);
        for (const filePath of removed) {
            console.log(filePath);
        }
        return;
    }

    if (command === 'restore') {
        const positionalArgs = args.filter((arg) => !arg.startsWith('--'));
        const filePath = positionalArgs[0];
        const targetDir = positionalArgs[1];
        const allowOverwrite = args.includes('--yes');

        const result = await restoreFilesBackup(filePath, {
            targetDir,
            allowOverwrite
        });
        console.log('File backup restored:');
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    throw new Error(`Unknown command: ${command}`);
};

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
