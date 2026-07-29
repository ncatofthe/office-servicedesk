#!/usr/bin/env node
const path = require('path');
const { importFreshdeskFile } = require('../src/services/freshdesk-import.service.js');

const printUsage = () => {
    console.log('Использование: npm --workspace task-manager-backend run import:freshdesk -- --file /path/to/file.json [--dry-run]');
};

const parseArgs = (argv) => {
    const args = {
        file: null,
        dryRun: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === '--file') {
            args.file = argv[index + 1] || null;
            index += 1;
            continue;
        }
        if (token === '--dry-run') {
            args.dryRun = true;
        }
    }

    return args;
};

const main = async() => {
    const args = parseArgs(process.argv.slice(2));
    if (!args.file) {
        printUsage();
        process.exitCode = 1;
        return;
    }

    const filePath = path.resolve(args.file);
    const result = await importFreshdeskFile({
        filePath,
        dryRun: args.dryRun
    });

    console.log(JSON.stringify({
        runId: result.run.id,
        status: result.run.status,
        dryRun: result.run.dryRun,
        summary: result.summary,
        errors: result.errors
    }, null, 2));
};

main().catch((error) => {
    console.error('[freshdesk-import] Ошибка импорта:', error.message);
    process.exitCode = 1;
});
