const SLA_TIMER_STATUSES = ['PENDING', 'MET', 'BREACHED'];

const toDateOrNull = (value) => {
    if (!value) {
        return null;
    }

    return value instanceof Date ? value : new Date(value);
};

const addMinutes = (baseDate, minutes) => {
    const date = toDateOrNull(baseDate);
    if (!date || minutes === null || minutes === undefined) {
        return null;
    }

    return new Date(date.getTime() + Number(minutes) * 60 * 1000);
};

const isSameOrBefore = (left, right) => {
    const leftDate = toDateOrNull(left);
    const rightDate = toDateOrNull(right);
    if (!leftDate || !rightDate) {
        return false;
    }

    return leftDate.getTime() <= rightDate.getTime();
};

const matchesSlaPolicy = (policy, taskLike = {}) => {
    if (!policy || policy.isActive === false) {
        return false;
    }

    return [['folderId', 'folderId'], ['typeId', 'typeId'], ['subtypeId', 'subtypeId'], ['priority', 'priority']]
        .every(([policyField, taskField]) => policy[policyField] === null
            || policy[policyField] === undefined
            || policy[policyField] === taskLike[taskField]);
};

const pickMatchingSlaPolicy = (policies, taskLike = {}) => {
    if (!Array.isArray(policies)) {
        return null;
    }

    return policies.find((policy) => matchesSlaPolicy(policy, taskLike)) || null;
};

const deriveSlaTimerStatus = ({ dueAt, actualAt, now = new Date() }) => {
    const dueDate = toDateOrNull(dueAt);
    if (!dueDate) {
        return null;
    }

    const actualDate = toDateOrNull(actualAt);
    if (actualDate) {
        return isSameOrBefore(actualDate, dueDate) ? 'MET' : 'BREACHED';
    }

    return now.getTime() > dueDate.getTime() ? 'BREACHED' : 'PENDING';
};

const buildSlaFields = ({ policy, createdAt, firstResponseAt = null, resolvedAt = null, now = new Date() }) => {
    const firstResponseDueAt = policy?.firstResponseMinutes !== null && policy?.firstResponseMinutes !== undefined
        ? addMinutes(createdAt, policy.firstResponseMinutes)
        : null;
    const resolutionDueAt = policy?.resolutionMinutes !== null && policy?.resolutionMinutes !== undefined
        ? addMinutes(createdAt, policy.resolutionMinutes)
        : null;

    return {
        slaPolicyId: policy?.id ?? null,
        firstResponseDueAt,
        resolutionDueAt,
        firstResponseAt: toDateOrNull(firstResponseAt),
        resolvedAt: toDateOrNull(resolvedAt),
        slaFirstResponseStatus: deriveSlaTimerStatus({
            dueAt: firstResponseDueAt,
            actualAt: firstResponseAt,
            now
        }),
        slaResolutionStatus: deriveSlaTimerStatus({
            dueAt: resolutionDueAt,
            actualAt: resolvedAt,
            now
        })
    };
};

module.exports = {
    SLA_TIMER_STATUSES,
    addMinutes,
    buildSlaFields,
    deriveSlaTimerStatus,
    matchesSlaPolicy,
    pickMatchingSlaPolicy,
    toDateOrNull
};
