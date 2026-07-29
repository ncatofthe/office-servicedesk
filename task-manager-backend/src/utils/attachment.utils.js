const path = require('path');

const ATTACHMENT_STORAGE_PREFIX = '/uploads';

const buildAttachmentDownloadPath = (attachmentId) => `/api/files/${attachmentId}/download`;

const buildStoredAttachmentPath = (storedFilename) => {
    const filename = path.basename(storedFilename || '');
    return `${ATTACHMENT_STORAGE_PREFIX}/${filename}`;
};

const resolveStoredAttachmentFilename = (storedPath) => {
    const normalizedPath = String(storedPath || '').replace(/\\/g, '/');
    return path.basename(normalizedPath);
};

const mapAttachmentToDownloadPath = (attachment) => ({
    ...attachment,
    path: buildAttachmentDownloadPath(attachment.id)
});

module.exports = {
    ATTACHMENT_STORAGE_PREFIX,
    buildAttachmentDownloadPath,
    buildStoredAttachmentPath,
    resolveStoredAttachmentFilename,
    mapAttachmentToDownloadPath
};
