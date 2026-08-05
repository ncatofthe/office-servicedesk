const { mapAttachmentToDownloadPath } = require('../utils/attachment.utils.js');
const { deriveSlaTimerStatus } = require('../utils/sla.js');

const toIsoString = (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const formatTaskDisplayNumber = (ticketNumber) =>
    typeof ticketNumber === 'number' ? `#${ticketNumber}` : undefined;

const resolveTaskPresentation = (task, overrides = {}) => {
    if (!task) {
        return null;
    }

    const ticketNumber = Object.prototype.hasOwnProperty.call(overrides, 'ticketNumber')
        ? overrides.ticketNumber
        : task.ticketNumber;
    const status = Object.prototype.hasOwnProperty.call(overrides, 'status')
        ? overrides.status
        : task.status;

    return {
        ...task,
        ticketNumber,
        status
    };
};

const getUnionChildPresentationOverrides = (record) => {
    if (!record || record.mergeMode !== 'UNION' || !record.masterTask) {
        return {};
    }

    return {
        ticketNumber: record.masterTask.ticketNumber,
        status: record.masterTask.status
    };
};

const getUnionDetailPresentationOverrides = (task) => {
    const unionParent = Array.isArray(task?.mergeInfo?.parentLinks)
        ? task.mergeInfo.parentLinks.find((record) => record?.mergeMode === 'UNION' && record.masterTask)
        : null;

    if (!unionParent?.masterTask) {
        return {};
    }

    return {
        ticketNumber: unionParent.masterTask.ticketNumber,
        status: unionParent.masterTask.status
    };
};

const serializeTaskAuthor = (user) => {
    if (!user) return undefined;

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        position: Object.prototype.hasOwnProperty.call(user, 'position') ? user.position : undefined,
        department: Object.prototype.hasOwnProperty.call(user, 'department') ? user.department : undefined,
        createdAt: Object.prototype.hasOwnProperty.call(user, 'createdAt') ? toIsoString(user.createdAt) : undefined,
        updatedAt: Object.prototype.hasOwnProperty.call(user, 'updatedAt') ? toIsoString(user.updatedAt) : undefined
    };
};

const serializeTaskAssigneeUser = (user) => {
    if (!user) return undefined;

    return {
        id: user.id,
        name: user.name,
        role: user.role
    };
};

const serializeTaskAssignee = (assignee) => {
    if (!assignee) return undefined;

    return {
        id: assignee.id,
        taskId: Object.prototype.hasOwnProperty.call(assignee, 'taskId') ? assignee.taskId : undefined,
        userId: assignee.userId,
        user: serializeTaskAssigneeUser(assignee.user)
    };
};

const serializeTaskCommentAuthor = (user) => {
    if (!user) return undefined;

    return {
        id: user.id,
        name: user.name
    };
};

const serializeTaskComment = (comment) => {
    if (!comment) return undefined;

    return {
        id: comment.id,
        content: comment.content,
        visibility: Object.prototype.hasOwnProperty.call(comment, 'visibility') ? comment.visibility : 'PUBLIC',
        taskId: comment.taskId,
        authorId: comment.authorId,
        author: serializeTaskCommentAuthor(comment.author),
        createdAt: toIsoString(comment.createdAt)
    };
};

const serializeTaskAttachment = (attachment) => {
    if (!attachment) return undefined;

    const publicAttachment = mapAttachmentToDownloadPath(attachment);

    return {
        id: publicAttachment.id,
        filename: publicAttachment.filename,
        path: publicAttachment.path,
        taskId: publicAttachment.taskId,
        uploadedById: publicAttachment.uploadedById,
        createdAt: toIsoString(publicAttachment.createdAt)
    };
};

const serializeTaskLatestReviewReviewer = (user) => {
    if (!user) return null;

    return {
        id: user.id,
        name: user.name,
        role: user.role
    };
};

const serializeTaskLatestReview = (review) => {
    if (!review) return null;

    return {
        id: review.id,
        status: review.status,
        amount: review.amount ?? null,
        comment: review.comment ?? null,
        taskId: review.taskId,
        reviewerId: review.reviewerId ?? null,
        reviewer: serializeTaskLatestReviewReviewer(review.reviewer),
        createdAt: toIsoString(review.createdAt)
    };
};

