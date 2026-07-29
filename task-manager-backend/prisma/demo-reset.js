const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Demo2026!';
const uploadDir = path.join(__dirname, '..', 'uploads');

const daysAgo = (days, hours = 0) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(date.getHours() - hours);
    return date;
};

async function resetDatabase() {
    await prisma.$executeRawUnsafe(`
        TRUNCATE TABLE
            freshdesk_import_locks,
            freshdesk_import_runs,
            task_external_references,
            notifications,
            email_outbound_messages,
            email_inbound_messages,
            automation_runs,
            automation_rules,
            task_timeline_events,
            task_close_approvals,
            task_merges,
            task_attachments,
            task_comments,
            task_history,
            task_reviews,
            transactions,
            accounts,
            task_assignees,
            tasks,
            canned_replies,
            knowledge_articles,
            support_team_members,
            support_team_folders,
            support_teams,
            product_settings,
            sla_policies,
            ticket_subtypes,
            ticket_types,
            ticket_entities,
            ticket_folders,
            user_departments,
            departments,
            users
        RESTART IDENTITY CASCADE
    `);
}

async function createDemoFile(filename, content) {
    fs.mkdirSync(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, content);
    return `/uploads/${filename}`;
}

async function createUsers() {
    const password = await bcrypt.hash(DEMO_PASSWORD, 12);
    const users = {};

    const rows = [
        ['admin', 'Анна Администратор', 'admin@taskmanager.com', 'ADMIN', 'Руководитель поддержки', 'IT-поддержка', ['администрирование', 'отчеты', 'маршрутизация']],
        ['agentIt', 'Игорь Исполнитель', 'agent.it@company.test', 'AGENT', 'Инженер ServiceDesk', 'IT-поддержка', ['vpn', 'доступы', 'рабочие места']],
        ['agentOps', 'Ольга Операции', 'agent.ops@company.test', 'AGENT', 'Специалист операций', 'Операции', ['1С', 'документы', 'отгрузки']],
        ['requester', 'Мария Заявитель', 'requester@company.test', 'REQUESTER', 'Менеджер продаж', 'Продажи', ['заявки', 'продажи']],
        ['viewer', 'Виктор Наблюдатель', 'viewer@company.test', 'VIEWER', 'Руководитель отдела', 'Руководство', ['контроль', 'аналитика']]
    ];

    for (const [key, name, email, role, position, department, skills] of rows) {
        users[key] = await prisma.user.create({
            data: { name, email, password, role, position, department, skills, isActive: true }
        });
    }

    return users;
}

async function createDepartments(users) {
    const departmentRows = [
        ['IT-поддержка', 'IT', users.admin.id],
        ['Операции', 'OPS', users.agentOps.id],
        ['Бухгалтерия', 'ACC', users.viewer.id],
        ['Продажи', 'SALES', users.viewer.id],
        ['Руководство', 'MGMT', users.admin.id]
    ];

    const departments = {};
    for (const [name, code, headUserId] of departmentRows) {
        departments[code] = await prisma.department.create({
            data: { name, code, headUserId, isActive: true }
        });
    }

    await prisma.userDepartment.createMany({
        data: [
            { userId: users.admin.id, departmentId: departments.IT.id, isPrimary: true },
            { userId: users.agentIt.id, departmentId: departments.IT.id, isPrimary: true },
            { userId: users.agentOps.id, departmentId: departments.OPS.id, isPrimary: true },
            { userId: users.requester.id, departmentId: departments.SALES.id, isPrimary: true },
            { userId: users.viewer.id, departmentId: departments.MGMT.id, isPrimary: true }
        ]
    });

    return departments;
}

