const prisma = require('../prisma/prisma.js');
const fs = require('fs');
const path = require('path');
const taskService = require('../services/task.service.js');
const { uploadsDir } = require('../middlewares/upload.middleware.js');
const {
    buildStoredAttachmentPath,
    mapAttachmentToDownloadPath,
    resolveStoredAttachmentFilename
} = require('../utils/attachment.utils.js');

const resolveUploadPath = (storedPath) => {
    const filename = resolveStoredAttachmentFilename(storedPath);
    const absolutePath = filename ? path.join(uploadsDir, filename) : null;
    return { filename, absolutePath };
};

const deleteStoredFileIfPresent = (storedPath) => {
    const { absolutePath } = resolveUploadPath(storedPath);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
        return;
    }

    try {
        fs.unlinkSync(absolutePath);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn('[uploads] Failed to delete attachment file', { storedPath, absolutePath, error: error.message });
        }
    }
};

const uploadFile = async(req, res) => {
    res.status(410).json({
        error: 'Legacy upload endpoint is disabled. Upload files through /api/files/:taskId'
    });
};

const uploadTaskFile = async(req, res) => {
    try {
        const { taskId } = req.params;
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Check task access
        await taskService.getById(taskId, req.user);

        const filePath = buildStoredAttachmentPath(req.file.filename);
        const attachment = await taskService.createAttachment(taskId, req.file.originalname, filePath, req.user);

        res.status(201).json(mapAttachmentToDownloadPath(attachment));
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

const getTaskFiles = async(req, res) => {
    try {
        const { taskId } = req.params;
        await taskService.getById(taskId, req.user);
        const files = await prisma.taskAttachment.findMany({
            where: { taskId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(files.map(mapAttachmentToDownloadPath));
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

const deleteTaskFile = async(req, res) => {
    try {
        const { id } = req.params;
        const file = await prisma.taskAttachment.findUnique({ where: { id } });
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Only admin or uploader can delete
        if (req.user.role !== 'ADMIN' && file.uploadedById !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await taskService.getById(file.taskId, req.user);
        await taskService.deleteAttachment(id, req.user);

        deleteStoredFileIfPresent(file.path);

        res.json({ message: 'File deleted' });
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

const downloadTaskFile = async(req, res) => {
    try {
        const file = await prisma.taskAttachment.findUnique({
            where: { id: req.params.id }
        });

        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        await taskService.getById(file.taskId, req.user);

        const { filename, absolutePath } = resolveUploadPath(file.path);
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ error: 'File not found on disk' });
        }

        return res.download(absolutePath, file.filename || filename);
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

const downloadRawUpload = async(req, res) => {
    try {
        const filename = path.basename(req.params.filename || '');
        const attachment = await prisma.taskAttachment.findFirst({
            where: {
                OR: [
                    { path: { endsWith: `/${filename}` } },
                    { path: filename }
                ]
            }
        });

        if (!attachment) {
            return res.status(404).json({ error: 'File not found or not linked to a task' });
        }

        await taskService.getById(attachment.taskId, req.user);

        const { absolutePath } = resolveUploadPath(attachment.path);
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ error: 'File not found on disk' });
        }

        return res.download(absolutePath, attachment.filename || filename);
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

module.exports = {
    uploadFile,
    uploadTaskFile,
    getTaskFiles,
    deleteTaskFile,
    downloadTaskFile,
    downloadRawUpload
};
