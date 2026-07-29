const { PrismaClient } = require('@prisma/client');
const { auditManagerDepartmentReadiness } = require('../src/utils/manager-department-readiness.js');

const prisma = new PrismaClient();

async function main() {
    const report = await auditManagerDepartmentReadiness(prisma);
    console.log(JSON.stringify(report, null, 2));
}

main()
    .catch((error) => {
        if (error && error.code === 'P2021') {
            console.error('Manager department readiness audit failed: departments/user_departments tables are missing in the current database. Apply the latest Prisma migrations before running this audit.');
            process.exitCode = 1;
            return;
        }

        console.error('Manager department readiness audit failed:', error);
        process.exitCode = 1;
    })
    .finally(async() => {
        await prisma.$disconnect();
    });
