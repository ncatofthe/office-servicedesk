const taskService = require('../services/task.service.js');
const emailOutboundService = require('../services/email-outbound.service.js');
const cannedReplyService = require('../services/canned-reply.service.js');
const timelineService = require('../services/timeline.service.js');
const {
    serializeTaskDetail,
    serializeTaskMergeInfo,
    serializeTaskSummary,
    serializeTasksListResponse
} = require('../serializers/task.serializer.js');

const normalizeServiceDeskAliases = (payload = {}) => {
    const normalized = { ...payload };

    if (!Object.prototype.hasOwnProperty.call(normalized, 'folderId')
        && Object.prototype.hasOwnProperty.call(normalized, 'serviceDeskFolderId')) {
        normalized.folderId = normalized.serviceDeskFolderId;
    }

    if (!Object.prototype.hasOwnProperty.call(normalized, 'typeId')
        && Object.prototype.hasOwnProperty.call(normalized, 'ticketTypeId')) {
        normalized.typeId = normalized.ticketTypeId;
    }

    if (!Object.prototype.hasOwnProperty.call(normalized, 'subtypeId')
        && Object.prototype.hasOwnProperty.call(normalized, 'ticketSubtypeId')) {
        normalized.subtypeId = normalized.ticketSubtypeId;
    }

    delete normalized.serviceDeskFolderId;
    delete normalized.ticketTypeId;
    delete normalized.ticketSubtypeId;

    return normalized;
};

