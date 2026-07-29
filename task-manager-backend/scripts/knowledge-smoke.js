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

    const created = await request('/api/knowledge/articles', authorized(token, {
        method: 'POST',
        body: JSON.stringify({
            title: `Smoke статья базы знаний ${timestamp}`,
            category: 'Smoke',
            body: 'Проверочный текст статьи базы знаний.',
            isPublished: true
        })
    }));

    if (!created.id || !created.slug) {
        throw new Error('Article was not created with id and slug.');
    }

    const list = await request(`/api/knowledge/articles?search=${timestamp}&category=Smoke&isPublished=true`, authorized(token));
    if (!list.some((article) => article.id === created.id)) {
        throw new Error('Created article is missing from filtered list.');
    }

    const fetched = await request(`/api/knowledge/articles/${created.id}`, authorized(token));
    if (fetched.title !== created.title) {
        throw new Error('Fetched article does not match created article.');
    }

    const updated = await request(`/api/knowledge/articles/${created.id}`, authorized(token, {
        method: 'PUT',
        body: JSON.stringify({
            title: `Smoke обновленная статья ${timestamp}`,
            category: 'Smoke updated',
            body: 'Обновленный проверочный текст.',
            isPublished: false
        })
    }));
    if (updated.isPublished !== false || updated.category !== 'Smoke updated') {
        throw new Error('Article update did not persist expected fields.');
    }

    await request(`/api/knowledge/articles/${created.id}`, authorized(token, { method: 'DELETE' }));
    const afterDelete = await request('/api/knowledge/articles?category=Smoke%20updated', authorized(token));
    if (afterDelete.some((article) => article.id === created.id)) {
        throw new Error('Deleted article is still present in list.');
    }

    console.log('Knowledge smoke OK:', {
        articleId: created.id,
        slug: created.slug
    });
};

main().catch((error) => {
    console.error('Knowledge smoke failed:', error.message);
    process.exit(1);
});
