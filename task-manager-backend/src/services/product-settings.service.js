const prisma = require('../prisma/prisma.js');

const PRODUCT_SETTINGS_ID = 'default';
const FEATURE_COLUMN_MAP = {
    dashboard: 'dashboardEnabled',
    tickets: 'ticketsEnabled',
    ticketCreation: 'ticketCreationEnabled',
    queue: 'queueEnabled',
    knowledge: 'knowledgeEnabled',
    cannedReplies: 'cannedRepliesEnabled',
    chats: 'chatsEnabled',
    team: 'teamEnabled',
    reports: 'reportsEnabled',
    notifications: 'notificationsEnabled',
    automation: 'automationEnabled',
    email: 'emailEnabled',
    taskAttachments: 'taskAttachmentsEnabled',
    freshdeskImport: 'freshdeskImportEnabled'
};
const FEATURE_KEYS = Object.keys(FEATURE_COLUMN_MAP);
const FEATURE_DEPENDENCIES = {
    ticketCreation: ['tickets'],
    queue: ['tickets'],
    cannedReplies: ['tickets'],
    reports: ['tickets'],
    notifications: ['tickets'],
    automation: ['tickets'],
    email: ['tickets'],
    taskAttachments: ['tickets'],
    freshdeskImport: ['tickets']
};
const PRODUCT_SETTINGS_DEFAULTS = {
    portalName: 'Office ServiceDesk',
    companyName: '',
    welcomeMessage: null,
    locale: 'ru-RU',
    timezone: 'Europe/Moscow',
    defaultPriority: 'MEDIUM',
    defaultFolderId: null,
    ...Object.values(FEATURE_COLUMN_MAP).reduce((defaults, column) => ({
        ...defaults,
        [column]: true
    }), {})
};
const PRODUCT_SETTINGS_SELECT = {
    id: true,
    portalName: true,
    companyName: true,
    welcomeMessage: true,
    locale: true,
    timezone: true,
    defaultPriority: true,
    defaultFolderId: true,
    ...Object.values(FEATURE_COLUMN_MAP).reduce((select, column) => ({
        ...select,
        [column]: true
    }), {}),
    defaultFolder: {
        select: {
            id: true,
            name: true,
            isActive: true
        }
    },
    createdAt: true,
    updatedAt: true
};
const UPDATE_FIELDS = [
    'portalName',
    'companyName',
    'welcomeMessage',
    'locale',
    'timezone',
    'defaultPriority',
    'defaultFolderId',
    'features'
];
const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

const createSettingsError = (message) => {
    const error = new Error(message);
    error.code = 'SERVICEDESK_INVALID';
    return error;
};

const normalizeString = (value, fieldName, { allowEmpty = false, nullable = false, maxLength = null } = {}) => {
    if (value === null && nullable) return null;
    if (typeof value !== 'string') {
        throw createSettingsError(`${fieldName} должен быть строкой${nullable ? ' или null' : ''}.`);
    }
    const normalized = value.trim();
    if (!allowEmpty && !normalized) {
        throw createSettingsError(`${fieldName} не может быть пустым.`);
    }
    if (maxLength && normalized.length > maxLength) {
        throw createSettingsError(`${fieldName} должен быть не длиннее ${maxLength} символов.`);
    }
    return normalized;
};

const validateLocale = (value) => {
    const locale = normalizeString(value, 'locale');
    try {
        return new Intl.Locale(locale).toString();
    } catch {
        throw createSettingsError('locale должен быть корректным BCP 47 locale, например ru-RU.');
    }
};

const validateTimezone = (value) => {
    const timezone = normalizeString(value, 'timezone');
    try {
        new Intl.DateTimeFormat('ru-RU', { timeZone: timezone }).format();
        return timezone;
    } catch {
        throw createSettingsError('timezone должен быть корректным IANA timezone, например Europe/Moscow.');
    }
};

const assertPayloadFields = (payload) => {
    const unsupported = Object.keys(payload).filter((field) => !UPDATE_FIELDS.includes(field));
    if (unsupported.length > 0) {
        throw createSettingsError(`Неподдерживаемые поля настроек: ${unsupported.join(', ')}.`);
    }
};

