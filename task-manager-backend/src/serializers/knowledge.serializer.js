const serializeKnowledgeUser = (user) => {
    if (!user) return null;

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
    };
};

const serializeKnowledgeArticle = (article) => {
    if (!article) return null;

    return {
        id: article.id,
        title: article.title,
        slug: article.slug,
        body: article.body,
        category: article.category,
        isPublished: article.isPublished,
        createdById: article.createdById,
        updatedById: article.updatedById,
        createdBy: serializeKnowledgeUser(article.createdBy),
        updatedBy: serializeKnowledgeUser(article.updatedBy),
        createdAt: article.createdAt,
        updatedAt: article.updatedAt
    };
};

const serializeKnowledgeArticleList = (articles) => articles.map(serializeKnowledgeArticle);

module.exports = {
    serializeKnowledgeArticle,
    serializeKnowledgeArticleList
};
