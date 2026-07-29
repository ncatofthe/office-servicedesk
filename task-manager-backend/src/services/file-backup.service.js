const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { getBackupDir, getRetentionDays } = require('./backup.service.js');
const { uploadsDir } = require('../middlewares/upload.middleware.js');

const FILE_BACKUP_PREFIX = 'taskmanager-files-backup';

const timestampForFile = (date = new Date()) => date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

const ensureSourceDir = (sourceDir = uploadsDir) => {
    fs.mkdirSync(sourceDir, { recursive: true });
    return sourceDir;
};

const getFilesBackupDir = () => {
    const backupDir = path.join(getBackupDir(), 'files');
    fs.mkdirSync(backupDir, { recursive: true });
    return backupDir;
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

const collectDirectoryStats = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        return {
            fileCount: 0,
            totalSizeBytes: 0
        };
    }

    let fileCount = 0;
    let totalSizeBytes = 0;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            const nested = collectDirectoryStats(entryPath);
            fileCount += nested.fileCount;
            totalSizeBytes += nested.totalSizeBytes;
            continue;
        }

        if (entry.isFile()) {
            const stat = fs.statSync(entryPath);
            fileCount += 1;
            totalSizeBytes += stat.size;
        }
    }

    return {
        fileCount,
        totalSizeBytes
    };
};

const readManifest = (filePath) => {
    const manifestPath = `${filePath}.json`;
    if (!fs.existsSync(manifestPath)) {
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
        return null;
    }
};

const listFileBackups = () => {
    const backupDir = getFilesBackupDir();
    return fs.readdirSync(backupDir)
        .filter((fileName) => fileName.startsWith(FILE_BACKUP_PREFIX) && fileName.endsWith('.tar.gz'))
        .map((fileName) => {
            const filePath = path.join(backupDir, fileName);
            const stat = fs.statSync(filePath);
            return {
                fileName,
                filePath,
                sizeBytes: stat.size,
                createdAt: stat.birthtime.toISOString(),
                modifiedAt: stat.mtime.toISOString(),
                manifest: readManifest(filePath)
            };
        })
        .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
};

const cleanupOldFileBackups = () => {
    const backupDir = getFilesBackupDir();
    const cutoffMs = Date.now() - getRetentionDays() * 24 * 60 * 60 * 1000;
    const removed = [];

    for (const backup of listFileBackups()) {
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
        .filter((fileName) => fileName.startsWith(FILE_BACKUP_PREFIX) && fileName.endsWith('.tar.gz.json'))
        .forEach((fileName) => {
            const manifestPath = path.join(backupDir, fileName);
            const archivePath = manifestPath.replace(/\.json$/, '');
            if (!fs.existsSync(archivePath)) {
                fs.unlinkSync(manifestPath);
                removed.push(manifestPath);
            }
        });

    return removed;
};

const runFilesBackup = async(options = {}) => {
    const sourceDir = ensureSourceDir(options.sourceDir || uploadsDir);
    const backupDir = getFilesBackupDir();
    const createdAt = new Date();
    const archivedEntryName = path.basename(sourceDir);
    const fileName = `${FILE_BACKUP_PREFIX}-${timestampForFile(createdAt)}.tar.gz`;
    const filePath = path.join(backupDir, fileName);
    const sourceParentDir = path.dirname(sourceDir);
    const sourceStats = collectDirectoryStats(sourceDir);

    try {
        await runCommand('tar', ['-czf', filePath, '-C', sourceParentDir, archivedEntryName]);
    } catch (error) {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        if (fs.existsSync(`${filePath}.json`)) {
            fs.unlinkSync(`${filePath}.json`);
        }
        throw error;
    }

    const archiveStat = fs.statSync(filePath);
    const removed = cleanupOldFileBackups();
    const manifest = {
        fileName,
        filePath,
        createdAt: createdAt.toISOString(),
        sourceDir,
        archivedEntryName,
        sourceFileCount: sourceStats.fileCount,
        sourceTotalSizeBytes: sourceStats.totalSizeBytes,
        archiveSizeBytes: archiveStat.size,
        reason: options.reason || 'manual',
        retentionDays: getRetentionDays(),
        removed
    };

    fs.writeFileSync(`${filePath}.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    return manifest;
};

const resolveFileBackupPath = (inputPath) => {
    if (!inputPath) {
        throw new Error('Путь к файловому backup обязателен.');
    }

    const backupDir = getFilesBackupDir();
    const resolved = path.isAbsolute(inputPath)
        ? inputPath
        : path.resolve(backupDir, inputPath);

    if (!fs.existsSync(resolved)) {
        throw new Error(`Файловый backup не найден: ${resolved}`);
    }

    if (!resolved.endsWith('.tar.gz')) {
        throw new Error('Поддерживаются только .tar.gz архивы, созданные backup:files:create.');
    }

    return resolved;
};

const isDirectoryEmpty = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        return true;
    }

    return fs.readdirSync(dirPath).length === 0;
};

const resolveArchiveRoot = (extractDir, archivedEntryName) => {
    const preferred = path.join(extractDir, archivedEntryName || 'uploads');
    if (fs.existsSync(preferred)) {
        return preferred;
    }

    const entries = fs.readdirSync(extractDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory());

    if (entries.length === 1) {
        return path.join(extractDir, entries[0].name);
    }

    throw new Error('Не удалось определить корневую директорию внутри файлового backup.');
};

const restoreFilesBackup = async(inputPath, options = {}) => {
    const filePath = resolveFileBackupPath(inputPath);
    const manifest = readManifest(filePath);
    const targetDir = path.resolve(options.targetDir || uploadsDir);
    const allowOverwrite = Boolean(options.allowOverwrite);
    const targetExists = fs.existsSync(targetDir);
    const targetEmpty = isDirectoryEmpty(targetDir);

    if (targetExists && !targetEmpty && !allowOverwrite) {
        throw new Error('Целевая папка не пуста. Передайте --yes для перезаписи или укажите пустую папку назначения.');
    }

    const restoreTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskmanager-files-restore-'));
    const extractDir = path.join(restoreTempDir, 'extract');
    fs.mkdirSync(extractDir, { recursive: true });

    try {
        await runCommand('tar', ['-xzf', filePath, '-C', extractDir]);
        const archiveRoot = resolveArchiveRoot(extractDir, manifest?.archivedEntryName);

        fs.mkdirSync(path.dirname(targetDir), { recursive: true });
        if (fs.existsSync(targetDir) && (allowOverwrite || targetEmpty)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
        }

        fs.cpSync(archiveRoot, targetDir, { recursive: true, force: true });

        const restoredStats = collectDirectoryStats(targetDir);
        return {
            filePath,
            targetDir,
            restoredAt: new Date().toISOString(),
            restoredFileCount: restoredStats.fileCount,
            restoredTotalSizeBytes: restoredStats.totalSizeBytes
        };
    } finally {
        fs.rmSync(restoreTempDir, { recursive: true, force: true });
    }
};

module.exports = {
    cleanupOldFileBackups,
    getFilesBackupDir,
    listFileBackups,
    restoreFilesBackup,
    runFilesBackup
};
