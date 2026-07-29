const { serializeTaskSummary } = require('./task.serializer.js');

const toIsoString = (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const serializeReviewEmployee = (user) => {
    if (!user) return undefined;

    return {
        id: user.id,
        name: user.name,
        role: user.role
    };
};

const serializeReviewListItem = (review) => ({
    id: review.id,
    reviewId: review.reviewId,
    title: review.title,
    employee: serializeReviewEmployee(review.employee),
    role: review.role,
    date: toIsoString(review.date),
    status: review.status,
    amount: review.amount ?? null,
    comment: review.comment ?? null
});

const serializeReviewList = (reviews) => Array.isArray(reviews)
    ? reviews.map(serializeReviewListItem)
    : [];

const serializeTaskReview = (review) => ({
    id: review.id,
    status: review.status,
    amount: review.amount ?? null,
    comment: review.comment ?? null,
    taskId: review.taskId,
    reviewerId: review.reviewerId ?? null,
    reviewer: serializeReviewEmployee(review.reviewer),
    createdAt: toIsoString(review.createdAt)
});

const serializeReviewUpdateResponse = (review) => {
    const serializedReview = serializeTaskReview(review);

    // Keep the nested task as a backward-compatible superset while the
    // stable transport contract remains the root review payload.
    if (review.task) {
        serializedReview.task = {
            ...review.task,
            ...serializeTaskSummary(review.task)
        };
    }

    return serializedReview;
};

module.exports = {
    serializeReviewEmployee,
    serializeReviewListItem,
    serializeReviewList,
    serializeTaskReview,
    serializeReviewUpdateResponse
};
