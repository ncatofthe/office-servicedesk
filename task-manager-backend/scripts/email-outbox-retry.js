#!/usr/bin/env node

require('dotenv').config();

const prisma = require('../src/prisma/prisma.js');
const { retryPendingOutboundMessages } = require('../src/services/email-outbound.service.js');

const main = async() => {
    const result = await retryPendingOutboundMessages({
        source: 'cli',
        workerId: `cli-${process.pid}`
    });

    console.log('Email outbox retry result:', JSON.stringify({
        processed: result.processed,
        scanned: result.scanned,
        results: result.results
    }, null, 2));
};

main()
    .catch((error) => {
        console.error('Email outbox retry failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async() => {
        await prisma.$disconnect();
    });
