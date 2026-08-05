const serializeNullableDate = (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const serializeJsonObject = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return JSON.parse(JSON.stringify(value));
};

const serializeFolder = (folder, options = {}) => {
    if (!folder) return null;

    return {
        id: folder.id,
        name: folder.name,
        description: folder.description ?? null,
        isActive: folder.isActive,
        createdAt: serializeNullableDate(folder.createdAt),
        updatedAt: serializeNullableDate(folder.updatedAt),
        counts: options.includeCounts !== false && folder._count
            ? {
                tasks: folder._count.tasks,
                types: folder._count.types,
                subtypes: folder._count.subtypes,
                teams: folder._count.teamAccesses ?? 0,
                slaPolicies: folder._count.slaPolicies ?? 0,
                productSettings: folder._count.productSettings ?? 0
            }
            : undefined
    };
};

const serializeProductSettings = (settings, options = {}) => {
    if (!settings) return null;

    const payload = {
        portalName: settings.portalName,
        companyName: settings.companyName,
        welcomeMessage: settings.welcomeMessage ?? null,
        locale: settings.locale,
        timezone: settings.timezone,
        defaultPriority: settings.defaultPriority,
        defaultFolderId: settings.defaultFolderId ?? null,
        defaultFolder: settings.defaultFolder
            ? {
                id: settings.defaultFolder.id,
                name: settings.defaultFolder.name
            }
            : null,
        features: {
            dashboard: settings.dashboardEnabled !== false,
            tickets: settings.ticketsEnabled !== false,
            ticketCreation: settings.ticketCreationEnabled !== false,
            queue: settings.queueEnabled !== false,
            knowledge: settings.knowledgeEnabled !== false,
            cannedReplies: settings.cannedRepliesEnabled !== false,
            chats: settings.chatsEnabled !== false,
            team: settings.teamEnabled !== false,
            reports: settings.reportsEnabled !== false,
            notifications: settings.notificationsEnabled !== false,
            automation: settings.automationEnabled !== false,
            email: settings.emailEnabled !== false,
            taskAttachments: settings.taskAttachmentsEnabled !== false,
            freshdeskImport: settings.freshdeskImportEnabled !== false
        }
    };

    if (options.admin) {
        payload.id = settings.id;
        payload.createdAt = serializeNullableDate(settings.createdAt);
        payload.updatedAt = serializeNullableDate(settings.updatedAt);
    }

    return payload;
};

const serializeEntity = (entity, options = {}) => {
    if (!entity) return null;

    return {
        id: entity.id,
        name: entity.name,
        code: entity.code ?? null,
        description: entity.description ?? null,
        isActive: entity.isActive,
        createdAt: serializeNullableDate(entity.createdAt),
        updatedAt: serializeNullableDate(entity.updatedAt),
        counts: options.includeCounts !== false && entity._count
            ? {
                tasks: entity._count.tasks,
                types: entity._count.types
            }
            : undefined
    };
};

const serializeType = (type, options = {}) => {
    if (!type) return null;

    return {
        id: type.id,
        name: type.name,
        code: type.code ?? null,
        description: type.description ?? null,
        isActive: type.isActive,
        folderId: type.folderId ?? null,
        entityId: type.entityId ?? null,
        teamId: type.teamId ?? null,
        folder: serializeFolder(type.folder, options),
        entity: serializeEntity(type.entity, options),
        team: serializeTeam(type.team, { ...options, includeMembers: false, includeCounts: false }),
        createdAt: serializeNullableDate(type.createdAt),
        updatedAt: serializeNullableDate(type.updatedAt),
        counts: options.includeCounts !== false && type._count
            ? {
                tasks: type._count.tasks,
                subtypes: type._count.subtypes,
                slaPolicies: type._count.slaPolicies ?? 0
            }
            : undefined
    };
};

