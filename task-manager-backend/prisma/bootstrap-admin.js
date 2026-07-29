const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { syncUserPrimaryDepartmentMembership } = require('../src/utils/department-membership.js');

const prisma = new PrismaClient();

function readArg(name) {
    const prefix = `--${name}=`;
    const arg = process.argv.find((value) => value.startsWith(prefix));

    if (arg) {
        return arg.slice(prefix.length);
    }

    const envName = `BOOTSTRAP_ADMIN_${name.toUpperCase().replace(/-/g, '_')}`;
    return process.env[envName] || '';
}

function fail(message) {
    console.error(message);
    process.exitCode = 1;
}

async function main() {
    const email = readArg('email').trim().toLowerCase();
    const name = readArg('name').trim();
    const password = readArg('password');
    const position = readArg('position').trim();
    const department = readArg('department').trim();

    if (!email || !name || !password) {
        fail(
            'Usage: BOOTSTRAP_ADMIN_EMAIL=admin@company.local BOOTSTRAP_ADMIN_NAME="Platform Admin" BOOTSTRAP_ADMIN_PASSWORD="strong-password" npm --workspace task-manager-backend run prisma:bootstrap-admin'
        );
        return;
    }

    const existingUser = await prisma.user.findUnique({
        where: { email }
    });
    const adminCount = await prisma.user.count({
        where: { role: 'ADMIN' }
    });

    if (existingUser) {
        if (existingUser.role === 'ADMIN') {
            console.log(JSON.stringify({
                status: 'already_exists',
                user: {
                    id: existingUser.id,
                    email: existingUser.email,
                    role: existingUser.role
                }
            }, null, 2));
            return;
        }

        fail(`User ${email} already exists with role ${existingUser.role}. Refusing to repurpose an existing account via bootstrap script.`);
        return;
    }

    if (adminCount > 0) {
        fail('At least one ADMIN already exists. Use an authenticated ADMIN with /api/auth/register/admin or /api/users/:id/role for further operational user setup.');
        return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const admin = await prisma.user.create({
        data: {
            email,
            name,
            password: hashedPassword,
            role: 'ADMIN',
            ...(position ? { position } : {}),
            ...(department ? { department } : {})
        }
    });

    if (department) {
        await syncUserPrimaryDepartmentMembership(prisma, admin.id, department);
    }

    console.log(JSON.stringify({
        status: 'created',
        user: {
            id: admin.id,
            email: admin.email,
            role: admin.role,
            department: admin.department || null
        }
    }, null, 2));
}

main()
    .catch((error) => {
        if (error && error.code === 'P2021') {
            console.error('Bootstrap admin failed: required tables are missing in the current database. Apply the latest Prisma migrations before bootstrapping the first admin.');
            process.exitCode = 1;
            return;
        }

        console.error('Bootstrap admin failed:', error);
        process.exitCode = 1;
    })
    .finally(async() => {
        await prisma.$disconnect();
    });
