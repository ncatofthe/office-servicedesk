const bcrypt = require('bcryptjs');
const request = require('supertest');
const { normalizeRole } = require('../src/utils/roles.js');

const createTestUser = async(prisma, { email, password, name, role }) => {
    const hashedPassword = await bcrypt.hash(password, 12);

    return prisma.user.create({
        data: {
            email,
            password: hashedPassword,
            name,
            role: normalizeRole(role)
        }
    });
};

const loginUser = async(app, { email, password }) => {
    return request(app)
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);
};

module.exports = {
    createTestUser,
    loginUser
};
