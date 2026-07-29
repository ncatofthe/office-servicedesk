const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:5001';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || 'admin@taskmanager.com';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || 'password123';

const timestamp = Date.now();

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

const main = async() => {
    const login = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD
        })
    });
    const token = login.token;
    const adminUserId = login.user.id;

    const folder = await request('/api/servicedesk/admin/folders', authorized(token, {
        method: 'POST',
        body: JSON.stringify({
            name: `Smoke папка ${timestamp}`,
            description: 'Проверочная папка ServiceDesk'
        })
    }));
    const entity = await request('/api/servicedesk/admin/entities', authorized(token, {
        method: 'POST',
        body: JSON.stringify({
            name: `Smoke сущность ${timestamp}`,
            code: `SMOKE_ENTITY_${timestamp}`,
            description: 'Проверочная сущность ServiceDesk'
        })
    }));
    const type = await request('/api/servicedesk/admin/types', authorized(token, {
        method: 'POST',
        body: JSON.stringify({
            name: `Smoke тип ${timestamp}`,
            code: `SMOKE_TYPE_${timestamp}`,
            folderId: folder.id,
            entityId: entity.id
        })
    }));
    const subtype = await request('/api/servicedesk/admin/subtypes', authorized(token, {
        method: 'POST',
        body: JSON.stringify({
            name: `Smoke подтип ${timestamp}`,
            code: `SMOKE_SUBTYPE_${timestamp}`,
            typeId: type.id,
            folderId: folder.id
        })
    }));
    const team = await request('/api/servicedesk/admin/teams', authorized(token, {
        method: 'POST',
        body: JSON.stringify({
            name: `Smoke команда ${timestamp}`,
            description: 'Проверочная команда исполнителей',
            folderId: folder.id
        })
    }));
    const member = await request(`/api/servicedesk/admin/teams/${team.id}/members`, authorized(token, {
        method: 'POST',
        body: JSON.stringify({
            userId: adminUserId,
            role: 'Проверяющий',
            isLead: true
        })
    }));

    await request(`/api/servicedesk/admin/team-members/${member.id}`, authorized(token, { method: 'DELETE' }));
    await request(`/api/servicedesk/admin/teams/${team.id}`, authorized(token, { method: 'DELETE' }));
    await request(`/api/servicedesk/admin/subtypes/${subtype.id}`, authorized(token, { method: 'DELETE' }));
    await request(`/api/servicedesk/admin/types/${type.id}`, authorized(token, { method: 'DELETE' }));
    await request(`/api/servicedesk/admin/entities/${entity.id}`, authorized(token, { method: 'DELETE' }));
    await request(`/api/servicedesk/admin/folders/${folder.id}`, authorized(token, { method: 'DELETE' }));

    const types = await request('/api/servicedesk/admin/types', authorized(token));
    const selectedType = types.find((item) => item.folderId && item.entityId);
    if (!selectedType) {
        throw new Error('Нет демо-типа с привязкой к папке и сущности. Запустите npm run prisma:seed.');
    }

    const subtypes = await request('/api/servicedesk/admin/subtypes', authorized(token));
    const selectedSubtype = subtypes.find((item) => item.typeId === selectedType.id && item.folderId === selectedType.folderId);

    const taskPayload = {
        title: `Smoke заявка ServiceDesk ${timestamp}`,
        description: 'Создано smoke-скриптом для проверки ручного выбора папки и типа.',
        priority: 'MEDIUM',
        folderId: selectedType.folderId,
        entityId: selectedType.entityId,
        typeId: selectedType.id
    };
    if (selectedSubtype) {
        taskPayload.subtypeId = selectedSubtype.id;
    }

    const task = await request('/api/tasks', authorized(token, {
        method: 'POST',
        body: JSON.stringify(taskPayload)
    }));

    if (task.folderId !== taskPayload.folderId || task.typeId !== taskPayload.typeId) {
        throw new Error('Заявка создана, но ServiceDesk поля не вернулись в ответе.');
    }

    console.log('ServiceDesk smoke OK:', {
        taskId: task.id,
        folderId: task.folderId,
        typeId: task.typeId,
        subtypeId: task.subtypeId || null
    });
};

main().catch((error) => {
    console.error('ServiceDesk smoke failed:', error.message);
    process.exit(1);
});