async function createServiceDeskCatalog() {
    const folderIt = await prisma.ticketFolder.create({
        data: { name: 'IT и доступы', description: 'Доступы, рабочие места, сеть, VPN и оборудование' }
    });
    const folderOps = await prisma.ticketFolder.create({
        data: { name: '1С и операции', description: '1С, обмены, складские и операционные вопросы' }
    });
    const folderDocs = await prisma.ticketFolder.create({
        data: { name: 'Документы', description: 'Счета, акты, закрывающие документы и согласования' }
    });
    const folderOffice = await prisma.ticketFolder.create({
        data: { name: 'Офис', description: 'Офисная инфраструктура и общие обращения' }
    });

    const request = await prisma.ticketEntity.create({
        data: { name: 'Запрос', code: 'REQUEST', description: 'Нужна услуга, доступ или изменение' }
    });
    const incident = await prisma.ticketEntity.create({
        data: { name: 'Инцидент', code: 'INCIDENT', description: 'Что-то не работает и мешает процессу' }
    });
    const problem = await prisma.ticketEntity.create({
        data: { name: 'Проблема', code: 'PROBLEM', description: 'Повторяющаяся или системная причина' }
    });

    const typeAccess = await prisma.ticketType.create({
        data: { name: 'Доступы и аккаунты', code: 'ACCESS', description: 'Создание, изменение и восстановление доступов', folderId: folderIt.id, entityId: request.id }
    });
    const typeWorkplace = await prisma.ticketType.create({
        data: { name: 'Рабочее место и сеть', code: 'WORKPLACE', description: 'Компьютер, принтер, сеть, VPN и офисное ПО', folderId: folderIt.id, entityId: incident.id }
    });
    const typeOneC = await prisma.ticketType.create({
        data: { name: '1С и обмены', code: 'ONE_C', description: 'Ошибки, права и обмены в 1С', folderId: folderOps.id, entityId: problem.id }
    });
    const typeDocs = await prisma.ticketType.create({
        data: { name: 'Документы и согласования', code: 'DOCS', description: 'Счета, акты, закрывающие и согласования', folderId: folderDocs.id, entityId: request.id }
    });

    const subtypes = {};
    const subtypeRows = [
        ['accessPassword', 'Сброс пароля', 'ACCESS_PASSWORD', typeAccess.id, folderIt.id],
        ['accessNewUser', 'Новый пользователь', 'ACCESS_NEW_USER', typeAccess.id, folderIt.id],
        ['workplacePrinter', 'Принтер или сканер', 'WORKPLACE_PRINTER', typeWorkplace.id, folderIt.id],
        ['workplaceVpn', 'Сеть и VPN', 'WORKPLACE_VPN', typeWorkplace.id, folderIt.id],
        ['oneCExchange', 'Ошибка обмена', 'ONE_C_EXCHANGE', typeOneC.id, folderOps.id],
        ['oneCPermissions', 'Права в 1С', 'ONE_C_PERMISSIONS', typeOneC.id, folderOps.id],
        ['docsInvoice', 'Счет или акт', 'DOCS_INVOICE', typeDocs.id, folderDocs.id],
        ['docsShipment', 'Отгрузочные документы', 'DOCS_SHIPMENT', typeDocs.id, folderDocs.id]
    ];

    for (const [key, name, code, typeId, folderId] of subtypeRows) {
        subtypes[key] = await prisma.ticketSubtype.create({
            data: { name, code, typeId, folderId, description: `Демо-подтип: ${name}` }
        });
    }

    await prisma.productSettings.create({
        data: {
            id: 'default',
            portalName: 'Office ServiceDesk',
            companyName: 'Демо-компания',
            welcomeMessage: 'Единое окно для заявок сотрудников и контроля исполнения.',
            locale: 'ru-RU',
            timezone: 'Europe/Moscow',
            defaultPriority: 'MEDIUM',
            defaultFolderId: folderIt.id
        }
    });

    const slaStandard = await prisma.slaPolicy.create({
        data: {
            name: 'Стандартный SLA',
            description: 'Ответ за 2 часа, решение за 2 рабочих дня',
            sortOrder: 10,
            priority: 'MEDIUM',
            firstResponseMinutes: 120,
            resolutionMinutes: 2880
        }
    });
    const slaUrgent = await prisma.slaPolicy.create({
        data: {
            name: 'Срочный SLA',
            description: 'Ответ за 15 минут, решение за 4 часа',
            sortOrder: 1,
            priority: 'URGENT',
            firstResponseMinutes: 15,
            resolutionMinutes: 240
        }
    });

    return {
        folders: { folderIt, folderOps, folderDocs, folderOffice },
        entities: { request, incident, problem },
        types: { typeAccess, typeWorkplace, typeOneC, typeDocs },
        subtypes,
        slas: { slaStandard, slaUrgent }
    };
}

