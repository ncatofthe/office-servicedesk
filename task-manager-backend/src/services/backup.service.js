const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const DEFAULT_BACKUP_DIR = path.join(PROJECT_ROOT, 'backups');
const BACKUP_PREFIX = 'taskmanager-backup';
const MAX_TIMEOUT_MS = 2_147_483_647;

let schedulerTimer = null;
let schedulerRunning = false;

const toBoolean = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

const getRetentionDays = () => {
    const parsed = Number.parseInt(process.env.BACKUP_RETENTION_DAYS || '2', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
};

const getBackupDir = () => {
    const configured = process.env.BACKUP_DIR || DEFAULT_BACKUP_DIR;
    return path.isAbsolute(configured) ? configured : path.resolve(PROJECT_ROOT, configured);
};

const ensureBackupDir = () => {
    const backupDir = getBackupDir();
    fs.mkdirSync(backupDir, { recursive: true });
    return backupDir;
};

const timestampForFile = (date = new Date()) => date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

const maskDatabaseUrl = (databaseUrl) => {
    try {
        const url = new URL(databaseUrl);
        if (url.password) url.password = '***';
        if (url.username) url.username = '***';
        return url.toString();
    } catch {
        return databaseUrl ? '[configured]' : '[missing]';
    }
};

const getPgToolDatabaseUrl = () => {
    const databaseUrl = process.env.DATABASE_URL;
    try {
        const url = new URL(databaseUrl);
        url.searchParams.delete('schema');
        return url.toString();
    } catch {
        return databaseUrl;
    }
};

const runCommand = (command, args) => new Promise((resolve, reject) => {
    const child = spawn(command, args, {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
    });
    child.on('error', (error) => {
        reject(error);
    });
    child.on('close', (code) => {
        if (code === 0) {
            resolve({ stdout, stderr });
            return;
        }

        const error = new Error(`${command} exited with code ${code}: ${stderr || stdout || 'no output'}`);
        error.code = code;
        reject(error);
    });
});

const listBackups = () => {
    const backupDir = ensureBackupDir();
    return fs.readdirSync(backupDir)
        .filter((fileName) => fileName.startsWith(BACKUP_PREFIX) && fileName.endsWith('.dump'))
        .map((fileName) => {
            const filePath = path.join(backupDir, fileName);
            const stat = fs.statSync(filePath);
            const manifestPath = `${filePath}.json`;
            let manifest = null;

            if (fs.existsSync(manifestPath)) {
                try {
                    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                } catch {
                    manifest = null;
                }
            }

            return {
                fileName,
                filePath,
                sizeBytes: stat.size,
                createdAt: stat.birthtime.toISOString(),
                modifiedAt: stat.mtime.toISOString(),
                manifest
            };
        })
        .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
};

const cleanupOldBackups = () => {
    const backupDir = ensureBackupDir();
    const cutoffMs = Date.now() - getRetentionDays() * 24 * 60 * 60 * 1000;
    const removed = [];

    for (const backup of listBackups()) {
        const modifiedMs = new Date(backup.modifiedAt).getTime();
        if (modifiedMs >= cutoffMs) {
            continue;
        }

        for (const filePath of [backup.filePath, `${backup.filePath}.json`]) {
            if (!fs.existsSync(filePath)) {
                continue;
            }

            fs.unlinkSync(filePath);
            removed.push(filePath);
        }
    }

    fs.readdirSync(backupDir)
        .filter((fileName) => fileName.startsWith(BACKUP_PREFIX) && fileName.endsWith('.dump.json'))
        .forEach((fileName) => {
            const filePath = path.join(backupDir, fileName);
            const dumpPath = filePath.replace(/\.json$/, '');
            if (!fs.existsSync(dumpPath)) {
                fs.unlinkSync(filePath);
                removed.push(filePath);
            }
        });

    return removed;
};

const runBackup = async(options = {}) => {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is required for database backups.');
    }

    const backupDir = ensureBackupDir();
    const createdAt = new Date();
    const fileName = `${BACKUP_PREFIX}-${timestampForFile(createdAt)}.dump`;
    const filePath = path.join(backupDir, fileName);

    try {
        await runCommand('pg_dump', [
            '--format=custom',
            '--no-owner',
            `--dbname=${getPgToolDatabaseUrl()}`,
            `--file=${filePath}`
        ]);
    } catch (error) {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        if (fs.existsSync(`${filePath}.json`)) {
            fs.unlinkSync(`${filePath}.json`);
        }
        throw error;
    }

    const stat = fs.statSync(filePath);
    const removed = cleanupOldBackups();
    const manifest = {
        fileName,
        filePath,
        createdAt: createdAt.toISOString(),
        sizeBytes: stat.size,
        reason: options.reason || 'manual',
        retentionDays: getRetentionDays(),
        databaseUrl: maskDatabaseUrl(process.env.DATABASE_URL),
        removed
    };

    fs.writeFileSync(`${filePath}.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    return manifest;
};

const resolveBackupPath = (inputPath) => {
    if (!inputPath) {
        throw new Error('Backup file path is required.');
    }

    const backupDir = ensureBackupDir();
    const resolved = path.isAbsolute(inputPath)
        ? inputPath
        : path.resolve(backupDir, inputPath);

    if (!fs.existsSync(resolved)) {
        throw new Error(`Backup file not found: ${resolved}`);
    }

    if (!resolved.endsWith('.dump')) {
        throw new Error('Only .dump backups created by pg_dump custom format are supported.');
    }

    return resolved;
};

const restoreBackup = async(inputPath) => {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is required for database restore.');
    }

    const filePath = resolveBackupPath(inputPath);

    await runCommand('pg_restore', [
        '--clean',
        '--if-exists',
        '--no-owner',
        `--dbname=${getPgToolDatabaseUrl()}`,
        filePath
    ]);

    return {
        filePath,
        restoredAt: new Date().toISOString(),
        databaseUrl: maskDatabaseUrl(process.env.DATABASE_URL)
    };
};

const getScheduleConfig = () => {
    const hour = Number.parseInt(process.env.BACKUP_HOUR || '3', 10);
    const minute = Number.parseInt(process.env.BACKUP_MINUTE || '0', 10);

    return {
        enabled: toBoolean(process.env.BACKUP_ENABLED),
        filesEnabled: toBoolean(process.env.BACKUP_FILES_ENABLED),
        hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 3,
        minute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 0
    };
};

const getNextRunAt = (fromDate = new Date()) => {
    const { hour, minute } = getScheduleConfig();
    const next = new Date(fromDate);
    next.setHours(hour, minute, 0, 0);

    if (next <= fromDate) {
        next.setDate(next.getDate() + 1);
    }

    return next;
};

const scheduleNextBackup = () => {
    const nextRunAt = getNextRunAt();
    const delay = Math.min(nextRunAt.getTime() - Date.now(), MAX_TIMEOUT_MS);

    schedulerTimer = setTimeout(async() => {
        try {
            schedulerRunning = true;
            const result = await runBackup({ reason: 'scheduled' });
            console.log('[backup] Database backup created', {
                fileName: result.fileName,
                sizeBytes: result.sizeBytes,
                removed: result.removed.length
            });

            if (getScheduleConfig().filesEnabled) {
                try {
                    // Lazy import avoids a module cycle: file-backup reuses backup directory helpers.
                    const { runFilesBackup } = require('./file-backup.service.js');
                    const filesResult = await runFilesBackup({ reason: 'scheduled' });
                    console.log('[backup] Files backup created', {
                        fileName: filesResult.fileName,
                        sourceFileCount: filesResult.sourceFileCount,
                        archiveSizeBytes: filesResult.archiveSizeBytes,
                        removed: filesResult.removed.length
                    });
                } catch (error) {
                    console.error('[backup] Scheduled files backup failed:', error.message);
                }
            }
        } catch (error) {
            console.error('[backup] Scheduled database backup failed:', error.message);
        } finally {
            schedulerRunning = false;
            scheduleNextBackup();
        }
    }, delay);

    if (typeof schedulerTimer.unref === 'function') {
        schedulerTimer.unref();
    }

    return nextRunAt;
};

const startBackupScheduler = () => {
    const config = getScheduleConfig();
    if (!config.enabled) {
        return null;
    }

    if (schedulerTimer) {
        return getNextRunAt();
    }

    const nextRunAt = scheduleNextBackup();
    console.log(`[backup] Scheduler enabled. Next run: ${nextRunAt.toISOString()}`);
    return nextRunAt;
};

const stopBackupScheduler = () => {
    if (schedulerTimer) {
        clearTimeout(schedulerTimer);
        schedulerTimer = null;
    }
};

module.exports = {
    cleanupOldBackups,
    getBackupDir,
    getNextRunAt,
    getRetentionDays,
    listBackups,
    restoreBackup,
    runBackup,
    startBackupScheduler,
    stopBackupScheduler,
    isBackupRunning: () => schedulerRunning
};
