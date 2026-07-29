const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadsDir = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(__dirname, '..', '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const maxUploadSizeMb = Number(process.env.MAX_UPLOAD_SIZE_MB || 50);
const allowedMimeTypes = (process.env.ALLOWED_UPLOAD_MIME_TYPES ||
    'image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/csv,application/json,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip,application/x-zip-compressed,application/vnd.rar,application/x-rar-compressed,application/x-7z-compressed')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const safeExt = path.extname(file.originalname || '').toLowerCase();
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
    }
});

const fileFilter = (req, file, cb) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(new Error('Unsupported file type'));
    }
    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: maxUploadSizeMb * 1024 * 1024
    }
});

module.exports = {
    upload,
    uploadsDir
};
