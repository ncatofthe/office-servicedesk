const {
    serializeAuthUser,
    serializeCurrentUser
} = require('./auth.serializer.js');

const serializeUserProfile = (user) => serializeCurrentUser(user);

const serializeTeamUser = (user) => {
    if (!user) return null;

    const doneTasks = Number(user.doneTasks ?? 0);
    const inProgressTasks = Number(user.inProgressTasks ?? 0);
    const totalHours = Number(user.totalHours ?? (doneTasks * 8 + inProgressTasks * 4));

    return {
        ...serializeCurrentUser(user),
        doneTasks,
        inProgressTasks,
        totalHours
    };
};

const serializeTeamUsers = (users) => Array.isArray(users)
    ? users.map(serializeTeamUser)
    : [];

const serializeUpdateUserProfileResponse = (user) => ({
    message: 'Profile updated successfully',
    user: serializeAuthUser(user)
});

const serializeManagedUser = (user) => {
    if (!user) return null;

    const currentUser = serializeCurrentUser(user);
    return {
        ...serializeAuthUser(user),
        createdAt: currentUser.createdAt,
        updatedAt: currentUser.updatedAt
    };
};

const serializeUpdateUserRoleResponse = (user) => ({
    message: 'Role updated successfully',
    user: serializeManagedUser(user)
});

module.exports = {
    serializeUserProfile,
    serializeTeamUser,
    serializeTeamUsers,
    serializeUpdateUserProfileResponse,
    serializeManagedUser,
    serializeUpdateUserRoleResponse
};
