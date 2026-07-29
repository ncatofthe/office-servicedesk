const knowledgeService = require('../services/knowledge.service.js');
const {
    serializeKnowledgeArticle,
    serializeKnowledgeArticleList
} = require('../serializers/knowledge.serializer.js');

const sendKnowledgeError = (res, error) => {
    if (error.code === 'KNOWLEDGE_NOT_FOUND') {
        return res.status(404).json({ error: error.message });
    }
    if (error.code === 'KNOWLEDGE_INVALID') {
        return res.status(400).json({ error: error.message });
    }
    if (error.code === 'KNOWLEDGE_FORBIDDEN') {
        return res.status(403).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message });
};

const listArticles = async(req, res) => {
    try {
        const articles = await knowledgeService.listArticles(req.query, req.user);
        res.json(serializeKnowledgeArticleList(articles));
    } catch (error) {
        sendKnowledgeError(res, error);
    }
};

const getArticle = async(req, res) => {
    try {
        const article = await knowledgeService.getArticle(req.params.id, req.user);
        res.json(serializeKnowledgeArticle(article));
    } catch (error) {
        sendKnowledgeError(res, error);
    }
};

const createArticle = async(req, res) => {
    try {
        const article = await knowledgeService.createArticle(req.body || {}, req.user);
        res.status(201).json(serializeKnowledgeArticle(article));
    } catch (error) {
        sendKnowledgeError(res, error);
    }
};

const updateArticle = async(req, res) => {
    try {
        const article = await knowledgeService.updateArticle(req.params.id, req.body || {}, req.user);
        res.json(serializeKnowledgeArticle(article));
    } catch (error) {
        sendKnowledgeError(res, error);
    }
};

const deleteArticle = async(req, res) => {
    try {
        await knowledgeService.deleteArticle(req.params.id);
        res.json({ success: true });
    } catch (error) {
        sendKnowledgeError(res, error);
    }
};

module.exports = {
    listArticles,
    getArticle,
    createArticle,
    updateArticle,
    deleteArticle
};
