#!/usr/bin/env node

require('dotenv').config();

process.env.EMAIL_OUTBOUND_ENABLED = 'false';

const prisma = require('../src/prisma/prisma.js');

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:5001';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || 'admin@taskmanager.com';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || 'password123';
const EMPLOYEE_EMAIL = process.env.SMOKE_EMPLOYEE_EMAIL || 'employee@taskmanager.com';
const USER_PASSWORD = process.env.SMOKE_USER_PASSWORD || 'password123';

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
    const [adminLogin, employeeLogin] = await Promise.all([
        login(ADMIN_EMAIL, ADMIN_PASSWORD),
        login(EMPLOYEE_EMAIL, USER_PASSWORD)
    ]);

    const adminToken = adminLogin.token;
    const employeeToken = employeeLogin.token;

    const template = await request('/api/canned-replies', authorized(employeeToken, {
        method: 'POST',
        body: JSON.stringify({
            title: `Smoke canned reply ${runId}`,
            body: 'Здравствуйте!\n\nЭто smoke-шаблон ответа.',
            category: 'Smoke',
            visibility: 'SHARED'
        })
    }));

    const task = await request('/api/tasks', authorized(adminToken, {
        method: 'POST',
        body: JSON.stringify({
            title: `Smoke canned task ${runId}`,
            description: 'Task for canned reply smoke'
        })
    }));

    const commentApply = await request(`/api/tasks/${task.id}/reply-from-template`, authorized(adminToken, {
        method: 'POST',
        body: JSON.stringify({
            templateId: template.id,
            mode: 'COMMENT'
        })
    }));

    await prisma.emailInboundMessage.create({
        data: {
            messageId: `canned-smoke-${runId}@example.com`,
            fromEmail: adminLogin.user.email,
            fromName: adminLogin.user.name,
            subject: `Canned smoke thread ${runId}`,
            taskId: task.id
        }
    });

    const emailApply = await request(`/api/tasks/${task.id}/reply-from-template`, authorized(adminToken, {
        method: 'POST',
        body: JSON.stringify({
            templateId: template.id,
            mode: 'EMAIL_REPLY',
            bodyOverride: 'Dry-run email reply from canned template.'
        })
    }));

    if (commentApply.mode !== 'COMMENT' || !commentApply.commentId) {
        throw new Error('COMMENT apply did not create a public task comment.');
    }

    if (emailApply.dryRun !== true || emailApply.mode !== 'EMAIL_REPLY') {
        throw new Error('EMAIL_REPLY apply must stay in dry-run mode during smoke.');
    }
    if (!emailApply.outboxId) {
        throw new Error('EMAIL_REPLY apply must return outboxId.');
    }

    const outboxRecord = await prisma.emailOutboundMessage.findUnique({
        where: {
            id: emailApply.outboxId
        }
    });
    if (!outboxRecord || outboxRecord.status !== 'DRY_RUN') {
        throw new Error('EMAIL_REPLY apply did not persist dry-run outbox record.');
    }

    console.log('Canned replies smoke OK:', {
        templateId: template.id,
        taskId: task.id,
        commentId: commentApply.commentId,
        emailCommentId: emailApply.commentId,
        dryRun: emailApply.dryRun,
        outboxId: emailApply.outboxId
    });
};

main()
    .catch((error) => {
        console.error('Canned replies smoke failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async() => {
        await prisma.$disconnect();
    });