const serializeSubtype = (subtype, options = {}) => {
    if (!subtype) return null;

    return {
        id: subtype.id,
        name: subtype.name,
        code: subtype.code ?? null,
        description: subtype.description ?? null,
        isActive: subtype.isActive,
        typeId: subtype.typeId,
        folderId: subtype.folderId ?? null,
        teamId: subtype.teamId ?? null,
        type: serializeType(subtype.type, options),
        folder: serializeFolder(subtype.folder, options),
        team: serializeTeam(subtype.team, { ...options, includeMembers: false, includeCounts: false }),
        createdAt: serializeNullableDate(subtype.createdAt),
        updatedAt: serializeNullableDate(subtype.updatedAt),
        counts: options.includeCounts !== false && subtype._count
            ? {
                tasks: subtype._count.tasks,
                slaPolicies: subtype._count.slaPolicies ?? 0
            }
            : undefined
    };
};

const serializeTeamMember = (member) => {
    if (!member) return null;

    return {
        id: member.id,
        teamId: member.teamId,
        userId: member.userId,
        role: member.role ?? null,
        isLead: member.isLead,
        user: member.user
            ? {
                id: member.user.id,
                name: member.user.name,
                email: member.user.email,
                role: member.user.role
            }
            : undefined,
        createdAt: serializeNullableDate(member.createdAt),
        updatedAt: serializeNullableDate(member.updatedAt)
    };
};

const serializeTeam = (team, options = {}) => {
    if (!team) return null;

    const folderAccesses = Array.isArray(team.folderAccesses) ? team.folderAccesses : [];
    const folders = folderAccesses
        .map((access) => serializeFolder(access.folder, options))
        .filter(Boolean);
    const folderIds = folderAccesses.map((access) => access.folderId);

    return {
        id: team.id,
        name: team.name,
        description: team.description ?? null,
        isActive: team.isActive,
        folderIds,
        folders,
        members: options.includeMembers === false
            ? undefined
            : (Array.isArray(team.members) ? team.members.map(serializeTeamMember) : undefined),
        createdAt: serializeNullableDate(team.createdAt),
        updatedAt: serializeNullableDate(team.updatedAt),
        counts: options.includeCounts !== false && team._count
            ? {
                members: team._count.members,
                folders: team._count.folderAccesses ?? folderIds.length
            }
            : undefined
    };
};

const serializeAutomationRule = (rule) => {
    if (!rule) return null;

    const conditions = {};
    const actions = {};

    if (rule.conditionChannel) conditions.channel = rule.conditionChannel;
    if (rule.conditionFolderId) conditions.folderId = rule.conditionFolderId;
    if (rule.conditionEntityId) conditions.entityId = rule.conditionEntityId;
    if (rule.conditionTypeId) conditions.typeId = rule.conditionTypeId;
    if (rule.conditionSubtypeId) conditions.subtypeId = rule.conditionSubtypeId;
    if (rule.conditionPriority) conditions.priority = rule.conditionPriority;
    if (rule.conditionRequesterEmailContains) {
        conditions.requesterEmailContains = rule.conditionRequesterEmailContains;
    }
    if (rule.conditionTitleContains) conditions.titleContains = rule.conditionTitleContains;

    if (rule.actionSetFolderId) actions.setFolderId = rule.actionSetFolderId;
    if (rule.actionSetEntityId) actions.setEntityId = rule.actionSetEntityId;
    if (rule.actionSetTypeId) actions.setTypeId = rule.actionSetTypeId;
    if (rule.actionSetSubtypeId) actions.setSubtypeId = rule.actionSetSubtypeId;
    if (rule.actionSetPriority) actions.setPriority = rule.actionSetPriority;
    if (rule.actionSetAssigneeIdsEnabled) actions.setAssigneeIds = [...(rule.actionSetAssigneeIds || [])];

    return {
        id: rule.id,
        name: rule.name,
        description: rule.description ?? null,
        isActive: rule.isActive,
        sortOrder: rule.sortOrder,
        triggerType: rule.triggerType,
        conditions,
        actions,
        createdAt: serializeNullableDate(rule.createdAt),
        updatedAt: serializeNullableDate(rule.updatedAt)
    };
};