async function createTeams(users, catalog) {
    const teamIt = await prisma.supportTeam.create({
        data: { name: 'Линия IT', description: 'Первая линия, доступы, VPN и рабочие места', folderId: catalog.folders.folderIt.id }
    });
    const teamOps = await prisma.supportTeam.create({
        data: { name: 'Операционная поддержка', description: '1С, документы и операционные процессы', folderId: catalog.folders.folderOps.id }
    });

    await prisma.supportTeamFolder.createMany({
        data: [
            { teamId: teamIt.id, folderId: catalog.folders.folderIt.id },
            { teamId: teamIt.id, folderId: catalog.folders.folderOffice.id },
            { teamId: teamOps.id, folderId: catalog.folders.folderOps.id },
            { teamId: teamOps.id, folderId: catalog.folders.folderDocs.id }
        ]
    });

    await prisma.supportTeamMember.createMany({
        data: [
            { teamId: teamIt.id, userId: users.admin.id, role: 'Руководитель линии', isLead: true },
            { teamId: teamIt.id, userId: users.agentIt.id, role: 'Исполнитель', isLead: false },
            { teamId: teamOps.id, userId: users.agentOps.id, role: 'Исполнитель', isLead: true },
            { teamId: teamOps.id, userId: users.admin.id, role: 'Координатор', isLead: false }
        ]
    });
}

async function createKnowledgeAndReplies(users) {
    await prisma.knowledgeArticle.createMany({
        data: [
            {
                title: 'Как запросить новый доступ',
                slug: 'request-new-access',
                category: 'Доступы',
                body: 'Укажите ФИО сотрудника, отдел, роль, дату начала работы и список систем. Если доступ временный, добавьте дату окончания.',
                createdById: users.admin.id,
                updatedById: users.admin.id
            },
            {
                title: 'Что приложить к заявке по 1С',
                slug: 'one-c-attachments',
                category: '1С',
                body: 'Приложите скриншот ошибки, номер документа, время возникновения и кратко опишите действие, после которого появилась проблема.',
                createdById: users.agentOps.id,
                updatedById: users.agentOps.id
            },
            {
                title: 'Как согласовать закрытие заявки',
                slug: 'requester-close-approval',
                category: 'Процесс',
                body: 'Если заявка требует подтверждения заявителя, исполнитель переводит ее в готовность, а заявитель подтверждает результат после проверки.',
                createdById: users.admin.id,
                updatedById: users.admin.id
            },
            {
                title: 'Проверка VPN и сети',
                slug: 'vpn-network-checklist',
                category: 'IT',
                body: 'Проверьте интернет, перезапустите VPN-клиент, приложите лог подключения и укажите, работает ли доступ с другого устройства.',
                createdById: users.agentIt.id,
                updatedById: users.agentIt.id
            }
        ]
    });

    await prisma.cannedReply.createMany({
        data: [
            {
                title: 'Запросить уточнение',
                body: 'Добрый день. Для продолжения нужны дополнительные данные: скриншот ошибки, время возникновения и шаги, после которых проблема повторяется.',
                category: 'Уточнение',
                visibility: 'SHARED',
                authorId: users.admin.id
            },
            {
                title: 'Инструкция по VPN',
                body: 'Проверьте подключение к интернету, перезапустите VPN-клиент и попробуйте войти повторно. Если ошибка останется, пришлите лог подключения.',
                category: 'IT',
                visibility: 'SHARED',
                authorId: users.agentIt.id
            },
            {
                title: 'Заявка выполнена',
                body: 'Работы выполнены. Проверьте, пожалуйста, результат и подтвердите закрытие заявки.',
                category: 'Закрытие',
                visibility: 'SHARED',
                authorId: users.agentIt.id
            },
            {
                title: 'Передано в профильный отдел',
                body: 'Заявка передана профильному специалисту. Мы вернемся с обновлением после проверки.',
                category: 'Маршрутизация',
                visibility: 'SHARED',
                authorId: users.agentOps.id
            }
        ]
    });
}