const serializeTaskDepartment = (department) => {
    if (!department) return null;

    return {
        id: department.id,
        name: department.name,
        code: Object.prototype.hasOwnProperty.call(department, 'code') ? department.code : undefined,
        headUserId: Object.prototype.hasOwnProperty.call(department, 'headUserId') ? department.headUserId : undefined,
        isActive: Object.prototype.hasOwnProperty.call(department, 'isActive') ? department.isActive : undefined
    };
};

const serializeTaskFolder = (folder) => {
    if (!folder) return null;

    return {
        id: folder.id,
        name: folder.name,
        description: Object.prototype.hasOwnProperty.call(folder, 'description') ? folder.description : undefined,
        isActive: Object.prototype.hasOwnProperty.call(folder, 'isActive') ? folder.isActive : undefined
    };
};

const serializeTaskEntity = (entity) => {
    if (!entity) return null;

    return {
        id: entity.id,
        name: entity.name,
        code: Object.prototype.hasOwnProperty.call(entity, 'code') ? entity.code : undefined,
        description: Object.prototype.hasOwnProperty.call(entity, 'description') ? entity.description : undefined,
        isActive: Object.prototype.hasOwnProperty.call(entity, 'isActive') ? entity.isActive : undefined
    };
};

const serializeTaskType = (type) => {
    if (!type) return null;

    return {
        id: type.id,
        name: type.name,
        code: Object.prototype.hasOwnProperty.call(type, 'code') ? type.code : undefined,
        description: Object.prototype.hasOwnProperty.call(type, 'description') ? type.description : undefined,
        isActive: Object.prototype.hasOwnProperty.call(type, 'isActive') ? type.isActive : undefined,
        folderId: Object.prototype.hasOwnProperty.call(type, 'folderId') ? type.folderId : undefined,
        entityId: Object.prototype.hasOwnProperty.call(type, 'entityId') ? type.entityId : undefined
    };
};

const serializeTaskSubtype = (subtype) => {
    if (!subtype) return null;

    return {
        id: subtype.id,
        name: subtype.name,
        code: Object.prototype.hasOwnProperty.call(subtype, 'code') ? subtype.code : undefined,
        description: Object.prototype.hasOwnProperty.call(subtype, 'description') ? subtype.description : undefined,
        isActive: Object.prototype.hasOwnProperty.call(subtype, 'isActive') ? subtype.isActive : undefined,
        typeId: Object.prototype.hasOwnProperty.call(subtype, 'typeId') ? subtype.typeId : undefined,
        folderId: Object.prototype.hasOwnProperty.call(subtype, 'folderId') ? subtype.folderId : undefined
    };
};

const serializeTaskSlaPolicy = (policy) => {
    if (!policy) return null;

    return {
        id: policy.id,
        name: policy.name,
        description: Object.prototype.hasOwnProperty.call(policy, 'description') ? policy.description : undefined,
        isActive: Object.prototype.hasOwnProperty.call(policy, 'isActive') ? policy.isActive : undefined,
        sortOrder: Object.prototype.hasOwnProperty.call(policy, 'sortOrder') ? policy.sortOrder : undefined,
        folderId: Object.prototype.hasOwnProperty.call(policy, 'folderId') ? policy.folderId : undefined,
        typeId: Object.prototype.hasOwnProperty.call(policy, 'typeId') ? policy.typeId : undefined,
        subtypeId: Object.prototype.hasOwnProperty.call(policy, 'subtypeId') ? policy.subtypeId : undefined,
        priority: Object.prototype.hasOwnProperty.call(policy, 'priority') ? policy.priority : undefined,
        firstResponseMinutes: Object.prototype.hasOwnProperty.call(policy, 'firstResponseMinutes')
            ? policy.firstResponseMinutes
            : undefined,
        resolutionMinutes: Object.prototype.hasOwnProperty.call(policy, 'resolutionMinutes')
            ? policy.resolutionMinutes
            : undefined,
        createdAt: Object.prototype.hasOwnProperty.call(policy, 'createdAt') ? toIsoString(policy.createdAt) : undefined,
        updatedAt: Object.prototype.hasOwnProperty.call(policy, 'updatedAt') ? toIsoString(policy.updatedAt) : undefined
    };
};

