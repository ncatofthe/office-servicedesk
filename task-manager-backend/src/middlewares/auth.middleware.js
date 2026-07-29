const jwt = require('jsonwebtoken');
const prisma = require('../prisma/prisma.js');
const { USER_PUBLIC_SELECT } = require('../utils/user.select.js');

const authMiddleware = async(req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const token = authHeader.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: USER_PUBLIC_SELECT
        });

        if (!user || user.isActive === false) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const tokenVersion = Number.isInteger(decoded.tokenVersion) ? decoded.tokenVersion : 0;
        if (tokenVersion !== user.tokenVersion) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

module.exports = authMiddleware;
