const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'product settings smoke test requires .env.test',
        { skip: 'Missing test DATABASE_URL/JWT_SECRET' },
        () => {}
    );
} else {
    const request = require('supertest');
    const app = require('../src/app.js');
    const prisma = require('../src/prisma/prisma.js');
    const { createTestUser, loginUser } = require('../test-support/auth-test-utils.cjs');
    const {
        FEATURE_COLUMN_MAP,
        FEATURE_KEYS,
        getProductSettings
    } = require('../src/services/product-settings.service.js');

    after(async() => {
        await prisma.$disconnect();
    });

    test('product settings are singleton, admin-managed, public-safe and applied to task create', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const password = 'password123';
        const initialSettings = await getProductSettings();
        const allFeaturesEnabled = Object.fromEntries(FEATURE_KEYS.map((feature) => [feature, true]));

        const admin = await createTestUser(prisma, {
            email: `settings-admin-${runId}@example.com`,
            password,
            name: 'Product Settings Admin',
            role: 'ADMIN'
        });
        const requester = await createTestUser(prisma, {
            email: `settings-requester-${runId}@example.com`,
            password,
            name: 'Product Settings Requester',
            role: 'REQUESTER'
        });
        const activeFolder = await prisma.ticketFolder.create({
            data: { name: `Default folder ${runId}` }
        });
        const inactiveFolder = await prisma.ticketFolder.create({
            data: { name: `Inactive default folder ${runId}`, isActive: false }
        });

        t.after(async() => {
            await prisma.productSettings.update({
                where: { id: 'default' },
                data: {
                    portalName: initialSettings.portalName,
                    companyName: initialSettings.companyName,
                    welcomeMessage: initialSettings.welcomeMessage,
                    locale: initialSettings.locale,
                    timezone: initialSettings.timezone,
                    defaultPriority: initialSettings.defaultPriority,
                    defaultFolderId: initialSettings.defaultFolderId,
                    ...Object.values(FEATURE_COLUMN_MAP).reduce((features, column) => ({
                        ...features,
                        [column]: initialSettings[column]
                    }), {})
                }
            });
            await prisma.task.deleteMany({ where: { title: { contains: runId } } });
            await prisma.ticketFolder.deleteMany({
                where: { id: { in: [activeFolder.id, inactiveFolder.id] } }
            });
            await prisma.user.deleteMany({ where: { id: { in: [admin.id, requester.id] } } });
        });

        const adminToken = (await loginUser(app, { email: admin.email, password })).body.token;
        const requesterToken = (await loginUser(app, { email: requester.email, password })).body.token;

        const adminSettings = await request(app)
            .patch('/api/servicedesk/admin/product-settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                portalName: 'Портал поддержки',
                companyName: 'Тестовая компания',
                welcomeMessage: 'Опишите проблему, и мы поможем.',
                locale: 'ru-RU',
                timezone: 'Europe/Moscow',
                defaultPriority: 'HIGH',
                defaultFolderId: activeFolder.id,
                features: allFeaturesEnabled
            })
            .expect(200);

        assert.equal(adminSettings.body.id, 'default');
        assert.equal(adminSettings.body.defaultFolder.id, activeFolder.id);
        assert.ok(adminSettings.body.createdAt);
        assert.ok(adminSettings.body.updatedAt);

        const publicSettings = await request(app)
            .get('/api/servicedesk/product-settings')
            .expect(200);

        assert.deepEqual(publicSettings.body, {
            portalName: 'Портал поддержки',
            companyName: 'Тестовая компания',
            welcomeMessage: 'Опишите проблему, и мы поможем.',
            locale: 'ru-RU',
            timezone: 'Europe/Moscow',
            defaultPriority: 'HIGH',
            defaultFolderId: activeFolder.id,
            defaultFolder: {
                id: activeFolder.id,
                name: activeFolder.name
            },
            features: allFeaturesEnabled
        });
        assert.equal(Object.prototype.hasOwnProperty.call(publicSettings.body, 'id'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(publicSettings.body, 'createdAt'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(publicSettings.body, 'updatedAt'), false);

        await request(app)
            .patch('/api/servicedesk/admin/product-settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ features: { tickets: false } })
            .expect(200);

        const disabledSettings = await request(app)
            .get('/api/servicedesk/admin/product-settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        assert.equal(disabledSettings.body.features.tickets, false);

        const restoredSettings = await request(app)
            .patch('/api/servicedesk/admin/product-settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ features: { tickets: true } })
            .expect(200);
        assert.equal(restoredSettings.body.features.tickets, true);

        await request(app)
            .get('/api/servicedesk/admin/product-settings')
            .set('Authorization', `Bearer ${requesterToken}`)
            .expect(403);

        await request(app)
            .patch('/api/servicedesk/admin/product-settings')
            .set('Authorization', `Bearer ${requesterToken}`)
            .send({ portalName: 'Нельзя изменить' })
            .expect(403);

        await request(app)
            .patch('/api/servicedesk/admin/product-settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ defaultFolderId: inactiveFolder.id })
            .expect(400);

        await request(app)
            .patch('/api/servicedesk/admin/product-settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ timezone: 'Invalid/Timezone' })
            .expect(400);

        const defaultedTask = await request(app)
            .post('/api/tasks')
            .set('Authorization', `Bearer ${requesterToken}`)
            .send({
                title: `Defaulted task ${runId}`,
                description: 'Uses product defaults.'
            })
            .expect(201);
        assert.equal(defaultedTask.body.folderId, activeFolder.id);
        assert.equal(defaultedTask.body.priority, 'HIGH');

        const explicitTask = await request(app)
            .post('/api/tasks')
            .set('Authorization', `Bearer ${requesterToken}`)
            .send({
                title: `Explicit task ${runId}`,
                description: 'Explicit values override product defaults.',
                folderId: null,
                priority: 'LOW'
            })
            .expect(201);
        assert.equal(explicitTask.body.folderId, null);
        assert.equal(explicitTask.body.priority, 'LOW');

        const deactivateResponse = await request(app)
            .patch(`/api/servicedesk/admin/folders/${activeFolder.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ isActive: false })
            .expect(409);
        assert.equal(deactivateResponse.body.blockers.productSettings, 1);

        const deleteResponse = await request(app)
            .delete(`/api/servicedesk/admin/folders/${activeFolder.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(409);
        assert.equal(deleteResponse.body.blockers.productSettings, 1);

        const clearedSettings = await request(app)
            .patch('/api/servicedesk/admin/product-settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ defaultFolderId: null, welcomeMessage: null })
            .expect(200);
        assert.equal(clearedSettings.body.defaultFolderId, null);
        assert.equal(clearedSettings.body.welcomeMessage, null);
    });
}
