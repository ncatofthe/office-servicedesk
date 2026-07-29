const { normalizeDepartmentName } = require('./department-membership.js');

const MANAGER_DEPARTMENT_READINESS_SELECT = {
    id: true,
    name: true,
    email: true,
    role: true,
    department: true,
    departmentMemberships: {
        select: {
            departmentId: true,
            isPrimary: true,
            department: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                    isActive: true
                }
            }
        }
    },
    headedDepartments: {
        select: {
            id: true,
            name: true,
            code: true,
            isActive: true
        }
    }
};

const toDepartmentLookupKey = (value) => {
    const normalized = normalizeDepartmentName(value);
    return normalized ? normalized.toLowerCase() : null;
};

const mapDepartmentSummary = (department) => {
    if (!department) {
        return null;
    }

    return {
        id: department.id,
        name: department.name,
        code: Object.prototype.hasOwnProperty.call(department, 'code') ? department.code : null,
        isActive: Object.prototype.hasOwnProperty.call(department, 'isActive') ? department.isActive !== false : true
    };
};

const mapMembershipSummary = (membership) => {
    if (!membership || !membership.departmentId) {
        return null;
    }

    const department = mapDepartmentSummary(membership.department);
    return {
        departmentId: membership.departmentId,
        isPrimary: Boolean(membership.isPrimary),
        department
    };
};

const buildDepartmentLookup = (departments) => {
    const lookup = new Map();

    for (const department of departments || []) {
        const key = toDepartmentLookupKey(department && department.name);
        if (!key) {
            continue;
        }

        const bucket = lookup.get(key) || [];
        bucket.push(mapDepartmentSummary(department));
        lookup.set(key, bucket);
    }

    return lookup;
};

const buildSetPrimaryAutoFix = (department, source, createsMembership = false) => ({
    type: 'set_primary_membership',
    departmentId: department.id,
    departmentName: department.name,
    source,
    createsMembership
});

const evaluateManagerDepartmentReadiness = (manager, departmentLookup = new Map()) => {
    const legacyDepartment = normalizeDepartmentName(manager && manager.department);
    const legacyDepartmentKey = toDepartmentLookupKey(legacyDepartment);
    const matchedLegacyDepartments = legacyDepartmentKey ? (departmentLookup.get(legacyDepartmentKey) || []) : [];
    const activeLegacyDepartments = matchedLegacyDepartments.filter((department) => department.isActive);

    const memberships = Array.isArray(manager && manager.departmentMemberships)
        ? manager.departmentMemberships.map(mapMembershipSummary).filter(Boolean)
        : [];
    const headedDepartments = Array.isArray(manager && manager.headedDepartments)
        ? manager.headedDepartments.map(mapDepartmentSummary).filter(Boolean)
        : [];

    const activeMemberships = memberships.filter((membership) => membership.department && membership.department.isActive);
    const primaryMemberships = memberships.filter((membership) => membership.isPrimary);
    const activeHeadedDepartments = headedDepartments.filter((department) => department.isActive);

    const legacyMatchedMemberships = legacyDepartmentKey
        ? activeMemberships.filter((membership) => toDepartmentLookupKey(membership.department && membership.department.name) === legacyDepartmentKey)
        : [];
    const headedMatchedMemberships = activeMemberships.filter((membership) =>
        activeHeadedDepartments.some((department) => department.id === membership.departmentId)
    );

    const issues = [];
    let autoFix = null;

    if (legacyDepartmentKey && matchedLegacyDepartments.length === 0) {
        issues.push('legacy_department_not_found');
    } else if (legacyDepartmentKey && activeLegacyDepartments.length === 0) {
        issues.push('legacy_department_inactive');
    }

    if (memberships.some((membership) => !membership.department || !membership.department.isActive)) {
        issues.push('inactive_membership');
    }

    if (activeHeadedDepartments.some((department) => !memberships.some((membership) => membership.departmentId === department.id))) {
        issues.push('headed_department_missing_membership');
    }

    if (memberships.length === 0) {
        issues.push('missing_memberships');

        if (activeHeadedDepartments.length > 1) {
            issues.push('multiple_headed_departments');
        }

        const singleHeadedDepartment = activeHeadedDepartments.length === 1 ? activeHeadedDepartments[0] : null;
        const singleLegacyDepartment = activeLegacyDepartments.length === 1 ? activeLegacyDepartments[0] : null;

        if (singleHeadedDepartment && singleLegacyDepartment && singleHeadedDepartment.id === singleLegacyDepartment.id) {
            autoFix = buildSetPrimaryAutoFix(singleHeadedDepartment, 'headed_department_and_legacy', true);
        } else if (singleHeadedDepartment && !singleLegacyDepartment) {
            autoFix = buildSetPrimaryAutoFix(singleHeadedDepartment, 'headed_department', true);
        } else if (!singleHeadedDepartment && singleLegacyDepartment) {
            autoFix = buildSetPrimaryAutoFix(singleLegacyDepartment, 'legacy_department', true);
        }
    } else if (primaryMemberships.length === 0) {
        issues.push('missing_primary_membership');

        if (activeMemberships.length === 1) {
            autoFix = buildSetPrimaryAutoFix(activeMemberships[0].department, 'single_membership', false);
        } else if (legacyMatchedMemberships.length === 1) {
            autoFix = buildSetPrimaryAutoFix(legacyMatchedMemberships[0].department, 'legacy_membership_match', false);
        } else if (headedMatchedMemberships.length === 1) {
            autoFix = buildSetPrimaryAutoFix(headedMatchedMemberships[0].department, 'headed_department_membership_match', false);
        }
    } else if (primaryMemberships.length > 1) {
        issues.push('multiple_primary_memberships');

        if (legacyMatchedMemberships.length === 1) {
            autoFix = buildSetPrimaryAutoFix(legacyMatchedMemberships[0].department, 'legacy_membership_match', false);
        } else if (headedMatchedMemberships.length === 1) {
            autoFix = buildSetPrimaryAutoFix(headedMatchedMemberships[0].department, 'headed_department_membership_match', false);
        }
    }

    const uniqueIssues = [...new Set(issues)];
    const status = uniqueIssues.length === 0
        ? 'ready'
        : autoFix
            ? 'auto_fixable'
            : 'manual_review';

    return {
        user: {
            id: manager.id,
            name: manager.name,
            email: manager.email,
            role: manager.role,
            legacyDepartment
        },
        memberships,
        headedDepartments,
        issues: uniqueIssues,
        autoFix,
        status
    };
};

