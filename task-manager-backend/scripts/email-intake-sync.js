#!/usr/bin/env node

require('dotenv').config();

const prisma = require('../src/prisma/prisma.js');
const { syncEmailInbox } = require('../src/services/email-intake.service.js');

const main = async() => {
    const result = await syncEmailInbox();
    console.log(JSON.stringify(result, null, 2));
};

main()
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(async() => {
        await prisma.$disconnect();
    });