const getAll = async(req, res) => {
    try {
        const { limit = 25, offset = 0, ...filters } = req.query;
        const result = await taskService.getAll(req.user, normalizeServiceDeskAliases(filters), limit, offset);
        res.json(serializeTasksListResponse(result));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const getById = async(req, res) => {
    try {
        const task = await taskService.getById(req.params.id, req.user);
        res.json(serializeTaskDetail(task));
    } catch (error) {
        if (error.message === 'Task not found') {
            return res.status(404).json({ error: 'Task not found' });
        }
        if (error.message === 'Access denied') {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.status(400).json({ error: error.message });
    }
};

const getTimeline = async(req, res) => {
    try {
        const events = await timelineService.listTaskTimeline(req.params.id, req.user);
        res.json(events);
    } catch (error) {
        if (error.message === 'Task not found') {
            return res.status(404).json({ error: 'Task not found' });
        }
        if (error.message === 'Access denied') {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.status(400).json({ error: error.message });
    }
};

const getEmailThread = async(req, res) => {
    try {
        const thread = await emailOutboundService.listTaskEmailThread(req.params.id, req.user);
        res.json(thread);
    } catch (error) {
        if (error.message === 'Task not found') {
            return res.status(404).json({ error: 'Заявка не найдена.' });
        }
        if (error.message === 'Access denied') {
            return res.status(403).json({ error: 'Нет доступа к email-истории этой заявки.' });
        }
        res.status(400).json({ error: error.message });
    }
};

const create = async(req, res) => {
    try {
        const task = await taskService.create(normalizeServiceDeskAliases(req.body), req.user, {
            automationTriggerType: 'TASK_CREATED',
            automationChannel: 'WEB',
            automationRequesterEmail: req.user?.email || null
        });
        res.status(201).json(serializeTaskSummary(task));
    } catch (error) {
        if (error.message === 'Access denied') {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.status(400).json({ error: error.message });
    }
};

const update = async(req, res) => {
    try {
        const task = await taskService.update(req.params.id, normalizeServiceDeskAliases(req.body), req.user);
        res.json(serializeTaskSummary(task));
    } catch (error) {
        if (error.message === 'Access denied') {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.status(400).json({ error: error.message });
    }
};

const deleteTask = async(req, res) => {
    try {
        await taskService.delete(req.params.id);
        res.status(200).json({ message: 'Task deleted' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const updateStatus = async(req, res) => {
    try {
        const { status } = req.body;
        const task = await taskService.updateStatus(req.params.id, status, req.user);
        res.json(serializeTaskSummary(task));
    } catch (error) {
        if (
            error.message === 'Access denied'
            || error.message === 'Viewers cannot change task status'
            || error.message === 'Requesters cannot change task status'
            || error.message === 'Not assigned to task and not author'
        ) {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.status(400).json({ error: error.message });
    }
};

const merge = async(req, res) => {
    try {
        const mergeInfo = await taskService.merge(req.params.id, req.body || {}, req.user);
        res.status(201).json(serializeTaskMergeInfo(mergeInfo));
    } catch (error) {
        if (error.message === 'Task not found') {
            return res.status(404).json({ error: 'Заявка не найдена.' });
        }
        if (error.message === 'Access denied') {
            return res.status(403).json({ error: 'Нет доступа к объединению этой заявки.' });
        }
        res.status(400).json({ error: error.message });
    }
};

const getMergeInfo = async(req, res) => {
    try {
        const mergeInfo = await taskService.getMergeInfo(req.params.id, req.user);
        res.json(serializeTaskMergeInfo(mergeInfo));
    } catch (error) {
        if (error.message === 'Task not found') {
            return res.status(404).json({ error: 'Заявка не найдена.' });
        }
        if (error.message === 'Access denied') {
            return res.status(403).json({ error: 'Нет доступа к информации об объединении.' });
        }
        res.status(400).json({ error: error.message });
    }
};

const approveClose = async(req, res) => {
    try {
        const result = await taskService.approveClose(req.params.id, req.user);
        res.json({
            task: serializeTaskSummary(result.task),
            mergeInfo: serializeTaskMergeInfo(result.mergeInfo),
            closed: result.closed
        });
    } catch (error) {
        if (error.message === 'Task not found') {
            return res.status(404).json({ error: 'Заявка не найдена.' });
        }
        if (error.message === 'Access denied') {
            return res.status(403).json({ error: 'Подтвердить закрытие может только назначенный исполнитель.' });
        }
        res.status(400).json({ error: error.message });
    }
};

const approveRequesterClose = async(req, res) => {
    try {
        const result = await taskService.approveRequesterClose(req.params.id, req.user);
        res.json({
            task: serializeTaskSummary(result.task),
            message: 'Заявитель подтвердил закрытие заявки.'
        });
    } catch (error) {
        if (error.message === 'Task not found') {
            return res.status(404).json({ error: 'Заявка не найдена.' });
        }
        if (error.message === 'Access denied') {
            return res.status(403).json({ error: 'Подтвердить закрытие может только заявитель или администратор.' });
        }
        res.status(400).json({ error: error.message });
    }
};

const emailReply = async(req, res) => {
    try {
        const result = await emailOutboundService.sendTaskEmailReply(req.params.id, req.body && req.body.message, req.user);
        res.json({
            taskId: result.taskId,
            dryRun: result.dryRun,
            recipient: result.recipient,
            subject: result.subject,
            outboxId: result.outboxId || null,
            outboxStatus: result.outboxStatus || null,
            commentId: result.commentId || null,
            sendError: result.sendError || null
        });
    } catch (error) {
        if (error.message === 'Task not found') {
            return res.status(404).json({ error: 'Заявка не найдена.' });
        }
        if (error.message === 'Access denied') {
            return res.status(403).json({ error: 'Нет доступа к email-ответу по этой заявке.' });
        }
        res.status(400).json({ error: error.message });
    }
};

const replyFromTemplate = async(req, res) => {
    try {
        const result = await cannedReplyService.applyTemplateToTask(req.params.id, req.body || {}, req.user);
        res.status(201).json(result);
    } catch (error) {
        if (error.message === 'Task not found' || error.message === 'Шаблон ответа не найден.') {
            return res.status(404).json({ error: error.message });
        }
        if (error.message === 'Access denied' || error.message === 'Нет доступа к изменению этого шаблона.') {
            return res.status(403).json({ error: 'Нет доступа к применению шаблона для этой заявки.' });
        }
        res.status(400).json({ error: error.message });
    }
};

const addAssignee = async(req, res) => {
    try {
        const { userId } = req.body;
        const assignee = await taskService.addAssignee(req.params.id, userId, req.user);
        res.status(201).json(assignee);
    } catch (error) {
        if (error.message === 'Access denied') {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.status(400).json({ error: error.message });
    }
};

const removeAssignee = async(req, res) => {
    try {
        await taskService.removeAssignee(req.params.id, req.params.userId, req.user);
        res.status(200).json({ message: 'Assignee removed' });
    } catch (error) {
        if (error.message === 'Access denied') {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.status(400).json({ error: error.message });
    }
};

const createAttachment = async(req, res) => {
    try {
        const { fileUrl, fileName } = req.body;
        const attachment = await taskService.createAttachment(req.params.taskId, fileName, fileUrl, req.user.id);
        res.status(201).json(attachment);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const deleteAttachment = async(req, res) => {
    try {
        await taskService.deleteAttachment(req.params.id);
        res.json({ message: 'Attachment deleted' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

module.exports = {
    getAll,
    getById,
    getTimeline,
    getEmailThread,
    create,
    update,
    delete: deleteTask,
    updateStatus,
    merge,
    getMergeInfo,
    approveClose,
    approveRequesterClose,
    emailReply,
    replyFromTemplate,
    addAssignee,
    removeAssignee,
    createAttachment,
    deleteAttachment
};
