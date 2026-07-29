const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { backfillUserDepartmentsFromLegacy } = require('../src/utils/department-membership.js');
const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding...');

    // 1. Create users with hashed passwords (default pw: 'password123')
    const hashedPassword = await bcrypt.hash('password123', 12);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@taskmanager.com' },
        update: {},
        create: {
            name: 'Admin User',
            email: 'admin@taskmanager.com',
            password: hashedPassword,
            role: 'ADMIN',
            position: 'CEO',
            department: 'Management',
            skills: ['leadership', 'strategy'],
        },
    });

    const manager = await prisma.user.upsert({
        where: { email: 'manager@taskmanager.com' },
        update: {},
        create: {
            name: 'John Manager',
            email: 'manager@taskmanager.com',
            password: hashedPassword,
            role: 'AGENT',
            position: 'ServiceDesk Agent',
            department: 'Support',
            skills: ['triage', 'coordination'],
        },
    });

    const employee = await prisma.user.upsert({
        where: { email: 'employee@taskmanager.com' },
        update: {},
        create: {
            name: 'Jane Employee',
            email: 'employee@taskmanager.com',
            password: hashedPassword,
            role: 'AGENT',
            position: 'ServiceDesk Agent',
            department: 'Support',
            skills: ['workstations', 'debugging'],
        },
    });

    const existingSupport = await prisma.user.findUnique({
        where: { email: 'support@taskmanager.com' }
    });
    const legacyFinanceSupport = await prisma.user.findUnique({
        where: { email: 'finance@taskmanager.com' }
    });

    if (legacyFinanceSupport && !existingSupport) {
        await prisma.user.update({
            where: { id: legacyFinanceSupport.id },
            data: {
                email: 'support@taskmanager.com',
                name: 'Alex Support',
                password: hashedPassword,
                role: 'AGENT',
                position: 'Support Specialist',
                department: 'Support',
                skills: ['support', 'triage'],
            }
        });
    } else if (legacyFinanceSupport) {
        await prisma.user.update({
            where: { id: legacyFinanceSupport.id },
            data: {
                name: 'Alex Support (legacy)',
                password: hashedPassword,
                role: 'AGENT',
                position: 'Support Specialist',
                department: 'Support',
                skills: ['support', 'triage'],
            }
        });
    }

    const support = await prisma.user.upsert({
        where: { email: 'support@taskmanager.com' },
        update: {
            name: 'Alex Support',
            password: hashedPassword,
            role: 'AGENT',
            position: 'Support Specialist',
            department: 'Support',
            skills: ['support', 'triage'],
        },
        create: {
            name: 'Alex Support',
            email: 'support@taskmanager.com',
            password: hashedPassword,
            role: 'AGENT',
            position: 'Support Specialist',
            department: 'Support',
            skills: ['support', 'triage'],
        },
    });

    const requester = await prisma.user.upsert({
        where: { email: 'requester@taskmanager.com' },
        update: {},
        create: {
            name: 'Olga Requester',
            email: 'requester@taskmanager.com',
            password: hashedPassword,
            role: 'REQUESTER',
            position: 'Office Employee',
            department: 'Office',
            skills: ['requests'],
        },
    });

    const viewer = await prisma.user.upsert({
        where: { email: 'viewer@taskmanager.com' },
        update: {},
        create: {
            name: 'Eve Viewer',
            email: 'viewer@taskmanager.com',
            password: hashedPassword,
            role: 'VIEWER',
            position: 'Observer',
            department: 'Management',
            skills: ['reporting'],
        },
    });

    console.log('Users created:', {
        adminId: admin.id,
        managerId: manager.id,
        employeeId: employee.id,
        supportId: support.id,
        requesterId: requester.id,
        viewerId: viewer.id
    });

    const departmentBackfill = await backfillUserDepartmentsFromLegacy(prisma);
    console.log('Department memberships synchronized:', departmentBackfill);

    const folderIt = await prisma.ticketFolder.upsert({
        where: { name: 'IT и доступы' },
        update: {
            description: 'Заявки по доступам, рабочим местам и оборудованию',
            isActive: true
        },
        create: {
            name: 'IT и доступы',
            description: 'Заявки по доступам, рабочим местам и оборудованию'
        }
    });
    const folderOperations = await prisma.ticketFolder.upsert({
        where: { name: 'Операции и склад' },
        update: {
            description: 'Склад, отгрузки, возвраты и операционные вопросы',
            isActive: true
        },
        create: {
            name: 'Операции и склад',
            description: 'Склад, отгрузки, возвраты и операционные вопросы'
        }
    });
    const folderDocuments = await prisma.ticketFolder.upsert({
        where: { name: 'Документы и отгрузки' },
        update: {
            description: 'Документы, накладные, отгрузки и возвраты',
            isActive: true
        },
        create: {
            name: 'Документы и отгрузки',
            description: 'Документы, накладные, отгрузки и возвраты'
        }
    });

    const entityIncident = await prisma.ticketEntity.upsert({
        where: { code: 'INCIDENT' },
        update: { name: 'Инцидент', isActive: true },
        create: {
            name: 'Инцидент',
            code: 'INCIDENT',
            description: 'Что-то сломалось и мешает работе'
        }
    });
    const entityRequest = await prisma.ticketEntity.upsert({
        where: { code: 'REQUEST' },
        update: { name: 'Запрос', isActive: true },
        create: {
            name: 'Запрос',
            code: 'REQUEST',
            description: 'Стандартный запрос на услугу или изменение'
        }
    });
    const entityProblem = await prisma.ticketEntity.upsert({
        where: { code: 'PROBLEM' },
        update: { name: 'Проблема', isActive: true },
        create: {
            name: 'Проблема',
            code: 'PROBLEM',
            description: 'Повторяющаяся или системная проблема'
        }
    });

    const typeAccess = await prisma.ticketType.upsert({
        where: { name: 'Доступы и аккаунты' },
        update: {
            code: 'ACCESS',
            folderId: folderIt.id,
            entityId: entityRequest.id,
            isActive: true
        },
        create: {
            name: 'Доступы и аккаунты',
            code: 'ACCESS',
            description: 'Создание, изменение и восстановление доступов',
            folderId: folderIt.id,
            entityId: entityRequest.id
        }
    });
    const typeWorkplace = await prisma.ticketType.upsert({
        where: { name: 'Рабочее место' },
        update: {
            code: 'WORKPLACE',
            folderId: folderIt.id,
            entityId: entityIncident.id,
            isActive: true
        },
        create: {
            name: 'Рабочее место',
            code: 'WORKPLACE',
            description: 'Компьютеры, периферия, сеть и офисное ПО',
            folderId: folderIt.id,
            entityId: entityIncident.id
        }
    });
    const typeOneC = await prisma.ticketType.upsert({
        where: { name: '1С' },
        update: {
            code: 'ONE_C',
            folderId: folderOperations.id,
            entityId: entityProblem.id,
            isActive: true
        },
        create: {
            name: '1С',
            code: 'ONE_C',
            description: 'Ошибки, права и консультации по 1С',
            folderId: folderOperations.id,
            entityId: entityProblem.id
        }
    });
    const typeLogistics = await prisma.ticketType.upsert({
        where: { name: 'Отгрузки и возвраты' },
        update: {
            code: 'LOGISTICS',
            folderId: folderOperations.id,
            entityId: entityRequest.id,
            isActive: true
        },
        create: {
            name: 'Отгрузки и возвраты',
            code: 'LOGISTICS',
            description: 'Вопросы по складу, доставке и возвратам',
            folderId: folderOperations.id,
            entityId: entityRequest.id
        }
    });
    const typeDocuments = await prisma.ticketType.upsert({
        where: { name: 'Документы и накладные' },
        update: {
            code: 'DOCS',
            folderId: folderDocuments.id,
            entityId: entityRequest.id,
            isActive: true
        },
        create: {
            name: 'Документы и накладные',
            code: 'DOCS',
            description: 'Накладные, документы по отгрузкам и возвратам',
            folderId: folderDocuments.id,
            entityId: entityRequest.id
        }
    });

    const subtypePassword = await prisma.ticketSubtype.upsert({
        where: {
            typeId_name: {
                typeId: typeAccess.id,
                name: 'Сброс пароля'
            }
        },
        update: {
            code: 'PASSWORD_RESET',
            folderId: folderIt.id,
            isActive: true
        },
        create: {
            name: 'Сброс пароля',
            code: 'PASSWORD_RESET',
            description: 'Восстановление доступа к учётной записи',
            typeId: typeAccess.id,
            folderId: folderIt.id
        }
    });
    const subtypeNewUser = await prisma.ticketSubtype.upsert({
        where: {
            typeId_name: {
                typeId: typeAccess.id,
                name: 'Новый пользователь'
            }
        },
        update: {
            code: 'NEW_USER',
            folderId: folderIt.id,
            isActive: true
        },
        create: {
            name: 'Новый пользователь',
            code: 'NEW_USER',
            description: 'Создание учётной записи и первичных доступов',
            typeId: typeAccess.id,
            folderId: folderIt.id
        }
    });

    const teamIt = await prisma.supportTeam.upsert({
        where: { name: 'Линия поддержки IT' },
        update: {
            description: 'Исполнители первой линии по IT-заявкам',
            folderId: folderIt.id,
            isActive: true
        },
        create: {
            name: 'Линия поддержки IT',
            description: 'Исполнители первой линии по IT-заявкам',
            folderId: folderIt.id
        }
    });
    const teamOps = await prisma.supportTeam.upsert({
        where: { name: 'Операционная поддержка' },
        update: {
            description: 'Исполнители по складским и операционным заявкам',
            folderId: folderOperations.id,
            isActive: true
        },
        create: {
            name: 'Операционная поддержка',
            description: 'Исполнители по складским и операционным заявкам',
            folderId: folderOperations.id
        }
    });

    await prisma.supportTeamFolder.createMany({
        data: [
            { teamId: teamIt.id, folderId: folderIt.id },
            { teamId: teamOps.id, folderId: folderOperations.id }
        ],
        skipDuplicates: true
    });

    await prisma.supportTeamMember.upsert({
        where: {
            teamId_userId: {
                teamId: teamIt.id,
                userId: employee.id
            }
        },
        update: { role: 'Исполнитель', isLead: true },
        create: {
            teamId: teamIt.id,
            userId: employee.id,
            role: 'Исполнитель',
            isLead: true
        }
    });
    await prisma.supportTeamMember.upsert({
        where: {
            teamId_userId: {
                teamId: teamOps.id,
                userId: manager.id
            }
        },
        update: { role: 'Координатор', isLead: true },
        create: {
            teamId: teamOps.id,
            userId: manager.id,
            role: 'Координатор',
            isLead: true
        }
    });

    await prisma.knowledgeArticle.upsert({
        where: { slug: 'sbros-parolya-v-office-servicedesk' },
        update: {
            title: 'Сброс пароля в Office ServiceDesk',
            body: 'Если вы не можете войти в рабочую систему, создайте заявку в папке IT и доступы. Укажите сервис, текст ошибки и желаемый срок восстановления доступа.',
            category: 'Доступы',
            isPublished: true,
            updatedById: admin.id
        },
        create: {
            title: 'Сброс пароля в Office ServiceDesk',
            slug: 'sbros-parolya-v-office-servicedesk',
            body: 'Если вы не можете войти в рабочую систему, создайте заявку в папке IT и доступы. Укажите сервис, текст ошибки и желаемый срок восстановления доступа.',
            category: 'Доступы',
            isPublished: true,
            createdById: admin.id,
            updatedById: admin.id
        }
    });

    await prisma.knowledgeArticle.upsert({
        where: { slug: 'kak-zaprosit-novyj-dostup' },
        update: {
            title: 'Как запросить новый доступ',
            body: 'Для нового доступа выберите тип Доступы и аккаунты, опишите бизнес-цель и перечислите нужные системы. Это ускорит обработку агентом и исключит лишние уточнения.',
            category: 'Онбординг',
            isPublished: true,
            updatedById: admin.id
        },
        create: {
            title: 'Как запросить новый доступ',
            slug: 'kak-zaprosit-novyj-dostup',
            body: 'Для нового доступа выберите тип Доступы и аккаунты, опишите бизнес-цель и перечислите нужные системы. Это ускорит обработку агентом и исключит лишние уточнения.',
            category: 'Онбординг',
            isPublished: true,
            createdById: admin.id,
            updatedById: admin.id
        }
    });

    console.log('ServiceDesk demo dictionaries created');

    // 2. Clear existing demo data for clean seed
    await prisma.task.deleteMany({});
    await prisma.taskAssignee.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.transaction.deleteMany({});

    // 3. Create core tasks
    const task1 = await prisma.task.create({
        data: {
            title: 'Fix login bug',
            description: 'Users cannot login with valid credentials.',
            status: 'NEW',
            priority: 'URGENT',
            dueDate: new Date('2024-12-15'),
            folderId: folderIt.id,
            entityId: entityRequest.id,
            typeId: typeAccess.id,
            subtypeId: subtypePassword.id,
            authorId: manager.id,
        },
    });

    const task2 = await prisma.task.create({
        data: {
            title: 'Update dashboard UI',
            description: 'Improve charts and responsiveness.',
            status: 'IN_PROGRESS',
            priority: 'HIGH',
            startDate: new Date('2024-12-10'),
            folderId: folderIt.id,
            entityId: entityIncident.id,
            typeId: typeWorkplace.id,
            authorId: manager.id,
        },
    });

    const task3 = await prisma.task.create({
        data: {
            title: 'Подготовить документы по возврату',
            description: 'Нужно собрать накладные и комментарии по возврату товара.',
            status: 'IN_PROGRESS',
            priority: 'MEDIUM',
            folderId: folderDocuments.id,
            entityId: entityRequest.id,
            typeId: typeDocuments.id,
            authorId: manager.id,
        },
    });

    const task4 = await prisma.task.create({
        data: {
            title: 'Setup CI/CD pipeline',
            description: 'Automate deployments.',
            status: 'DONE',
            priority: 'LOW',
            folderId: folderIt.id,
            entityId: entityRequest.id,
            typeId: typeAccess.id,
            subtypeId: subtypeNewUser.id,
            authorId: manager.id,
        },
    });

    const task5 = await prisma.task.create({
        data: {
            title: 'Database optimization',
            description: 'Add indexes and tune queries.',
            status: 'IN_PROGRESS',
            priority: 'HIGH',
            folderId: folderOperations.id,
            entityId: entityProblem.id,
            typeId: typeOneC.id,
            authorId: manager.id,
        },
    });

    // Add 15+ DONE tasks for dashboard metrics (last 12 months, assigned to employee)
    const monthsBack = 12;
    for (let i = 0; i < monthsBack; i++) {
        const monthDate = new Date();
        monthDate.setMonth(monthDate.getMonth() - i);
        monthDate.setDate(1);
        const doneDate = new Date(monthDate);
        doneDate.setDate(monthDate.getDate() + Math.floor(Math.random() * 20) + 1);

        const doneTask = await prisma.task.create({
            data: {
                title: `Feature Task ${i + 1} - Completed`,
                description: `Task completed in ${monthDate.toLocaleDateString('ru-RU')}`,
                status: 'DONE',
                priority: i % 3 === 0 ? 'HIGH' : 'MEDIUM',
                startDate: monthDate,
                dueDate: monthDate,
                updatedAt: doneDate,
                progress: 100,
                authorId: manager.id,
            },
        });

        // Assign to employee
        await prisma.taskAssignee.create({
            data: { taskId: doneTask.id, userId: employee.id },
        });
    }

    console.log('Enhanced tasks created for dashboard');

    // Assign core tasks
    await prisma.taskAssignee.createMany({
        data: [
            { taskId: task1.id, userId: employee.id },
            { taskId: task2.id, userId: employee.id },
            { taskId: task3.id, userId: support.id },
            { taskId: task4.id, userId: employee.id },
            { taskId: task5.id, userId: employee.id },
        ],
        skipDuplicates: true,
    });

    // 5. Comments
    await prisma.taskComment.createMany({
        data: [
            { content: 'Starting work on login bug.', taskId: task1.id, authorId: employee.id },
            { content: 'Need more details on requirements.', taskId: task1.id, authorId: employee.id },
            { content: 'Dashboard charts updated.', taskId: task2.id, authorId: employee.id },
            { content: 'Накладные собраны, жду подтверждение от склада.', taskId: task3.id, authorId: support.id },
        ],
    });

    // 6. Attachments (dummy paths)
    await prisma.taskAttachment.createMany({
        data: [
            { filename: 'login-bug-screenshot.png', path: 'uploads/123456789-login-bug.png', taskId: task1.id, uploadedById: employee.id },
            { filename: 'dashboard-mockup.pdf', path: 'uploads/123456790-dashboard.pdf', taskId: task2.id, uploadedById: employee.id },
        ],
    });

    // 7. History
    await prisma.taskHistory.createMany({
        data: [
            { taskId: task1.id, userId: employee.id, field: 'status', oldValue: JSON.stringify({ status: 'NEW' }), newValue: JSON.stringify({ status: 'IN_PROGRESS' }) },
            { taskId: task2.id, userId: employee.id, field: 'status', oldValue: JSON.stringify({ status: 'NEW' }), newValue: JSON.stringify({ status: 'IN_PROGRESS' }) },
        ],
    });

    // 8. Notifications
    await prisma.notification.createMany({
        data: [
            { userId: employee.id, type: 'task_assigned', title: 'Вам назначена заявка', message: 'Новая задача: Fix login bug', taskId: task1.id },
            { userId: support.id, type: 'task_assigned', title: 'Вам назначена заявка', message: 'Новая заявка: Подготовить документы по возврату', taskId: task3.id },
            { userId: employee.id, type: 'task_comment', title: 'Новый комментарий', message: 'Добавлен комментарий по заявке Setup CI/CD pipeline', taskId: task4.id },
        ],
    });

    console.log('✅ Seeding completed successfully!');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async() => {
        await prisma.$disconnect();
    });
