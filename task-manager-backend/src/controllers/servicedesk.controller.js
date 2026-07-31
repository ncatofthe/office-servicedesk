const servicedeskService = require('../services/servicedesk.service.js');
const automationService = require('../services/automation.service.js');
const slaService = require('../services/sla.service.js');
const emailOutboundService = require('../services/email-outbound.service.js');
const freshdeskImportService = require('../services/freshdesk-import.service.js');
const freshdeskApiService = require('../services/freshdesk-api.service.js');
const productSettingsService = require('../services/product-settings.service.js');
const emailSettingsService = require('../services/email-settings.service.js');
const { startEmailIntakeScheduler, stopEmailIntakeScheduler } = require('../services/email-intake.service.js');
const { startEmailOutboxWorker, stopEmailOutboxWorker } = require('../services/email-outbox-worker.service.js');
const {
    serializeFolder,
    serializeEntity,
    serializeType,
    serializeSubtype,
    serializeTeam,
    serializeTeamMember,
    serializeSlaPolicy,
    serializeAutomationRule,
    serializeAutomationRun,
    serializeEmailOutboxAdmin,
    serializeFreshdeskImportRun,
    serializeProductSettings
} = require('../serializers/servicedesk.serializer.js');

const handleServiceDeskError = (error, res) => {
    if (error.code === 'SERVICEDESK_NOT_FOUND') {
        return res.status(404).json({ error: error.message });
    }

    if (error.code === 'SERVICEDESK_INVALID') {
        return res.status(400).json({ error: error.message });
    }

    if (error.code === 'SERVICEDESK_DELETE_BLOCKED') {
        return res.status(409).json({ error: error.message, blockers: error.blockers });
    }

    if (error.code === 'P2002') {
        return res.status(400).json({ error: servicedeskService.mapUniqueConstraintMessage(error) });
    }

    if (error.code === 'P2003') {
        return res.status(400).json({ error: 'Нельзя выполнить операцию: запись связана с другими данными.' });
    }

    if (error.code === 'FRESHDESK_IMPORT_NOT_FOUND') {
        return res.status(404).json({ error: error.message });
    }

    if (error.code === 'FRESHDESK_IMPORT_CONFLICT') {
        return res.status(409).json({ error: error.message });
    }

    if (error.code === 'FRESHDESK_NOT_CONFIGURED') {
        return res.status(503).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Ошибка ServiceDesk.' });
};

const listFolders = async(req, res) => {
    try {
        const folders = await servicedeskService.listFolders();
        res.json(folders.map(serializeFolder));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const getProductSettings = async(req, res) => {
    try {
        const settings = await productSettingsService.getProductSettings();
        res.json(serializeProductSettings(settings));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const getAdminProductSettings = async(req, res) => {
    try {
        const settings = await productSettingsService.getProductSettings();
        res.json(serializeProductSettings(settings, { admin: true }));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const updateProductSettings = async(req, res) => {
    try {
        const settings = await productSettingsService.updateProductSettings(req.body || {});
        res.json(serializeProductSettings(settings, { admin: true }));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const listActiveFolders = async(req, res) => {
    try {
        const folders = await servicedeskService.listAvailableFoldersForUser(req.user);
        res.json(folders.map((folder) => serializeFolder(folder, { includeCounts: false })));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const createFolder = async(req, res) => {
    try {
        const folder = await servicedeskService.createFolder(req.body || {});
        res.status(201).json(serializeFolder(folder));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const updateFolder = async(req, res) => {
    try {
        const folder = await servicedeskService.updateFolder(req.params.id, req.body || {});
        res.json(serializeFolder(folder));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const deleteFolder = async(req, res) => {
    try {
        const result = await servicedeskService.deleteFolder(req.params.id, { mode: req.query.mode });
        res.json(result);
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const listEntities = async(req, res) => {
    try {
        const entities = await servicedeskService.listEntities();
        res.json(entities.map(serializeEntity));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const listActiveEntities = async(req, res) => {
    try {
        const entities = await servicedeskService.listActiveEntities();
        res.json(entities.map((entity) => serializeEntity(entity, { includeCounts: false })));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const createEntity = async(req, res) => {
    try {
        const entity = await servicedeskService.createEntity(req.body || {});
        res.status(201).json(serializeEntity(entity));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const updateEntity = async(req, res) => {
    try {
        const entity = await servicedeskService.updateEntity(req.params.id, req.body || {});
        res.json(serializeEntity(entity));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const deleteEntity = async(req, res) => {
    try {
        const result = await servicedeskService.deleteEntity(req.params.id, { mode: req.query.mode });
        res.json(result);
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const listTypes = async(req, res) => {
    try {
        const types = await servicedeskService.listTypes();
        res.json(types.map(serializeType));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const listActiveTypes = async(req, res) => {
    try {
        const types = await servicedeskService.listActiveTypes(req.user);
        res.json(types.map((type) => serializeType(type, { includeCounts: false })));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const createType = async(req, res) => {
    try {
        const type = await servicedeskService.createType(req.body || {});
        res.status(201).json(serializeType(type));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const updateType = async(req, res) => {
    try {
        const type = await servicedeskService.updateType(req.params.id, req.body || {});
        res.json(serializeType(type));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const deleteType = async(req, res) => {
    try {
        const result = await servicedeskService.deleteType(req.params.id, { mode: req.query.mode });
        res.json(result);
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const listSubtypes = async(req, res) => {
    try {
        const subtypes = await servicedeskService.listSubtypes();
        res.json(subtypes.map(serializeSubtype));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const listActiveSubtypes = async(req, res) => {
    try {
        const subtypes = await servicedeskService.listActiveSubtypes(req.user);
        res.json(subtypes.map((subtype) => serializeSubtype(subtype, { includeCounts: false })));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const createSubtype = async(req, res) => {
    try {
        const subtype = await servicedeskService.createSubtype(req.body || {});
        res.status(201).json(serializeSubtype(subtype));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const updateSubtype = async(req, res) => {
    try {
        const subtype = await servicedeskService.updateSubtype(req.params.id, req.body || {});
        res.json(serializeSubtype(subtype));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const deleteSubtype = async(req, res) => {
    try {
        const result = await servicedeskService.deleteSubtype(req.params.id, { mode: req.query.mode });
        res.json(result);
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const listTeams = async(req, res) => {
    try {
        const teams = await servicedeskService.listTeams();
        res.json(teams.map(serializeTeam));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const listActiveTeams = async(req, res) => {
    try {
        const teams = await servicedeskService.listActiveTeams(req.user);
        res.json(teams.map((team) => serializeTeam(team, {
            includeMembers: false,
            includeCounts: false
        })));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const createTeam = async(req, res) => {
    try {
        const team = await servicedeskService.createTeam(req.body || {});
        res.status(201).json(serializeTeam(team));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const updateTeam = async(req, res) => {
    try {
        const team = await servicedeskService.updateTeam(req.params.id, req.body || {});
        res.json(serializeTeam(team));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const deleteTeam = async(req, res) => {
    try {
        const result = await servicedeskService.deleteTeam(req.params.id);
        res.json(result);
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const listTeamMembers = async(req, res) => {
    try {
        const members = await servicedeskService.listTeamMembers(req.params.teamId);
        res.json(members.map(serializeTeamMember));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const createTeamMember = async(req, res) => {
    try {
        const member = await servicedeskService.createTeamMember(req.params.teamId, req.body || {});
        res.status(201).json(serializeTeamMember(member));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const updateTeamMember = async(req, res) => {
    try {
        const member = await servicedeskService.updateTeamMember(req.params.id, req.body || {});
        res.json(serializeTeamMember(member));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const deleteTeamMember = async(req, res) => {
    try {
        const result = await servicedeskService.deleteTeamMember(req.params.id);
        res.json(result);
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const listSlaPolicies = async(req, res) => {
    try {
        const policies = await slaService.listPolicies();
        res.json(policies.map(serializeSlaPolicy));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const getSlaPolicy = async(req, res) => {
    try {
        const policy = await slaService.getPolicy(req.params.id);
        res.json(serializeSlaPolicy(policy));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const createSlaPolicy = async(req, res) => {
    try {
        const policy = await slaService.createPolicy(req.body || {});
        res.status(201).json(serializeSlaPolicy(policy));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const updateSlaPolicy = async(req, res) => {
    try {
        const policy = await slaService.updatePolicy(req.params.id, req.body || {});
        res.json(serializeSlaPolicy(policy));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const deleteSlaPolicy = async(req, res) => {
    try {
        const result = await slaService.deletePolicy(req.params.id);
        res.json(result);
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const testSlaPolicy = async(req, res) => {
    try {
        const result = await slaService.testPolicy(req.params.id, req.body?.taskId);
        res.json({
            matched: result.matched,
            policy: serializeSlaPolicy(result.policy),
            resultingDueDates: {
                firstResponseDueAt: result.resultingDueDates.firstResponseDueAt,
                resolutionDueAt: result.resultingDueDates.resolutionDueAt
            },
            resultingStatuses: result.resultingStatuses
        });
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const listAutomationRules = async(req, res) => {
    try {
        const rules = await automationService.listRules();
        res.json(rules.map(serializeAutomationRule));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const getAutomationRule = async(req, res) => {
    try {
        const rule = await automationService.getRule(req.params.id);
        res.json(serializeAutomationRule(rule));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const createAutomationRule = async(req, res) => {
    try {
        const rule = await automationService.createRule(req.body || {});
        res.status(201).json(serializeAutomationRule(rule));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const updateAutomationRule = async(req, res) => {
    try {
        const rule = await automationService.updateRule(req.params.id, req.body || {});
        res.json(serializeAutomationRule(rule));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const deleteAutomationRule = async(req, res) => {
    try {
        const result = await automationService.deleteRule(req.params.id);
        res.json(result);
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const listAutomationRuns = async(req, res) => {
    try {
        const runs = await automationService.listRuns(req.query || {});
        res.json(runs.map(serializeAutomationRun));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const testAutomationRule = async(req, res) => {
    try {
        const result = await automationService.testRule(req.params.id, req.body?.taskId);
        res.json(result);
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const listEmailOutbox = async(req, res) => {
    try {
        const messages = await emailOutboundService.listEmailOutbox(req.query || {});
        res.json(messages.map(serializeEmailOutboxAdmin));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const getEmailHealth = async(req, res) => {
    try {
        const health = await emailOutboundService.getEmailHealth();
        res.json(health);
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const getEmailSettings = async(req, res) => {
    try { res.json(emailSettingsService.publicSettings(emailSettingsService.getRuntimeEmailSettings())); }
    catch (error) { handleServiceDeskError(error, res); }
};

const updateEmailSettings = async(req, res) => {
    try {
        const settings = await emailSettingsService.updateEmailSettings(req.body || {});
        stopEmailIntakeScheduler(); stopEmailOutboxWorker(); startEmailIntakeScheduler(); startEmailOutboxWorker();
        res.json(settings);
    } catch (error) { handleServiceDeskError(error, res); }
};

const testEmailSettings = async(req, res) => {
    try { res.json(await emailSettingsService.testEmailConnection(String(req.body?.target || 'BOTH').toUpperCase())); }
    catch (error) { handleServiceDeskError(error, res); }
};

const retryEmailOutboxMessage = async(req, res) => {
    try {
        const result = await emailOutboundService.retryOutboundMessageById(req.params.id, {
            source: 'admin-api',
            workerId: `admin-api-${req.user?.id || 'unknown'}`
        });
        res.json(result);
    } catch (error) {
        if (error.message === 'OUTBOX_NOT_FOUND') {
            return res.status(404).json({ error: 'Запись outbox не найдена.' });
        }
        handleServiceDeskError(error, res);
    }
};

const normalizeImportRecordsBody = (body) => {
    if (Array.isArray(body)) {
        return {
            records: body,
            fileName: 'api-payload.json'
        };
    }

    if (Array.isArray(body?.tickets)) {
        return {
            records: body.tickets,
            fileName: body.fileName || 'api-payload.json'
        };
    }

    throw new Error('Передайте массив заявок или объект { tickets: [...] }.');
};

const runFreshdeskImport = async(req, res, dryRun) => {
    try {
        const payload = normalizeImportRecordsBody(req.body || {});
        const result = await freshdeskImportService.importFreshdeskRecords({
            records: payload.records,
            dryRun,
            createdById: req.user?.id || null,
            fileName: payload.fileName
        });

        res.status(dryRun ? 200 : 201).json({
            run: serializeFreshdeskImportRun(result.run),
            summary: result.summary,
            errors: result.errors
        });
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const dryRunFreshdeskImport = async(req, res) => {
    await runFreshdeskImport(req, res, true);
};

const createFreshdeskImport = async(req, res) => {
    await runFreshdeskImport(req, res, false);
};

const listFreshdeskImportRuns = async(req, res) => {
    try {
        const runs = await freshdeskImportService.listFreshdeskImportRuns(req.query || {});
        res.json(runs.map(serializeFreshdeskImportRun));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const getFreshdeskImportRun = async(req, res) => {
    try {
        const run = await freshdeskImportService.getFreshdeskImportRun(req.params.id);
        res.json(serializeFreshdeskImportRun(run));
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const getFreshdeskSourceHealth = async(req, res) => {
    res.json(freshdeskApiService.getFreshdeskSourceHealth());
};

const runFreshdeskApiPull = async(req, res, dryRun) => {
    try {
        const result = await freshdeskApiService.pullAndImportFreshdesk({
            dryRun,
            updatedSince: req.body?.updatedSince || null,
            maxTickets: req.body?.maxTickets || 100,
            downloadAttachments: Boolean(req.body?.downloadAttachments),
            createdById: req.user.id
        });
        res.status(dryRun ? 200 : 201).json({
            run: serializeFreshdeskImportRun(result.run),
            summary: result.summary,
            errors: result.errors
        });
    } catch (error) {
        handleServiceDeskError(error, res);
    }
};

const dryRunFreshdeskApiPull = async(req, res) => runFreshdeskApiPull(req, res, true);
const createFreshdeskApiPull = async(req, res) => runFreshdeskApiPull(req, res, false);

module.exports = {
    getProductSettings,
    getAdminProductSettings,
    updateProductSettings,
    listFolders,
    listActiveFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    listEntities,
    listActiveEntities,
    createEntity,
    updateEntity,
    deleteEntity,
    listTypes,
    listActiveTypes,
    createType,
    updateType,
    deleteType,
    listSubtypes,
    listActiveSubtypes,
    createSubtype,
    updateSubtype,
    deleteSubtype,
    listTeams,
    listActiveTeams,
    createTeam,
    updateTeam,
    deleteTeam,
    listTeamMembers,
    createTeamMember,
    updateTeamMember,
    deleteTeamMember,
    listSlaPolicies,
    getSlaPolicy,
    createSlaPolicy,
    updateSlaPolicy,
    deleteSlaPolicy,
    testSlaPolicy,
    listAutomationRules,
    getAutomationRule,
    createAutomationRule,
    updateAutomationRule,
    deleteAutomationRule,
    listAutomationRuns,
    testAutomationRule,
    listEmailOutbox,
    getEmailHealth,
    getEmailSettings,
    updateEmailSettings,
    testEmailSettings,
    retryEmailOutboxMessage,
    dryRunFreshdeskImport,
    createFreshdeskImport,
    listFreshdeskImportRuns,
    getFreshdeskImportRun,
    getFreshdeskSourceHealth,
    dryRunFreshdeskApiPull,
    createFreshdeskApiPull
};