const serializeTaskSla = (task) => {
    if (!task) return undefined;

    const firstResponseDueAt = Object.prototype.hasOwnProperty.call(task, 'firstResponseDueAt')
        ? task.firstResponseDueAt
        : undefined;
    const resolutionDueAt = Object.prototype.hasOwnProperty.call(task, 'resolutionDueAt')
        ? task.resolutionDueAt
        : undefined;
    const firstResponseAt = Object.prototype.hasOwnProperty.call(task, 'firstResponseAt')
        ? task.firstResponseAt
        : undefined;
    const resolvedAt = Object.prototype.hasOwnProperty.call(task, 'resolvedAt')
        ? task.resolvedAt
        : undefined;

    if (
        firstResponseDueAt === undefined
        && resolutionDueAt === undefined
        && firstResponseAt === undefined
        && resolvedAt === undefined
        && !Object.prototype.hasOwnProperty.call(task, 'slaPolicy')
    ) {
        return undefined;
    }

    return {
        policy: Object.prototype.hasOwnProperty.call(task, 'slaPolicy')
            ? serializeTaskSlaPolicy(task.slaPolicy)
            : null,
        firstResponseDueAt: toIsoString(firstResponseDueAt),
        resolutionDueAt: toIsoString(resolutionDueAt),
        firstResponseAt: toIsoString(firstResponseAt),
        resolvedAt: toIsoString(resolvedAt),
        firstResponseStatus: deriveSlaTimerStatus({
            dueAt: firstResponseDueAt,
            actualAt: firstResponseAt
        }),
        resolutionStatus: deriveSlaTimerStatus({
            dueAt: resolutionDueAt,
            actualAt: resolvedAt
        })
    };
};

const serializeTaskBrief = (task, overrides = {}) => {
    if (!task) return null;
    const presentation = resolveTaskPresentation(task, overrides);

    return {
        id: presentation.id,
        ticketNumber: Object.prototype.hasOwnProperty.call(presentation, 'ticketNumber') ? presentation.ticketNumber : undefined,
        displayNumber: formatTaskDisplayNumber(presentation.ticketNumber),
        title: presentation.title,
        description: presentation.description,
        status: presentation.status,
        priority: presentation.priority,
        folderId: Object.prototype.hasOwnProperty.call(presentation, 'folderId') ? presentation.folderId : undefined,
        entityId: Object.prototype.hasOwnProperty.call(presentation, 'entityId') ? presentation.entityId : undefined,
        typeId: Object.prototype.hasOwnProperty.call(presentation, 'typeId') ? presentation.typeId : undefined,
        subtypeId: Object.prototype.hasOwnProperty.call(presentation, 'subtypeId') ? presentation.subtypeId : undefined,
        authorId: presentation.authorId,
        requesterCloseRequired: Object.prototype.hasOwnProperty.call(presentation, 'requesterCloseRequired') ? presentation.requesterCloseRequired : undefined,
        requesterCloseApprovedAt: Object.prototype.hasOwnProperty.call(presentation, 'requesterCloseApprovedAt') ? toIsoString(presentation.requesterCloseApprovedAt) : undefined,
        requesterCloseApprovedById: Object.prototype.hasOwnProperty.call(presentation, 'requesterCloseApprovedById') ? presentation.requesterCloseApprovedById : undefined,
        createdAt: toIsoString(presentation.createdAt),
        updatedAt: toIsoString(presentation.updatedAt)
    };
};

const serializeMergeUser = (user) => {
    if (!user) return null;
    return {
        id: user.id,
        name: user.name,
        role: user.role
    };
};

const serializeMergeRecord = (record) => {
    if (!record) return null;

    return {
        id: record.id,
        masterTaskId: record.masterTaskId,
        childTaskId: record.childTaskId,
        mergeMode: record.mergeMode,
        mergedBy: record.mergedBy,
        mergedAt: toIsoString(record.mergedAt),
        reason: record.reason ?? null,
        masterTask: serializeTaskBrief(record.masterTask),
        childTask: serializeTaskBrief(record.childTask, getUnionChildPresentationOverrides(record)),
        mergedByUser: serializeMergeUser(record.mergedByUser)
    };
};

