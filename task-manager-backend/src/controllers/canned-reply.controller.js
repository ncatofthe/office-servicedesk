const cannedReplyService = require('../services/canned-reply.service.js');
const { serializeCannedReply } = require('../serializers/canned-reply.serializer.js');

const handleCannedReplyError = (error, res) => {
    if (error.message === 'Access denied' || error.message === 'Нет доступа к изменению этого шаблона.') {
        return res.status(403).json({ error: error.message });
    }

    if (error.message === 'Шаблон ответа не найден.') {
        return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message || 'Ошибка шаблонов ответов.' });
};

const normalizeListFilters = (query = {}) => {
    const normalized = { ...query };

    if (Object.prototype.hasOwnProperty.call(normalized, 'isActive')) {
        normalized.isActive = normalized.isActive === 'true' || normalized.isActive === true;
    }

    return normalized;
};

const listCannedReplies = async(req, res) => {
    try {
        const replies = await cannedReplyService.listCannedReplies(req.user, normalizeListFilters(req.query || {}));
        res.json(replies.map(serializeCannedReply));
    } catch (error) {
        handleCannedReplyError(error, res);
    }
};

const getCannedReply = async(req, res) => {
    try {
        const reply = await cannedReplyService.getCannedReply(req.params.id, req.user);
        res.json(serializeCannedReply(reply));
    } catch (error) {
        handleCannedReplyError(error, res);
    }
};

const createCannedReply = async(req, res) => {
    try {
        const reply = await cannedReplyService.createCannedReply(req.body || {}, req.user);
        res.status(201).json(serializeCannedReply(reply));
    } catch (error) {
        handleCannedReplyError(error, res);
    }
};

const updateCannedReply = async(req, res) => {
    try {
        const reply = await cannedReplyService.updateCannedReply(req.params.id, req.body || {}, req.user);
        res.json(serializeCannedReply(reply));
    } catch (error) {
        handleCannedReplyError(error, res);
    }
};

const deleteCannedReply = async(req, res) => {
    try {
        const result = await cannedReplyService.deleteCannedReply(req.params.id, req.user);
        res.json(result);
    } catch (error) {
        handleCannedReplyError(error, res);
    }
};

module.exports = {
    listCannedReplies,
    getCannedReply,
    createCannedReply,
    updateCannedReply,
    deleteCannedReply
};
