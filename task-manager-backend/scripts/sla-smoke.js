#!/usr/bin/env node

require('dotenv').config();

process.env.EMAIL_OUTBOUND_ENABLED = 'false';

const prisma = require('../src/prisma/prisma.js');

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:5001';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || 'admin@taskmanager.com';
const REQUESTER_EMAIL = process.env.SMOKE_REQUESTER_EMAIL || 'requester@taskmanager.com';
const USER_PASSWORD = process.env.SMOKE_USER_PASSWORD || 'password123';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || USER_PASSWORD;

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const request = async(path, options = {}) => {
    const response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;

    if (!response.ok) {
        const message = body && (body.error || body.message || JSON.stringify(body));
        throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${message || text}`);
    }

    return body;
};

const authorized = (token, options = {}) => ({
    ...options,
    headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
    }
});

const login = (email, password) => request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
});

const main = async() => {
    const [adminLogin, requesterLogin] = await Promise.all([
        login(ADMIN_EMAIL, ADMIN_PASSWORD),
        login(REQUESTER_EMAIL, USER_PASSWORD)
    ]);

    const adminToken = adminLogin.token;
    const requesterToken = requesterLogin.token;

    const folder = await request('/api/servicedesk/admin/folders', authorized(adminToken, {
        method: 'POST',
        body: JSON.stringify({
            name: `SLA smoke folder ${runId}`,
            description: 'Папка для SLA smoke'
        })
    }));
    const entity = await request('/api/servicedesk/admin/entities', authorized(adminToken, {
        method: 'POST',
        body: JSON.stringify({
            name: `SLA smoke entity ${runId}`,
            code: `SLA_SMOKE_ENTITY_${Date.now()}`
        })
    }));
    const type = await request('/api/servicedesk/admin/types', authorized(adminToken, {
        method: 'POST',
        body: JSON.stringify({
            name: `SLA smoke type ${runId}`,
            code: `SLA_SMOKE_TYPE_${Date.now()}`,
            folderId: folder.id,
            entityId: entity.id
        })
    }));
    const subtype = await request('/api/servicedesk/admin/subtypes', authorized(adminToken, {
        method: 'POST',
        body: JSON.stringify({
            name: `SLA smoke subtype ${runId}`,
            code: `SLA_SMOKE_SUBTYPE_${Date.now()}`,
            typeId: type.id,
            folderId: folder.id
        })
    }));
    const policy = await request('/api/servicedesk/admin/sla-policies', authorized(adminToken, {
        method: 'POST',
        body: JSON.stringify({
            name: `SLA smoke policy ${runId}`,
            sortOrder: 10,
            folderId: folder.id,
            typeId: type.id,
            subtypeId: subtype.id,
            priority: 'HIGH',
            firstResponseMinutes: 30,
            resolutionMinutes: 120
        })
    }));

    const task = await request('/api/tasks', authorized(requesterToken, {
        method: 'POST',
        body: JSON.stringify({
            title: `SLA smoke task ${runId}`,
            description: 'Smoke task for SLA flow',
            priority: 'HIGH',
            folderId: folder.id,
            entityId: entity.id,
            typeId: type.id,
            subtypeId: subtype.id
        })
    }));

    if (!task.sla || task.sla.policy?.id !== policy.id) {
        throw new Error('Task was created without expected SLA policy.');
    }

    await request(`/api/comments/${task.id}`, authorized(requesterToken, {
        method: 'POST',
        body: JSON.stringify({
            content: 'Комментарий заявителя не должен считаться first response.'
        })
    }));

    const afterRequesterComment = await request(`/api/tasks/${task.id}`, authorized(requesterToken));
    if (afterRequesterComment.sla.firstResponseAt !== null) {
        throw new Error('Requester comment incorrectly counted as first response.');
    }

    await prisma.emailInboundMessage.create({
        data: {
            messageId: `sla-smoke-${runId}@example.com`,
            fromEmail: requesterLogin.user.email,
            fromName: requesterLogin.user.name,
            subject: `SLA smoke thread ${runId}`,
            taskId: task.id
        }
    });

    const reply = await request(`/api/tasks/${task.id}/email-reply`, authorized(adminToken, {
        method: 'POST',
        body: JSON.stringify({
            message: 'Первый ответ по SLA smoke.'
        })
    }));
    if (reply.dryRun !== true) {
        throw new Error('SLA smoke must stay in dry-run mode for email replies.');
    }

    const afterReply = await request(`/api/tasks/${task.id}`, authorized(adminToken));
    if (!afterReply.sla.firstResponseAt || afterReply.sla.firstResponseStatus !== 'MET') {
        throw new Error('Email reply did not update first response SLA as expected.');
    }

    const closedTask = await request(`/api/tasks/${task.id}/status`, authorized(adminToken, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'DONE' })
    }));
    if (!closedTask.sla.resolvedAt || closedTask.sla.resolutionStatus !== 'MET') {
        throw new Error('Closing task did not update resolution SLA as expected.');
    }

    const reopenedTask = await request(`/api/tasks/${task.id}/status`, authorized(adminToken, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'NEW' })
    }));
    if (reopenedTask.sla.resolvedAt !== null || reopenedTask.sla.resolutionStatus !== 'PENDING') {
        throw new Error('Reopening task did not reset resolution SLA as expected.');
    }

    await request(`/api/tasks/${task.id}`, authorized(adminToken, { method: 'DELETE' }));
    await prisma.emailInboundMessage.deleteMany({
        where: {
            messageId: `sla-smoke-${runId}@example.com`
        }
    });
    await request(`/api/servicedesk/admin/sla-policies/${policy.id}`, authorized(adminToken, { method: 'DELETE' }));
    await request(`/api/servicedesk/admin/subtypes/${subtype.id}`, authorized(adminToken, { method: 'DELETE' }));
    await request(`/api/servicedesk/admin/types/${type.id}`, authorized(adminToken, { method: 'DELETE' }));
    await request(`/api/servicedesk/admin/entities/${entity.id}`, authorized(adminToken, { method: 'DELETE' }));
    await request(`/api/servicedesk/admin/folders/${folder.id}`, authorized(adminToken, { method: 'DELETE' }));

    console.log('SLA smoke OK:', {
        taskId: task.id,
        policyId: policy.id,
        firstResponseStatus: afterReply.sla.firstResponseStatus,
        resolutionStatusOnClose: closedTask.sla.resolutionStatus,
        resolutionStatusOnReopen: reopenedTask.sla.resolutionStatus
    });
};

main()
    .catch((error) => {
        console.error('SLA smoke failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async() => {
        await prisma.$disconnect();
    });