const serializeCloseApproval = (approval) => {
    if (!approval) return null;

    return {
        id: approval.id,
        taskId: approval.taskId,
        userId: approval.userId,
        approvedAt: toIsoString(approval.approvedAt),
        user: serializeMergeUser(approval.user)
    };
};

const serializeTaskMergeInfo = (mergeInfo) => {
    if (!mergeInfo) return undefined;

    return {
        masterTaskId: mergeInfo.masterTaskId,
        masterTask: mergeInfo.masterTask ? serializeTaskBrief(mergeInfo.masterTask) : null,
        isMaster: Boolean(mergeInfo.isMaster),
        isChild: Boolean(mergeInfo.isChild),
        childTasks: Array.isArray(mergeInfo.childTasks) ? mergeInfo.childTasks.map((item) => serializeTaskBrief(item)) : [],
        linkedTasks: Array.isArray(mergeInfo.linkedTasks) ? mergeInfo.linkedTasks.map(serializeMergeRecord) : [],
        mergedTasks: Array.isArray(mergeInfo.mergedTasks) ? mergeInfo.mergedTasks.map(serializeMergeRecord) : [],
        parentLinks: Array.isArray(mergeInfo.parentLinks) ? mergeInfo.parentLinks.map(serializeMergeRecord) : [],
        closeApproval: mergeInfo.closeApproval
            ? {
                required: Boolean(mergeInfo.closeApproval.required),
                assigneeIds: Array.isArray(mergeInfo.closeApproval.assigneeIds) ? mergeInfo.closeApproval.assigneeIds : [],
                approvedAssigneeIds: Array.isArray(mergeInfo.closeApproval.approvedAssigneeIds) ? mergeInfo.closeApproval.approvedAssigneeIds : [],
                pendingAssigneeIds: Array.isArray(mergeInfo.closeApproval.pendingAssigneeIds) ? mergeInfo.closeApproval.pendingAssigneeIds : [],
                approvals: Array.isArray(mergeInfo.closeApproval.approvals)
                    ? mergeInfo.closeApproval.approvals.map(serializeCloseApproval)
                    : []
            }
            : undefined
    };
};

const serializeTaskBase = (task, overrides = {}) => {
    const presentation = resolveTaskPresentation(task, overrides);

    return {
        id: presentation.id,
        ticketNumber: presentation.ticketNumber,
        displayNumber: formatTaskDisplayNumber(presentation.ticketNumber),
        title: presentation.title,
        description: presentation.description,
        status: presentation.status,
        priority: presentation.priority,
        startDate: toIsoString(presentation.startDate),
        dueDate: toIsoString(presentation.dueDate),
        progress: presentation.progress,
        departmentId: Object.prototype.hasOwnProperty.call(presentation, 'departmentId') ? presentation.departmentId : undefined,
        teamId: Object.prototype.hasOwnProperty.call(presentation, 'teamId') ? presentation.teamId : undefined,
        folderId: Object.prototype.hasOwnProperty.call(presentation, 'folderId') ? presentation.folderId : undefined,
        entityId: Object.prototype.hasOwnProperty.call(presentation, 'entityId') ? presentation.entityId : undefined,
        typeId: Object.prototype.hasOwnProperty.call(presentation, 'typeId') ? presentation.typeId : undefined,
        subtypeId: Object.prototype.hasOwnProperty.call(presentation, 'subtypeId') ? presentation.subtypeId : undefined,
        authorId: presentation.authorId,
        createdAt: toIsoString(presentation.createdAt),
        updatedAt: toIsoString(presentation.updatedAt)
    };
};

