const serializeDate = (value) => {
    if (!value) return value === null ? null : undefined;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const serializeCannedReply = (reply) => {
    if (!reply) return null;

    return {
        id: reply.id,
        title: reply.title,
        body: reply.body,
        category: reply.category ?? null,
        isActive: reply.isActive,
        visibility: reply.visibility,
        authorId: reply.authorId,
        author: reply.author
            ? {
                id: reply.author.id,
                name: reply.author.name,
                email: reply.author.email,
                role: reply.author.role
            }
            : undefined,
        createdAt: serializeDate(reply.createdAt),
        updatedAt: serializeDate(reply.updatedAt)
    };
};

module.exports = {
    serializeCannedReply
};