async function createAutomationRules(users, catalog) {
    await prisma.automationRule.createMany({
        data: [
            {
                name: 'WEB: VPN сразу в IT',
                description: 'Если в заголовке новой web-заявки есть VPN, назначить IT и высокий приоритет.',
                isActive: true,
                sortOrder: 1,
                triggerType: 'TASK_CREATED',
                conditionChannel: 'WEB',
                conditionTitleContains: 'VPN',
                actionSetFolderId: catalog.folders.folderIt.id,
                actionSetEntityId: catalog.entities.incident.id,
                actionSetTypeId: catalog.types.typeWorkplace.id,
                actionSetSubtypeId: catalog.subtypes.workplaceVpn.id,
                actionSetPriority: 'HIGH',
                actionSetAssigneeIdsEnabled: true,
                actionSetAssigneeIds: [users.agentIt.id]
            },
            {
                name: 'EMAIL: вопросы 1С в операции',
                description: 'Письма с темой 1С отправляются в операционную поддержку.',
                isActive: true,
                sortOrder: 2,
                triggerType: 'EMAIL_TICKET_CREATED',
                conditionChannel: 'EMAIL',
                conditionTitleContains: '1С',
                actionSetFolderId: catalog.folders.folderOps.id,
                actionSetEntityId: catalog.entities.problem.id,
                actionSetTypeId: catalog.types.typeOneC.id,
                actionSetSubtypeId: catalog.subtypes.oneCExchange.id,
                actionSetPriority: 'URGENT',
                actionSetAssigneeIdsEnabled: true,
                actionSetAssigneeIds: [users.agentOps.id]
            }
        ]
    });
}

async function addTaskDetails(task, users, options = {}) {
    const assignee = options.assignee;
    if (assignee) {
        await prisma.taskAssignee.create({ data: { taskId: task.id, userId: assignee.id } });
    }

    const comments = options.comments || [];
    for (const comment of comments) {
        await prisma.taskComment.create({
            data: {
                taskId: task.id,
                authorId: comment.authorId,
                content: comment.content,
                visibility: comment.visibility || 'PUBLIC',
                createdAt: comment.createdAt || new Date()
            }
        });
    }

    for (const event of options.timeline || []) {
        await prisma.taskTimelineEvent.create({
            data: {
                taskId: task.id,
                actorId: event.actorId,
                type: event.type,
                title: event.title,
                description: event.description,
                metadata: event.metadata,
                createdAt: event.createdAt || new Date()
            }
        });
    }

    if (assignee) {
        await prisma.taskHistory.create({
            data: {
                taskId: task.id,
                userId: users.admin.id,
                field: 'assignee',
                oldValue: null,
                newValue: { userId: assignee.id, name: assignee.name },
                createdAt: daysAgo(1)
            }
        });
    }
}

