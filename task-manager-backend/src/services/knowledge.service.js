const prisma = require('../prisma/prisma.js');
const { canManagePortalContent } = require('../utils/roles.js');

const ARTICLE_SELECT = {
    id: true,
    title: true,
    slug: true,
    body: true,
    category: true,
    isPublished: true,
    createdById: true,
    updatedById: true,
    createdBy: { select: { id: true, name: true, email: true, role: true } },
    updatedBy: { select: { id: true, name: true, email: true, role: true } },
    createdAt: true,
    updatedAt: true
};

const createKnowledgeError = (message, code) => {
    const error = new Error(message);
    error.code = code;
    return error;
};

const canManageKnowledge = (user) => Boolean(user && canManagePortalContent(user.role));

const normalizeRequiredString = (value, fieldLabel) => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        throw createKnowledgeError(`${fieldLabel} обязательно.`, 'KNOWLEDGE_INVALID');
    }
    return normalized;
};

const normalizeOptionalString = (value) => {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    return normalized || null;
};

const parseBooleanQuery = (value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw createKnowledgeError('isPublished должен быть true или false.', 'KNOWLEDGE_INVALID');
};

const normalizeBooleanInput = (value, defaultValue) => {
    if (value === undefined || value === null) return defaultValue;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw createKnowledgeError('isPublished должен быть true или false.', 'KNOWLEDGE_INVALID');
};

const slugify = (title) => {
    const cyrillicMap = {
        а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
        к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
        ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e',
        ю: 'yu', я: 'ya'
    };

    const transliterated = title
        .toLowerCase()
        .split('')
        .map((char) => cyrillicMap[char] ?? char)
        .join('');

    return transliterated
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-')
        .slice(0, 80) || `article-${Date.now()}`;
};

const makeUniqueSlug = async(title, excludeId) => {
    const base = slugify(title);
    let slug = base;
    let index = 2;

    while (true) {
        const existing = await prisma.knowledgeArticle.findUnique({
            where: { slug },
            select: { id: true }
        });
        if (!existing || existing.id === excludeId) return slug;
        slug = `${base}-${index}`;
        index += 1;
    }
};

const buildVisibilityWhere = (user, requestedPublished) => {
    if (!canManageKnowledge(user)) {
        return { isPublished: true };
    }

    if (requestedPublished === undefined) return {};
    return { isPublished: requestedPublished };
};

const listArticles = async(filters = {}, user) => {
    const search = normalizeOptionalString(filters.search);
    const category = normalizeOptionalString(filters.category);
    const requestedPublished = parseBooleanQuery(filters.isPublished);

    const where = {
        ...buildVisibilityWhere(user, requestedPublished),
        ...(category ? { category } : {}),
        ...(search
            ? {
                OR: [
                    { title: { contains: search, mode: 'insensitive' } },
                    { body: { contains: search, mode: 'insensitive' } },
                    { category: { contains: search, mode: 'insensitive' } }
                ]
            }
            : {})
    };

    return prisma.knowledgeArticle.findMany({
        where,
        select: ARTICLE_SELECT,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
    });
};

const getArticle = async(id, user) => {
    const article = await prisma.knowledgeArticle.findFirst({
        where: {
            OR: [{ id }, { slug: id }]
        },
        select: ARTICLE_SELECT
    });

    if (!article) {
        throw createKnowledgeError('Статья не найдена.', 'KNOWLEDGE_NOT_FOUND');
    }
    if (!article.isPublished && !canManageKnowledge(user)) {
        throw createKnowledgeError('Статья не найдена.', 'KNOWLEDGE_NOT_FOUND');
    }

    return article;
};

const createArticle = async(payload, user) => {
    const title = normalizeRequiredString(payload.title, 'Название статьи');
    const body = normalizeRequiredString(payload.body, 'Текст статьи');
    const category = normalizeOptionalString(payload.category);
    const isPublished = normalizeBooleanInput(payload.isPublished, true);
    const slug = await makeUniqueSlug(title);

    return prisma.knowledgeArticle.create({
        data: {
            title,
            slug,
            body,
            category,
            isPublished,
            createdById: user.id,
            updatedById: user.id
        },
        select: ARTICLE_SELECT
    });
};

const updateArticle = async(id, payload, user) => {
    const existing = await prisma.knowledgeArticle.findUnique({
        where: { id },
        select: { id: true, title: true }
    });

    if (!existing) {
        throw createKnowledgeError('Статья не найдена.', 'KNOWLEDGE_NOT_FOUND');
    }

    const data = { updatedById: user.id };
    if (payload.title !== undefined) {
        data.title = normalizeRequiredString(payload.title, 'Название статьи');
        if (data.title !== existing.title) {
            data.slug = await makeUniqueSlug(data.title, existing.id);
        }
    }
    if (payload.body !== undefined) {
        data.body = normalizeRequiredString(payload.body, 'Текст статьи');
    }
    if (payload.category !== undefined) {
        data.category = normalizeOptionalString(payload.category);
    }
    if (payload.isPublished !== undefined) {
        data.isPublished = normalizeBooleanInput(payload.isPublished);
    }

    return prisma.knowledgeArticle.update({
        where: { id },
        data,
        select: ARTICLE_SELECT
    });
};

const deleteArticle = async(id) => {
    const existing = await prisma.knowledgeArticle.findUnique({
        where: { id },
        select: { id: true }
    });

    if (!existing) {
        throw createKnowledgeError('Статья не найдена.', 'KNOWLEDGE_NOT_FOUND');
    }

    await prisma.knowledgeArticle.delete({ where: { id } });
    return { success: true };
};

module.exports = {
    canManageKnowledge,
    listArticles,
    getArticle,
    createArticle,
    updateArticle,
    deleteArticle
};