const buildManagerDepartmentReadinessReport = (managers) => {
    const issueCounts = {};

    for (const manager of managers) {
        for (const issue of manager.issues) {
            issueCounts[issue] = (issueCounts[issue] || 0) + 1;
        }
    }

    return {
        inspectedManagers: managers.length,
        readyManagers: managers.filter((manager) => manager.status === 'ready').length,
        autoFixableManagers: managers.filter((manager) => manager.status === 'auto_fixable').length,
        manualReviewManagers: managers.filter((manager) => manager.status === 'manual_review').length,
        issueCounts,
        managers
    };
};

const auditManagerDepartmentReadiness = async(db) => {
    const [managers, departments] = await Promise.all([
        db.user.findMany({
            where: { role: 'MANAGER' },
            orderBy: { email: 'asc' },
            select: MANAGER_DEPARTMENT_READINESS_SELECT
        }),
        db.department.findMany({
            select: {
                id: true,
                name: true,
                code: true,
                isActive: true
            }
        })
    ]);

    const departmentLookup = buildDepartmentLookup(departments);
    return buildManagerDepartmentReadinessReport(
        managers.map((manager) => evaluateManagerDepartmentReadiness(manager, departmentLookup))
    );
};

const runWithOptionalTransaction = async(db, work) => {
    if (typeof db.$transaction === 'function') {
        return db.$transaction((tx) => work(tx));
    }

    return work(db);
};

const applyManagerDepartmentAutoFix = async(db, managerReport) => {
    if (!managerReport || !managerReport.autoFix) {
        return null;
    }

    const { user, autoFix } = managerReport;

    await runWithOptionalTransaction(db, async(tx) => {
        await tx.userDepartment.upsert({
            where: {
                userId_departmentId: {
                    userId: user.id,
                    departmentId: autoFix.departmentId
                }
            },
            update: {
                isPrimary: true
            },
            create: {
                userId: user.id,
                departmentId: autoFix.departmentId,
                isPrimary: true
            }
        });

        await tx.userDepartment.updateMany({
            where: {
                userId: user.id,
                NOT: {
                    departmentId: autoFix.departmentId
                }
            },
            data: {
                isPrimary: false
            }
        });
    });

    return {
        userId: user.id,
        email: user.email,
        action: autoFix.type,
        departmentId: autoFix.departmentId,
        departmentName: autoFix.departmentName,
        source: autoFix.source,
        createdMembership: autoFix.createsMembership
    };
};

const backfillManagerDepartmentReadiness = async(db, options = {}) => {
    const apply = options.apply === true;
    const report = await auditManagerDepartmentReadiness(db);
    const actions = [];

    for (const manager of report.managers.filter((item) => item.autoFix)) {
        if (apply) {
            const appliedAction = await applyManagerDepartmentAutoFix(db, manager);
            actions.push({
                userId: manager.user.id,
                email: manager.user.email,
                applied: true,
                ...appliedAction
            });
        } else {
            actions.push({
                userId: manager.user.id,
                email: manager.user.email,
                applied: false,
                action: manager.autoFix.type,
                departmentId: manager.autoFix.departmentId,
                departmentName: manager.autoFix.departmentName,
                source: manager.autoFix.source,
                createdMembership: manager.autoFix.createsMembership
            });
        }
    }

    return {
        apply,
        inspectedManagers: report.inspectedManagers,
        autoFixableManagers: report.autoFixableManagers,
        plannedActions: actions,
        manualReviewManagers: report.managers
            .filter((manager) => manager.status === 'manual_review')
            .map((manager) => ({
                user: manager.user,
                issues: manager.issues
            }))
    };
};

module.exports = {
    MANAGER_DEPARTMENT_READINESS_SELECT,
    buildDepartmentLookup,
    evaluateManagerDepartmentReadiness,
    buildManagerDepartmentReadinessReport,
    auditManagerDepartmentReadiness,
    applyManagerDepartmentAutoFix,
    backfillManagerDepartmentReadiness
};