const normalizeFeatures = (features) => {
    if (!features || typeof features !== 'object' || Array.isArray(features)) {
        throw createSettingsError('features должен быть объектом.');
    }

    const unsupported = Object.keys(features).filter((feature) => !FEATURE_KEYS.includes(feature));
    if (unsupported.length > 0) {
        throw createSettingsError(`Неподдерживаемые функции: ${unsupported.join(', ')}.`);
    }

    return Object.entries(features).reduce((data, [feature, enabled]) => {
        if (typeof enabled !== 'boolean') {
            throw createSettingsError(`features.${feature} должен быть boolean.`);
        }
        data[FEATURE_COLUMN_MAP[feature]] = enabled;
        return data;
    }, {});
};

const getProductSettings = async(db = prisma) => {
    const existing = await db.productSettings.findUnique({
        where: { id: PRODUCT_SETTINGS_ID },
        select: PRODUCT_SETTINGS_SELECT
    });
    if (existing) return existing;

    try {
        return await db.productSettings.create({
            data: { id: PRODUCT_SETTINGS_ID, ...PRODUCT_SETTINGS_DEFAULTS },
            select: PRODUCT_SETTINGS_SELECT
        });
    } catch (error) {
        if (error.code !== 'P2002') throw error;
        return db.productSettings.findUniqueOrThrow({
            where: { id: PRODUCT_SETTINGS_ID },
            select: PRODUCT_SETTINGS_SELECT
        });
    }
};

const updateProductSettings = async(payload, db = prisma) => {
    assertPayloadFields(payload);
    const data = {};

    if (Object.prototype.hasOwnProperty.call(payload, 'portalName')) {
        data.portalName = normalizeString(payload.portalName, 'portalName', { maxLength: 120 });
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'companyName')) {
        data.companyName = normalizeString(payload.companyName, 'companyName', {
            allowEmpty: true,
            maxLength: 255
        });
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'welcomeMessage')) {
        data.welcomeMessage = normalizeString(payload.welcomeMessage, 'welcomeMessage', {
            allowEmpty: true,
            nullable: true,
            maxLength: 2000
        });
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'locale')) {
        data.locale = validateLocale(payload.locale);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'timezone')) {
        data.timezone = validateTimezone(payload.timezone);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'defaultPriority')) {
        if (!PRIORITIES.has(payload.defaultPriority)) {
            throw createSettingsError('defaultPriority имеет некорректное значение.');
        }
        data.defaultPriority = payload.defaultPriority;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'defaultFolderId')) {
        if (payload.defaultFolderId === null) {
            data.defaultFolderId = null;
        } else {
            const folderId = normalizeString(payload.defaultFolderId, 'defaultFolderId');
            const folder = await db.ticketFolder.findUnique({
                where: { id: folderId },
                select: { id: true, isActive: true }
            });
            if (!folder) {
                throw createSettingsError('Папка по умолчанию не найдена.');
            }
            if (!folder.isActive) {
                throw createSettingsError('Папка по умолчанию должна быть активной.');
            }
            data.defaultFolderId = folder.id;
        }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'features')) {
        Object.assign(data, normalizeFeatures(payload.features));
    }

    if (Object.keys(data).length === 0) {
        throw createSettingsError('Нет данных для обновления настроек продукта.');
    }

    const performUpdate = async(targetDb) => {
        await getProductSettings(targetDb);
        const settings = await targetDb.productSettings.update({
            where: { id: PRODUCT_SETTINGS_ID },
            data,
            select: PRODUCT_SETTINGS_SELECT
        });

        if (Object.prototype.hasOwnProperty.call(data, 'chatsEnabled')) {
            await targetDb.chatSettings.upsert({
                where: { id: 'default' },
                create: { id: 'default', chatsEnabled: data.chatsEnabled },
                update: { chatsEnabled: data.chatsEnabled }
            });
        }

        return settings;
    };

    if (db === prisma) {
        return prisma.$transaction(performUpdate);
    }
    return performUpdate(db);
};

const isFeatureEnabled = async(feature, db = prisma) => {
    const column = FEATURE_COLUMN_MAP[feature];
    if (!column) {
        throw createSettingsError(`Неизвестная функция: ${feature}.`);
    }
    const settings = await getProductSettings(db);
    if (settings[column] === false) return false;
    return (FEATURE_DEPENDENCIES[feature] || []).every((dependency) => (
        settings[FEATURE_COLUMN_MAP[dependency]] !== false
    ));
};

module.exports = {
    FEATURE_COLUMN_MAP,
    FEATURE_KEYS,
    PRODUCT_SETTINGS_ID,
    PRODUCT_SETTINGS_DEFAULTS,
    PRODUCT_SETTINGS_SELECT,
    getProductSettings,
    isFeatureEnabled,
    updateProductSettings
};
