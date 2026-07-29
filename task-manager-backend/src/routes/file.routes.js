const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware.js');
const { upload } = require('../middlewares/upload.middleware.js');
const {
    uploadFile,
    uploadTaskFile,
    getTaskFiles,
    deleteTaskFile,
    downloadTaskFile,
    downloadRawUpload
} = require('../controllers/file.controller.js');

// Legacy generic upload is intentionally disabled to avoid orphaned files.
router.post('/upload', authMiddleware, uploadFile);
router.get('/files/raw/:filename', authMiddleware, downloadRawUpload);

// Task files - POST /api/files/:taskId (upload), GET /api/files/:taskId (list)
// Keep explicit /files prefix to avoid route collisions with other /api endpoints.
router.get('/files/:id/download', authMiddleware, downloadTaskFile);
router.post('/files/:taskId', authMiddleware, upload.single('file'), uploadTaskFile);
router.get('/files/:taskId', authMiddleware, getTaskFiles);
router.delete('/files/:id', authMiddleware, deleteTaskFile);

module.exports = router;
