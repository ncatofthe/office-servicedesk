const prisma = require('../prisma/prisma.js');
const { isAdminRole, isAgentRole, isRequesterRole, isViewerRole } = require('./roles.js');

const getAgentAccessibleFolderIds = async(userId, db = prisma) => {
    const memberships = await db.supportTeamMember.findMany({
        where: {
            userId,
            team: {
                isActive: true
            }
        },
        select: {
            team: {
                select: {
                    folderId: true,
                    folder: {
                        select: {
                            id: true,
                            isActive: true
                        }
                    },
                    folderAccesses: {
                        where: {
                            folder: {
                                isActive: true
                            }
                        },
                        select: {
                            folderId: true
                        }
                    }
                }
            }
        }
    });

    const folderIds = memberships.flatMap((membership) => {
        const accessIds = membership.team.folderAccesses.map((access) => access.folderId);
        const legacyFolderId = membership.team.folder?.isActive && membership.team.folderId
            ? [membership.team.folderId]
            : [];

        return [...legacyFolderId, ...accessIds];
    });

    return [...new Set(folderIds)];
};

const buildAgentTaskAccessWhere = (userId, accessibleFolderIds) => {
    const folderScope = accessibleFolderIds.length > 0
        ? [{ folderId: { in: accessibleFolderIds } }]
        : [];

    return {
        OR: [
            ...folderScope,
            // Web-created tickets may intentionally have only title/description.
            // Until an admin/agent routes them into a folder, every agent should
            // see them in the unprocessed pool instead of letting them disappear.
            { folderId: null },
            { assignees: { some: { userId } } }
        ]
    };
};

const getTaskAccessContext = async(user, db = prisma) => {
    const role = user?.role;
    const isAdmin = isAdminRole(role);
    const isAgent = isAgentRole(role);
    const isRequester = isRequesterRole(role);
    const isViewer = isViewerRole(role);
    const accessibleFolderIds = isAgent ? await getAgentAccessibleFolderIds(user.id, db) : [];

    return {
        isAdmin,
        isAgent,
        isRequester,
        isViewer,
        accessibleFolderIds
    };
};

const hasAgentFolderAccess = (taskOrFolderId, accessibleFolderIds) => {
    const folderId = typeof taskOrFolderId === 'string'
        ? taskOrFolderId
        : taskOrFolderId?.folderId;

    return Boolean(folderId && accessibleFolderIds.includes(folderId));
};

const hasTaskAccess = (task, user, context) => {
    if (!task) return false;
    if (context.isAdmin || context.isViewer) return true;
    if (context.isRequester) return task.authorId === user.id;
    if (context.isAgent) {
        return !task.folderId
            || hasAgentFolderAccess(task, context.accessibleFolderIds)
            || task.assignees.some((assignee) => assignee.userId === user.id);
    }

    return false;
};

module.exports = {
    getAgentAccessibleFolderIds,
    buildAgentTaskAccessWhere,
    getTaskAccessContext,
    hasAgentFolderAccess,
    hasTaskAccess
};
