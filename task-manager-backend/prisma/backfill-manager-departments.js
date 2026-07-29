const { PrismaClient } = require('@prisma/client');
const { backfillManagerDepartmentReadiness } = require('../src/utils/manager-department-readiness.js');

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
    const result = await backfillManagerDepartmentReadiness(prisma, { apply });
    console.log(JSON.stringify(result, null, 2));

    if (!apply) {
        console.log('\nDry run only. Re-run with --apply to persist auto-fixable manager memberships.');
    }
}

main()
    .catch((error) => {
        if (error && error.code === 'P2021') {
            console.error('Manager department readiness backfill failed: departments/user_departments tables are missing in the current database. Apply the latest Prisma migrations before running this script.');
            process.exitCode = 1;
            return;
        }

        console.error('Manager department readiness backfill failed:', error);
        process.exitCode = 1;
    })
    .finally(async() => {
        await prisma.$disconnect();
    });
