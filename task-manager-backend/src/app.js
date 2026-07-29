const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const prisma = require('./prisma/prisma.js');
const auditMiddleware = require('./middlewares/audit.middleware.js');
const { globalRateLimit } = require('./middlewares/rate-limit.middleware.js');
const { isOriginAllowed, resolveAllowedOrigins } = require('./utils/cors.js');

const app = express();
const trustProxy = process.env.TRUST_PROXY || 'loopback';
if (trustProxy !== 'false') {
    app.set('trust proxy', trustProxy === 'true' ? true : trustProxy);
}
const allowedOrigins = resolveAllowedOrigins();

const corsOptions = {
    origin(origin, callback) {
        if (isOriginAllowed(origin, allowedOrigins)) {
            callback(null, true);
            return;
        }
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

// Middlewares
app.use(helmet());
app.use(cors(corsOptions));
app.use(morgan('combined'));
app.use(globalRateLimit);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(auditMiddleware);

// Routes
const authRoutes = require('./routes/auth.routes.js');
const userRoutes = require('./routes/user.routes.js');
const taskRoutes = require('./routes/task.routes.js');
const commentRoutes = require('./routes/comment.routes.js');
const fileRoutes = require('./routes/file.routes.js');
const departmentRoutes = require('./routes/department.routes.js');
const notificationRoutes = require('./routes/notification.routes.js');
const dashboardRoutes = require('./routes/dashboard.routes.js');
const reportsRoutes = require('./routes/reports.routes.js');
const servicedeskRoutes = require('./routes/servicedesk.routes.js');
const knowledgeRoutes = require('./routes/knowledge.routes.js');
const cannedReplyRoutes = require('./routes/canned-reply.routes.js');
const chatRoutes = require('./routes/chat.routes.js');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api', commentRoutes);
app.use('/api', fileRoutes);
app.use('/api', departmentRoutes);
app.use('/api', notificationRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', reportsRoutes);
app.use('/api', servicedeskRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api', cannedReplyRoutes);
app.use('/api/chats', chatRoutes);

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err.stack);

    if (err.message === 'Unsupported file type') {
        return res.status(400).json({ error: true, message: err.message });
    }
    if (err.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: true, message: 'File is too large' });
    }
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({ error: true, message: err.message });
    }

    res.status(err.status || 500).json({
        error: true,
        message: err.message || 'Internal Server Error'
    });
});

// Health check
app.get('/health', async(req, res) => {
    try {
        await prisma.$connect();
        res.status(200).json({ status: 'OK', message: 'Server and DB connected' });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
});

module.exports = app;