async function createTasks(users, departments, catalog) {
    const vpnLogPath = await createDemoFile(
        'demo-vpn-log.txt',
        'Office ServiceDesk demo attachment\nVPN client: timeout\nTime: 09:42\n'
    );
    const invoicePath = await createDemoFile(
        'demo-invoice-request.txt',
        'Демо-вложение: реквизиты и номер счета для тестовой презентации.\n'
    );

    const task1 = await prisma.task.create({
        data: {
            title: 'Не открывается VPN у сотрудника отдела продаж',
            description: 'VPN-клиент показывает timeout, доступ нужен для работы с CRM.',
            status: 'NEW',
            priority: 'HIGH',
            sourceChannel: 'WEB',
            progress: 15,
            authorId: users.requester.id,
            departmentId: departments.SALES.id,
            folderId: catalog.folders.folderIt.id,
            entityId: catalog.entities.incident.id,
            typeId: catalog.types.typeWorkplace.id,
            subtypeId: catalog.subtypes.workplaceVpn.id,
            slaPolicyId: catalog.slas.slaStandard.id,
            firstResponseDueAt: daysAgo(-0, -2),
            resolutionDueAt: daysAgo(-1),
            createdAt: daysAgo(0, 4)
        }
    });
    await prisma.taskAttachment.create({
        data: {
            taskId: task1.id,
            uploadedById: users.requester.id,
            filename: 'vpn-log.txt',
            path: vpnLogPath,
            createdAt: daysAgo(0, 3)
        }
    });
    await addTaskDetails(task1, users, {
        assignee: users.agentIt,
        comments: [
            { authorId: users.requester.id, content: 'Коллеги, приложила лог подключения. Ошибка повторяется только из офиса продаж.', createdAt: daysAgo(0, 3) },
            { authorId: users.agentIt.id, content: 'Проверяю профиль VPN и доступ к группе CRM.', visibility: 'INTERNAL', createdAt: daysAgo(0, 2) }
        ],
        timeline: [
            { actorId: users.requester.id, type: 'TASK_CREATED', title: 'Заявка создана', createdAt: daysAgo(0, 4) },
            { actorId: users.admin.id, type: 'ASSIGNEE_ADDED', title: 'Назначен исполнитель', description: users.agentIt.name, createdAt: daysAgo(0, 3) },
            { actorId: users.requester.id, type: 'FILE_ATTACHED', title: 'Добавлено вложение', description: 'vpn-log.txt', createdAt: daysAgo(0, 3) }
        ]
    });

    const task2 = await prisma.task.create({
        data: {
            title: 'Нужен доступ новому сотруднику к CRM',
            description: 'Новый менеджер выходит завтра, нужен доступ к CRM и корпоративной почте.',
            status: 'IN_PROGRESS',
            priority: 'MEDIUM',
            sourceChannel: 'WEB',
            progress: 55,
            requesterCloseRequired: true,
            authorId: users.requester.id,
            departmentId: departments.SALES.id,
            folderId: catalog.folders.folderIt.id,
            entityId: catalog.entities.request.id,
            typeId: catalog.types.typeAccess.id,
            subtypeId: catalog.subtypes.accessNewUser.id,
            slaPolicyId: catalog.slas.slaStandard.id,
            firstResponseAt: daysAgo(1),
            createdAt: daysAgo(2)
        }
    });
    await addTaskDetails(task2, users, {
        assignee: users.agentIt,
        comments: [
            { authorId: users.agentIt.id, content: 'Аккаунт создан, ожидаю подтверждение роли в CRM от руководителя продаж.', createdAt: daysAgo(1) }
        ],
        timeline: [
            { actorId: users.requester.id, type: 'TASK_CREATED', title: 'Заявка создана', createdAt: daysAgo(2) },
            { actorId: users.agentIt.id, type: 'STATUS_CHANGED', title: 'Взято в работу', metadata: { fromStatus: 'NEW', toStatus: 'IN_PROGRESS' }, createdAt: daysAgo(1) }
        ]
    });

    const task3 = await prisma.task.create({
        data: {
            title: 'Сброс пароля в корпоративной почте',
            description: 'Пользователь не может войти в почту после смены телефона.',
            status: 'DONE',
            priority: 'LOW',
            sourceChannel: 'WEB',
            progress: 100,
            requesterCloseRequired: true,
            requesterCloseApprovedAt: daysAgo(1),
            requesterCloseApprovedById: users.requester.id,
            authorId: users.requester.id,
            departmentId: departments.SALES.id,
            folderId: catalog.folders.folderIt.id,
            entityId: catalog.entities.request.id,
            typeId: catalog.types.typeAccess.id,
            subtypeId: catalog.subtypes.accessPassword.id,
            slaPolicyId: catalog.slas.slaStandard.id,
            firstResponseAt: daysAgo(2),
            resolvedAt: daysAgo(1),
            createdAt: daysAgo(3)
        }
    });
    await prisma.taskCloseApproval.create({
        data: { taskId: task3.id, userId: users.requester.id, approvedAt: daysAgo(1) }
    });
    await addTaskDetails(task3, users, {
        assignee: users.agentIt,
        comments: [
            { authorId: users.agentIt.id, content: 'Пароль сброшен, временный пароль передан пользователю по внутреннему каналу.', createdAt: daysAgo(2) },
            { authorId: users.requester.id, content: 'Проверила вход, все работает. Закрытие подтверждаю.', createdAt: daysAgo(1) }
        ],
        timeline: [
            { actorId: users.requester.id, type: 'TASK_CREATED', title: 'Заявка создана', createdAt: daysAgo(3) },
            { actorId: users.agentIt.id, type: 'STATUS_CHANGED', title: 'Заявка закрыта', metadata: { fromStatus: 'IN_PROGRESS', toStatus: 'DONE' }, createdAt: daysAgo(1) },
            { actorId: users.requester.id, type: 'CLOSE_APPROVED', title: 'Закрытие подтверждено заявителем', createdAt: daysAgo(1) }
        ]
    });

    const task4 = await prisma.task.create({
        data: {
            title: 'Ошибка обмена 1С с сайтом',
            description: 'После ночного обмена часть заказов не попала в 1С.',
            status: 'IN_PROGRESS',
            priority: 'URGENT',
            sourceChannel: 'EMAIL',
            progress: 65,
            authorId: users.requester.id,
            departmentId: departments.OPS.id,
            folderId: catalog.folders.folderOps.id,
            entityId: catalog.entities.problem.id,
            typeId: catalog.types.typeOneC.id,
            subtypeId: catalog.subtypes.oneCExchange.id,
            slaPolicyId: catalog.slas.slaUrgent.id,
            firstResponseAt: daysAgo(0, 5),
            createdAt: daysAgo(0, 6)
        }
    });
    await addTaskDetails(task4, users, {
        assignee: users.agentOps,
        comments: [
            { authorId: users.agentOps.id, content: 'Нашла ошибку в очереди обмена. Перезапускаю пакет и проверяю хвост заказов.', createdAt: daysAgo(0, 4) }
        ],
        timeline: [
            { actorId: users.requester.id, type: 'TASK_CREATED', title: 'Заявка создана из письма', createdAt: daysAgo(0, 6) },
            { actorId: users.agentOps.id, type: 'AUTOMATION_APPLIED', title: 'Сработала автоматизация', description: 'EMAIL: вопросы 1С в операции', createdAt: daysAgo(0, 6) }
        ]
    });

    const task5 = await prisma.task.create({
        data: {
            title: 'Подготовить закрывающие документы по поставке',
            description: 'Нужны акт и счет-фактура по поставке для бухгалтерии.',
            status: 'DONE',
            priority: 'MEDIUM',
            sourceChannel: 'WEB',
            progress: 100,
            authorId: users.requester.id,
            departmentId: departments.ACC.id,
            folderId: catalog.folders.folderDocs.id,
            entityId: catalog.entities.request.id,
            typeId: catalog.types.typeDocs.id,
            subtypeId: catalog.subtypes.docsInvoice.id,
            slaPolicyId: catalog.slas.slaStandard.id,
            resolvedAt: daysAgo(0, 8),
            createdAt: daysAgo(2)
        }
    });
    await prisma.taskAttachment.create({
        data: { taskId: task5.id, uploadedById: users.requester.id, filename: 'invoice-request.txt', path: invoicePath, createdAt: daysAgo(2) }
    });
    await addTaskDetails(task5, users, {
        assignee: users.agentOps,
        comments: [
            { authorId: users.agentOps.id, content: 'Документы сформированы и переданы в бухгалтерию.', createdAt: daysAgo(0, 9) }
        ],
        timeline: [
            { actorId: users.requester.id, type: 'TASK_CREATED', title: 'Заявка создана', createdAt: daysAgo(2) },
            { actorId: users.agentOps.id, type: 'STATUS_CHANGED', title: 'Заявка закрыта', metadata: { fromStatus: 'IN_PROGRESS', toStatus: 'DONE' }, createdAt: daysAgo(0, 8) }
        ]
    });

    const task6 = await prisma.task.create({
        data: {
            title: 'Печать этикеток на складе не работает',
            description: 'Принтер этикеток печатает пустые наклейки, отгрузка стоит.',
            status: 'NEW',
            priority: 'HIGH',
            sourceChannel: 'WEB',
            progress: 10,
            authorId: users.agentOps.id,
            departmentId: departments.OPS.id,
            folderId: catalog.folders.folderOffice.id,
            entityId: catalog.entities.incident.id,
            typeId: catalog.types.typeWorkplace.id,
            subtypeId: catalog.subtypes.workplacePrinter.id,
            slaPolicyId: catalog.slas.slaStandard.id,
            createdAt: daysAgo(0, 1)
        }
    });
    await addTaskDetails(task6, users, {
        assignee: users.agentIt,
        timeline: [
            { actorId: users.agentOps.id, type: 'TASK_CREATED', title: 'Заявка создана', createdAt: daysAgo(0, 1) }
        ]
    });

    const task7 = await prisma.task.create({
        data: {
            title: 'Подключить принтер в переговорной',
            description: 'Нужно добавить сетевой принтер на ноутбуки переговорной.',
            status: 'DONE',
            priority: 'LOW',
            sourceChannel: 'WEB',
            progress: 100,
            authorId: users.viewer.id,
            departmentId: departments.MGMT.id,
            folderId: catalog.folders.folderIt.id,
            entityId: catalog.entities.request.id,
            typeId: catalog.types.typeWorkplace.id,
            subtypeId: catalog.subtypes.workplacePrinter.id,
            slaPolicyId: catalog.slas.slaStandard.id,
            resolvedAt: daysAgo(4),
            createdAt: daysAgo(6)
        }
    });
    await addTaskDetails(task7, users, {
        assignee: users.agentIt,
        timeline: [
            { actorId: users.viewer.id, type: 'TASK_CREATED', title: 'Заявка создана', createdAt: daysAgo(6) },
            { actorId: users.agentIt.id, type: 'STATUS_CHANGED', title: 'Заявка закрыта', metadata: { fromStatus: 'IN_PROGRESS', toStatus: 'DONE' }, createdAt: daysAgo(4) }
        ]
    });

    const task8 = await prisma.task.create({
        data: {
            title: 'Запрос отчета по отгрузкам из 1С',
            description: 'Нужен отчет за прошлую неделю, текущий шаблон не выгружает регион.',
            status: 'IN_PROGRESS',
            priority: 'MEDIUM',
            sourceChannel: 'EMAIL',
            progress: 40,
            authorId: users.requester.id,
            departmentId: departments.OPS.id,
            folderId: catalog.folders.folderOps.id,
            entityId: catalog.entities.request.id,
            typeId: catalog.types.typeOneC.id,
            subtypeId: catalog.subtypes.oneCPermissions.id,
            slaPolicyId: catalog.slas.slaStandard.id,
            createdAt: daysAgo(1)
        }
    });
    await addTaskDetails(task8, users, {
        assignee: users.agentOps,
        comments: [
            { authorId: users.agentOps.id, content: 'Проверяю права на отчет и параметры выгрузки.', createdAt: daysAgo(1) }
        ],
        timeline: [
            { actorId: users.requester.id, type: 'TASK_CREATED', title: 'Заявка создана из письма', createdAt: daysAgo(1) }
        ]
    });

    await prisma.taskMerge.create({
        data: {
            masterTaskId: task4.id,
            childTaskId: task8.id,
            mergeMode: 'LINK',
            mergedBy: users.admin.id,
            reason: 'Связанные обращения по 1С для демонстрации связанных заявок.',
            mergedAt: daysAgo(0, 2)
        }
    });
    await prisma.taskTimelineEvent.create({
        data: {
            taskId: task4.id,
            actorId: users.admin.id,
            type: 'TASK_MERGED',
            title: 'Связана похожая заявка',
            description: `Связана с заявкой #${task8.ticketNumber}`,
            createdAt: daysAgo(0, 2)
        }
    });

    await prisma.emailInboundMessage.create({
        data: {
            messageId: 'demo-email-one-c-001@company.test',
            mailbox: 'support@company.test',
            uid: 1001,
            fromEmail: users.requester.email,
            fromName: users.requester.name,
            subject: task4.title,
            textPreview: 'После ночного обмена часть заказов не попала в 1С.',
            taskId: task4.id,
            createdUserId: users.requester.id,
            receivedAt: daysAgo(0, 6)
        }
    });

    await prisma.taskExternalReference.create({
        data: {
            system: 'FRESHDESK',
            entityType: 'TASK',
            externalId: 'FD-DEMO-1842',
            externalNumber: '1842',
            taskId: task4.id,
            metadata: { source: 'demo import' }
        }
    });

    await prisma.notification.createMany({
        data: [
            { userId: users.admin.id, type: 'TASK_CREATED', title: 'Новая срочная заявка', message: task4.title, taskId: task4.id, eventKey: `demo-admin-${task4.id}` },
            { userId: users.agentIt.id, type: 'TASK_ASSIGNED', title: 'Назначена заявка', message: task1.title, taskId: task1.id, eventKey: `demo-it-${task1.id}` },
            { userId: users.agentOps.id, type: 'TASK_ASSIGNED', title: 'Назначена заявка', message: task4.title, taskId: task4.id, eventKey: `demo-ops-${task4.id}` },
            { userId: users.requester.id, type: 'TASK_DONE', title: 'Ожидается подтверждение', message: task3.title, taskId: task3.id, isRead: true, readAt: daysAgo(1), eventKey: `demo-requester-${task3.id}` }
        ]
    });

    await prisma.account.createMany({
        data: [
            { userId: users.admin.id, type: 'demo', balance: 0 },
            { userId: users.agentIt.id, type: 'demo', balance: 0 },
            { userId: users.agentOps.id, type: 'demo', balance: 0 },
            { userId: users.requester.id, type: 'demo', balance: 0 }
        ]
    });

    return [task1, task2, task3, task4, task5, task6, task7, task8];
}

async function main() {
    console.log('Creating presentation backup-friendly demo dataset...');
    await resetDatabase();

    const users = await createUsers();
    const departments = await createDepartments(users);
    const catalog = await createServiceDeskCatalog();

    await createTeams(users, catalog);
    await createKnowledgeAndReplies(users);
    await createAutomationRules(users, catalog);
    const tasks = await createTasks(users, departments, catalog);

    const summary = {
        users: await prisma.user.count(),
        departments: await prisma.department.count(),
        tasks: await prisma.task.count(),
        knowledgeArticles: await prisma.knowledgeArticle.count(),
        cannedReplies: await prisma.cannedReply.count(),
        automationRules: await prisma.automationRule.count(),
        attachments: await prisma.taskAttachment.count()
    };

    console.log('Demo reset complete:', summary);
    console.log('Demo password:', DEMO_PASSWORD);
    console.log('Created ticket numbers:', tasks.map((task) => `#${task.ticketNumber}`).join(', '));
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async() => {
        await prisma.$disconnect();
    });
