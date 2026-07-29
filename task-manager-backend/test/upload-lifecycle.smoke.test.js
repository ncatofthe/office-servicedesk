const fs = require('fs');
const path = require('path');
const { after, test } = require('node:test');
const assert = require('node:assert/strict');

const hasRequiredEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasRequiredEnv) {
    test(
        'upload lifecycle smoke test requires .env.test with DATABASE_URL and JWT_SECRET',
        { skip: 'Missing test DATABASE_URL/JWT_SECRET' },
        () => {}
    );
} else {
    const request = require('supertest');
    const app = require('../src/app.js');
    const prisma = require('../src/prisma/prisma.js');
    const { uploadsDir } = require('../src/middlewares/upload.middleware.js');
    const { createTestUser, loginUser } = require('../test-support/auth-test-utils.cjs');

    const resolveStoredFilePath = (storedPath) => path.join(uploadsDir, path.basename(storedPath || ''));

    const removeTestFileIfPresent = (storedPath) => {
        const absolutePath = resolveStoredFilePath(storedPath);
        if (!fs.existsSync(absolutePath)) {
            return;
        }
        fs.unlinkSync(absolutePath);
    };

    const createOwnedTaskScenario = async(runId, role = 'MANAGER') => {
        const password = 'password123';
        const user = await createTestUser(prisma, {
            email: `upload-lifecycle-${role.toLowerCase()}-${runId}@example.com`,
            password,
            name: `Upload Lifecycle ${role}`,
            role
        });
        const normalizedRole = role === 'ADMIN' ? 'ADMIN' : 'AGENT';
        const folder = await prisma.ticketFolder.create({
            data: {
                name: `Upload lifecycle folder ${runId}`
            }
        });
        const team = normalizedRole === 'ADMIN'
            ? null
            : await prisma.supportTeam.create({
                data: {
                    name: `Upload lifecycle team ${runId}`,
                    folderId: folder.id
                }
            });

        if (team) {
            await prisma.supportTeamFolder.create({
                data: {
                    teamId: team.id,
                    folderId: folder.id
                }
            });
            await prisma.supportTeamMember.create({
                data: {
                    teamId: team.id,
                    userId: user.id,
                    role: 'Исполнитель'
                }
            });
        }

        const task = await prisma.task.create({
            data: {
                title: `Upload lifecycle task ${runId}`,
                description: 'Uploads lifecycle smoke coverage.',
                authorId: user.id,
                folderId: folder.id
            }
        });

        return { password, user, task, folder, team };
    };

    const cleanupScenario = async(scenario) => {
        await prisma.task.deleteMany({
            where: { id: scenario.task.id }
        });
        if (scenario.team) {
            await prisma.supportTeamMember.deleteMany({ where: { teamId: scenario.team.id } });
            await prisma.supportTeamFolder.deleteMany({ where: { teamId: scenario.team.id } });
            await prisma.supportTeam.deleteMany({ where: { id: scenario.team.id } });
        }
        await prisma.ticketFolder.deleteMany({
            where: { id: scenario.folder.id }
        });
        await prisma.user.deleteMany({
            where: { id: scenario.user.id }
        });
    };

    after(async() => {
        await prisma.$disconnect();
    });

    test('task attachment upload stores canonical path and supports list/download', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const scenario = await createOwnedTaskScenario(runId);
        const fileContents = `upload lifecycle ${runId}`;

        t.after(async() => {
            const attachments = await prisma.taskAttachment.findMany({
                where: { taskId: scenario.task.id }
            });
            attachments.forEach((attachment) => removeTestFileIfPresent(attachment.path));
            await cleanupScenario(scenario);
        });

        const token = (await loginUser(app, {
            email: scenario.user.email,
            password: scenario.password
        })).body.token;

        const uploadResponse = await request(app)
            .post(`/api/files/${scenario.task.id}`)
            .set('Authorization', `Bearer ${token}`)
            .attach('file', Buffer.from(fileContents), {
                filename: 'canonical-upload.txt',
                contentType: 'text/plain'
            })
            .expect(201);

        const createdAttachment = await prisma.taskAttachment.findUnique({
            where: { id: uploadResponse.body.id }
        });

        assert.ok(createdAttachment);
        assert.match(createdAttachment.path, /^\/uploads\/[^/]+$/);
        assert.equal(uploadResponse.body.path, `/api/files/${createdAttachment.id}/download`);

        const listResponse = await request(app)
            .get(`/api/files/${scenario.task.id}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        assert.equal(listResponse.body.length, 1);
        assert.equal(listResponse.body[0].id, createdAttachment.id);
        assert.equal(listResponse.body[0].path, `/api/files/${createdAttachment.id}/download`);

        const downloadResponse = await request(app)
            .get(`/api/files/${createdAttachment.id}/download`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        assert.match(downloadResponse.headers['content-disposition'], /canonical-upload\.txt/);
        assert.equal(downloadResponse.text, fileContents);
    });

    test('attachment delete removes both db row and local file predictably', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const scenario = await createOwnedTaskScenario(runId);

        t.after(async() => {
            const attachments = await prisma.taskAttachment.findMany({
                where: { taskId: scenario.task.id }
            });
            attachments.forEach((attachment) => removeTestFileIfPresent(attachment.path));
            await cleanupScenario(scenario);
        });

        const token = (await loginUser(app, {
            email: scenario.user.email,
            password: scenario.password
        })).body.token;

        const uploadResponse = await request(app)
            .post(`/api/files/${scenario.task.id}`)
            .set('Authorization', `Bearer ${token}`)
            .attach('file', Buffer.from('delete me'), {
                filename: 'delete-me.txt',
                contentType: 'text/plain'
            })
            .expect(201);

        const createdAttachment = await prisma.taskAttachment.findUnique({
            where: { id: uploadResponse.body.id }
        });
        const absolutePath = resolveStoredFilePath(createdAttachment.path);
        assert.equal(fs.existsSync(absolutePath), true);

        await request(app)
            .delete(`/api/files/${createdAttachment.id}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        const deletedAttachment = await prisma.taskAttachment.findUnique({
            where: { id: createdAttachment.id }
        });
        assert.equal(deletedAttachment, null);
        assert.equal(fs.existsSync(absolutePath), false);
    });

    test('task delete removes attached files after deleting the task', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const scenario = await createOwnedTaskScenario(runId, 'ADMIN');

        t.after(async() => {
            const attachments = await prisma.taskAttachment.findMany({
                where: { taskId: scenario.task.id }
            });
            attachments.forEach((attachment) => removeTestFileIfPresent(attachment.path));
            await cleanupScenario(scenario);
        });

        const token = (await loginUser(app, {
            email: scenario.user.email,
            password: scenario.password
        })).body.token;

        const uploadResponse = await request(app)
            .post(`/api/files/${scenario.task.id}`)
            .set('Authorization', `Bearer ${token}`)
            .attach('file', Buffer.from('task delete attachment'), {
                filename: 'task-delete.txt',
                contentType: 'text/plain'
            })
            .expect(201);

        const createdAttachment = await prisma.taskAttachment.findUnique({
            where: { id: uploadResponse.body.id }
        });
        const absolutePath = resolveStoredFilePath(createdAttachment.path);
        assert.equal(fs.existsSync(absolutePath), true);

        await request(app)
            .delete(`/api/tasks/${scenario.task.id}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        const [deletedTask, deletedAttachment] = await Promise.all([
            prisma.task.findUnique({ where: { id: scenario.task.id } }),
            prisma.taskAttachment.findUnique({ where: { id: createdAttachment.id } })
        ]);

        assert.equal(deletedTask, null);
        assert.equal(deletedAttachment, null);
        assert.equal(fs.existsSync(absolutePath), false);
    });

    test('legacy mixed attachment path format without leading slash still resolves for download', async(t) => {
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const scenario = await createOwnedTaskScenario(runId);
        const legacyFilename = `legacy-mixed-${runId}.txt`;
        const legacyPath = `uploads/${legacyFilename}`;
        const legacyAbsolutePath = path.join(uploadsDir, legacyFilename);
        fs.writeFileSync(legacyAbsolutePath, `legacy ${runId}`);

        const attachment = await prisma.taskAttachment.create({
            data: {
                filename: 'legacy-mixed.txt',
                path: legacyPath,
                taskId: scenario.task.id,
                uploadedById: scenario.user.id
            }
        });

        t.after(async() => {
            removeTestFileIfPresent(legacyPath);
            await prisma.taskAttachment.deleteMany({
                where: { id: attachment.id }
            });
            await cleanupScenario(scenario);
        });

        const token = (await loginUser(app, {
            email: scenario.user.email,
            password: scenario.password
        })).body.token;

        const downloadResponse = await request(app)
            .get(`/api/files/${attachment.id}/download`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        assert.match(downloadResponse.headers['content-disposition'], /legacy-mixed\.txt/);
        assert.equal(downloadResponse.text, `legacy ${runId}`);
    });
}