const serializeTaskSummary = (task, overrides = {}) => {
    const summary = {
        ...serializeTaskBase(task, overrides)
    };

    if (Object.prototype.hasOwnProperty.call(task, 'externalReferences')) {
        const references = Array.isArray(task.externalReferences) ? task.externalReferences : [];
        const primaryReference = references.find((reference) => reference.system === 'FRESHDESK') || references[0] || null;
        summary.externalId = primaryReference?.externalId || null;
        summary.externalNumber = primaryReference?.externalNumber || null;
    }

    if (Object.prototype.hasOwnProperty.call(task, 'sourceChannel') || Object.prototype.hasOwnProperty.call(task, 'emailInboundMessages')) {
        const channel = task.sourceChannel === 'EMAIL' ||
            (Array.isArray(task.emailInboundMessages) && task.emailInboundMessages.length > 0)
            ? 'EMAIL'
            : 'WEB';
        summary.channel = channel;
        summary.sourceChannel = channel;
    }

    if (Object.prototype.hasOwnProperty.call(task, 'author')) {
        summary.author = serializeTaskAuthor(task.author);
    }

    if (Object.prototype.hasOwnProperty.call(task, 'department')) {
        summary.department = serializeTaskDepartment(task.department);
    }

    if (Object.prototype.hasOwnProperty.call(task, 'team')) {
        summary.team = task.team
            ? {
                id: task.team.id,
                name: task.team.name,
                description: task.team.description ?? null,
                isActive: task.team.isActive
            }
            : null;
    }

    if (Object.prototype.hasOwnProperty.call(task, 'folder')) {
        summary.folder = serializeTaskFolder(task.folder);
    }

    if (Object.prototype.hasOwnProperty.call(task, 'entity')) {
        summary.entity = serializeTaskEntity(task.entity);
    }

    if (Object.prototype.hasOwnProperty.call(task, 'type')) {
        summary.type = serializeTaskType(task.type);
    }

    if (Object.prototype.hasOwnProperty.call(task, 'subtype')) {
        summary.subtype = serializeTaskSubtype(task.subtype);
    }

    if (Object.prototype.hasOwnProperty.call(task, 'assignees')) {
        summary.assignees = Array.isArray(task.assignees)
            ? task.assignees.map(serializeTaskAssignee)
            : [];
    }

    if (Object.prototype.hasOwnProperty.call(task, '_count')) {
        summary._count = task._count
            ? {
                comments: task._count.comments,
                assignees: task._count.assignees
            }
            : undefined;
    }

    const sla = serializeTaskSla(task);
    if (sla !== undefined) {
        summary.sla = sla;
    }

    return summary;
};

const serializeTaskDetail = (task) => {
    const presentationOverrides = getUnionDetailPresentationOverrides(task);
    const detail = {
        ...serializeTaskSummary(task, presentationOverrides)
    };

    if (Object.prototype.hasOwnProperty.call(task, 'comments')) {
        detail.comments = Array.isArray(task.comments)
            ? task.comments.map(serializeTaskComment)
            : [];
    }

    if (Object.prototype.hasOwnProperty.call(task, 'attachments')) {
        detail.attachments = Array.isArray(task.attachments)
            ? task.attachments.map(serializeTaskAttachment)
            : [];
    }

    if (Object.prototype.hasOwnProperty.call(task, 'reviews')) {
        detail.latestReview = Array.isArray(task.reviews) && task.reviews.length > 0
            ? serializeTaskLatestReview(task.reviews[0])
            : null;
    }

    if (Object.prototype.hasOwnProperty.call(task, 'mergeInfo')) {
        detail.mergeInfo = serializeTaskMergeInfo(task.mergeInfo);
    }

    return detail;
};

const serializeTasksListResponse = (result) => ({
    tasks: Array.isArray(result.tasks) ? result.tasks.map(serializeTaskSummary) : [],
    total: result.total,
    limit: result.limit,
    offset: result.offset
});

module.exports = {
    serializeTaskAuthor,
    serializeTaskAssigneeUser,
    serializeTaskAssignee,
    serializeTaskCommentAuthor,
    serializeTaskComment,
    serializeTaskAttachment,
    serializeTaskDepartment,
    serializeTaskFolder,
    serializeTaskEntity,
    serializeTaskType,
    serializeTaskSubtype,
    serializeTaskSlaPolicy,
    serializeTaskBrief,
    serializeTaskMergeInfo,
    serializeTaskBase,
    serializeTaskSummary,
    serializeTaskDetail,
    serializeTasksListResponse
};
