const commentService = require('../services/comment.service.js');
const taskService = require('../services/task.service.js');

const getTaskComments = async(req, res) => {
    try {
        // Check task access in taskService if needed
        await taskService.getById(req.params.taskId, req.user); // throws if no access
        const comments = await commentService.getByTask(req.params.taskId, req.user);
        res.json(comments);
    } catch (error) {
        if (error.message === 'Task not found' || error.message === 'Access denied') {
            return res.status(404).json({ error: error.message });
        }
        res.status(400).json({ error: error.message });
    }
};

const createComment = async(req, res) => {
    try {
        await taskService.getById(req.params.taskId, req.user); // access check
        const comment = await commentService.create({
            content: req.body.content,
            taskId: req.params.taskId,
            visibility: req.body.visibility,
            type: req.body.type
        }, req.user);
        res.status(201).json(comment);
    } catch (error) {
        if (error.message === 'Только исполнители и заявители могут создавать комментарии.'
            || error.message === 'Заявитель может создавать только публичные комментарии.') {
            return res.status(403).json({ error: error.message });
        }
        res.status(400).json({ error: error.message });
    }
};

const deleteComment = async(req, res) => {
    try {
        const comment = await commentService.deleteComment(req.params.id, req.user.id, req.user.role);
        res.json({ message: 'Comment deleted' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const updateComment = async(req, res) => {
    try {
        const { content } = req.body;
        const comment = await commentService.updateComment(req.params.id, content, req.user.id);
        res.json(comment);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

module.exports = {
    getTaskComments,
    createComment,
    updateComment,
    deleteComment
};