const serializeAutomationRun = (run) => {
    if (!run) return null;

    return {
        id: run.id,
        ruleId: run.ruleId,
        ruleName: run.ruleName,
        taskId: run.taskId,
        triggerType: run.triggerType,
        status: run.status,
        success: run.status === 'SUCCESS',
        appliedActions: serializeJsonObject(run.appliedActions),
        errorMessage: run.errorMessage ?? null,
        createdAt: serializeNullableDate(run.createdAt)
    };
};

const serializeSlaPolicy = (policy) => {
    if (!policy) return null;

    return {
        id: policy.id,
        name: policy.name,
        description: policy.description ?? null,
        isActive: policy.isActive,
        sortOrder: policy.sortOrder,
        folderId: policy.folderId ?? null,
        typeId: policy.typeId ?? null,
        subtypeId: policy.subtypeId ?? null,
        priority: policy.priority ?? null,
        firstResponseMinutes: policy.firstResponseMinutes ?? null,
        resolutionMinutes: policy.resolutionMinutes ?? null,
        folder: serializeFolder(policy.folder),
        type: serializeType(policy.type),
        subtype: serializeSubtype(policy.subtype),
        createdAt: serializeNullableDate(policy.createdAt),
        updatedAt: serializeNullableDate(policy.updatedAt),
        counts: policy._count
            ? {
                tasks: policy._count.tasks
            }
            : undefined
    };
};

const serializeEmailOutboxAdmin = (message) => {
    if (!message) return null;

    return {
        id: message.id,
        taskId: message.taskId,
        commentId: message.commentId ?? null,
        recipientEmail: message.recipientEmail,
        recipientName: message.recipientName ?? null,
        fromEmail: message.fromEmail,
        subject: message.subject,
        textPreview: message.textPreview ?? null,
        status: message.status,
        dryRun: message.dryRun,
        messageId: message.messageId ?? null,
        providerMessageId: message.providerMessageId ?? null,
        inReplyTo: message.inReplyTo ?? null,
        references: message.references ?? null,
        errorMessage: message.errorMessage ?? null,
        attempts: message.attempts,
        lastAttemptAt: serializeNullableDate(message.lastAttemptAt),
        nextRetryAt: serializeNullableDate(message.nextRetryAt),
        lockedAt: serializeNullableDate(message.lockedAt),
        lockedBy: message.lockedBy ?? null,
        createdById: message.createdById ?? null,
        createdBy: message.createdBy
            ? {
                id: message.createdBy.id,
                name: message.createdBy.name,
                email: message.createdBy.email,
                role: message.createdBy.role
            }
            : null,
        task: message.task
            ? {
                id: message.task.id,
                ticketNumber: message.task.ticketNumber,
                title: message.task.title
            }
            : null,
        comment: message.comment
            ? {
                id: message.comment.id,
                visibility: message.comment.visibility
            }
            : null,
        createdAt: serializeNullableDate(message.createdAt),
        updatedAt: serializeNullableDate(message.updatedAt)
    };
};

const serializeFreshdeskImportRun = (run) => {
    if (!run) return null;

    return {
        id: run.id,
        source: run.source,
        status: run.status,
        dryRun: run.dryRun,
        fileName: run.fileName ?? null,
        summary: run.summary ?? null,
        errors: Array.isArray(run.errors) ? run.errors : (run.errors ?? []),
        createdById: run.createdById ?? null,
        createdBy: run.createdBy
            ? {
                id: run.createdBy.id,
                name: run.createdBy.name,
                email: run.createdBy.email,
                role: run.createdBy.role
            }
            : null,
        createdAt: serializeNullableDate(run.createdAt),
        updatedAt: serializeNullableDate(run.updatedAt),
        finishedAt: serializeNullableDate(run.finishedAt)
    };
};

module.exports = {
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
};
