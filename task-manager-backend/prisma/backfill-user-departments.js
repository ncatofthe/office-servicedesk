const { PrismaClient } = require('@prisma/client');
const { backfillUserDepartmentsFromLegacy } = require('../src/utils/department-membership.js');

const prisma = new PrismaClient();

async function main() {
    const result = await backfillUserDepartmentsFromLegacy(prisma);
    console.log('Legacy department backfill completed:', result);
}

main()
    .catch((error) => {
        if (error && error.code === 'P2021') {
            console.error('Legacy department backfill failed: departments/user_departments tables are missing in the current database. Apply the latest Prisma migrations before running this script.');
            process.exitCode = 1;
            return;
        }

        console.error('Legacy department backfill failed:', error);
        process.exitCode = 1;
    })
    .finally(async() => {
        await prisma.$disconnect();
    });
