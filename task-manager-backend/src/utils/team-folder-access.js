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

    const folderIds = memberships.flatMap(
        (membership) => membership.team.folderAccesses.map((access) => access.folderId)
    );

    return [...new Set(folderIds)];
};

const getAgentAccessibleTeamIds = async(userId, db = prisma) => {
    const memberships = await db.supportTeamMember.findMany({
        where: {
            userId,
            team: { isActive: true }
        },
        select: { teamId: true }
    });

    return memberships.map((membership) => membership.teamId);
};

const buildAgentTaskAccessWhere = (userId, accessibleFolderIds, accessibleTeamIds = []) => {
    const folderScope = accessibleFolderIds.length > 0
        ? [{ AND: [{ teamId: null }, { folderId: { in: accessibleFolderIds } }] }]
        : [];

    return {
        OR: [
            ...folderScope,
            ...(accessibleTeamIds.length > 0 ? [{ teamId: { in: accessibleTeamIds } }] : []),
            // Web-created tickets may intentionally have only title/description.
            // Until an admin/agent routes them into a folder, every agent should
            // see them in the unprocessed pool instead of letting them disappear.
            { AND: [{ teamId: null }, { folderId: null }] },
            { assignees: { some: { userId } } },
            { chatParticipants: { some: { userId } } }
        ]
    };
};

const getTaskAccessContext = async(user, db = prisma) => {
    const role = user?.role;
    const isAdmin = isAdminRole(role);
    const isAgent = isAgentRole(role);
    const isRequester = isRequesterRole(role);
    const isViewer = isViewerRole(role);
    const [accessibleFolderIds, accessibleTeamIds] = isAgent
        ? await Promise.all([
            getAgentAccessibleFolderIds(user.id, db),
            getAgentAccessibleTeamIds(user.id, db)
        ])
        : [[], []];

    return {
        isAdmin,
        isAgent,
        isRequester,
        isViewer,
        accessibleFolderIds,
        accessibleTeamIds
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
    const isChatParticipant = Array.isArray(task.chatParticipants)
        && task.chatParticipants.some((participant) => participant.userId === user.id);
    if (context.isRequester) return task.authorId === user.id || isChatParticipant;
    if (context.isAgent) {
        const hasTeamAccess = Boolean(task.teamId && context.accessibleTeamIds.includes(task.teamId));
        const hasQueueAccess = !task.teamId && (
            !task.folderId || hasAgentFolderAccess(task, context.accessibleFolderIds)
        );
        return hasTeamAccess
            || hasQueueAccess
            || task.assignees.some((assignee) => assignee.userId === user.id)
            || isChatParticipant;
    }

    return false;
};

module.exports = {
    getAgentAccessibleFolderIds,
    getAgentAccessibleTeamIds,
    buildAgentTaskAccessWhere,
    getTaskAccessContext,
    hasAgentFolderAccess,
    hasTaskAccess
};
