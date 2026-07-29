#!/usr/bin/env node
const { pullAndImportFreshdesk } = require('../src/services/freshdesk-api.service.js');

const usage = () => console.log('Использование: npm --workspace task-manager-backend run import:freshdesk:api -- [--dry-run] [--updated-since ISO] [--max-tickets N] [--download-attachments]');

const parseArgs = (argv) => {
    const args = { dryRun: false, updatedSince: null, maxTickets: null, downloadAttachments: false };
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === '--dry-run') args.dryRun = true;
        else if (token === '--download-attachments') args.downloadAttachments = true;
        else if (token === '--updated-since') args.updatedSince = argv[++index] || null;
        else if (token === '--max-tickets') args.maxTickets = Number(argv[++index]);
        else if (token === '--help') args.help = true;
        else throw new Error(`Неизвестный аргумент: ${token}`);
    }
    if (args.maxTickets !== null && (!Number.isInteger(args.maxTickets) || args.maxTickets < 1)) throw new Error('--max-tickets должен быть положительным целым числом.');
    if (args.updatedSince && Number.isNaN(new Date(args.updatedSince).getTime())) throw new Error('--updated-since должен быть ISO-датой.');
    return args;
};

const main = async() => {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) return usage();
    const result = await pullAndImportFreshdesk(args);
    console.log(JSON.stringify({
        runId: result.run.id,
        status: result.run.status,
        dryRun: result.run.dryRun,
        summary: result.summary,
        errors: result.errors
    }, null, 2));
};

main().catch((error) => {
    console.error('[freshdesk-api-import] Ошибка:', error.message);
    process.exitCode = 1;
});
