const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:5001';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || 'admin@taskmanager.com';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || 'password123';
const EMPLOYEE_EMAIL = process.env.SMOKE_EMPLOYEE_EMAIL || 'employee@taskmanager.com';
const MANAGER_EMAIL = process.env.SMOKE_MANAGER_EMAIL || 'manager@taskmanager.com';
const USER_PASSWORD = process.env.SMOKE_USER_PASSWORD || 'password123';

const timestamp = Date.now();

const request = async(path, options = {}) => {
    const response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;

    if (!response.ok) {
        const message = body && (body.error || body.message || JSON.stringify(body));
        throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${message || text}`);
    }

    return body;
};

const requestAllowError = async(path, options = {}) => {
    const response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    return { status: response.status, body };
};

const authorized = (token, options = {}) => ({
    ...options,
    headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
    }
});

const login = (email, password = USER_PASSWORD) => request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
});

const main = async() => {
    const [adminLogin, employeeLogin, managerLogin] = await Promise.all([
        login(ADMIN_EMAIL, ADMIN_PASSWORD),
        login(EMPLOYEE_EMAIL),
        login(MANAGER_EMAIL)
    ]);

    const adminToken = adminLogin.token;
    const employeeToken = employeeLogin.token;
    const managerToken = managerLogin.token;
    const employeeId = employeeLogin.user.id;
    const managerId = managerLogin.user.id;

    const master = await request('/api/tasks', authorized(adminToken, {
        method: 'POST',
        body: JSON.stringify({
            title: `Merge master ${timestamp}`,
            description: 'Smoke master task for UNION merge and coordinated close.',
            status: 'IN_PROGRESS',
            priority: 'HIGH',
            assigneeIds: [employeeId, managerId]
        })
    }));

    const child = await request('/api/tasks', authorized(adminToken, {
        method: 'POST',
        body: JSON.stringify({
            title: `Merge child ${timestamp}`,
            description: 'Smoke child task that should follow master status and number.',
            priority: 'MEDIUM'
        })
    }));

    const mergeInfo = await request(`/api/tasks/${master.id}/merge`, authorized(adminToken, {
        method: 'POST',
        body: JSON.stringify({
            mergeMode: 'UNION',
            childTaskIds: [child.id],
            reason: 'Smoke проверка объединения заявок'
        })
    }));

    if (!mergeInfo.mergedTasks || mergeInfo.mergedTasks.length !== 1) {
        throw new Error('Merge info does not include the UNION child task.');
    }
    if (mergeInfo.mergedTasks[0]?.childTask?.displayNumber !== master.displayNumber) {
        throw new Error('UNION child should expose master display number in merge info.');
    }

    const mergedChild = await request(`/api/tasks/${child.id}`, authorized(adminToken));
    if (mergedChild.status !== master.status) {
        throw new Error(`Child task status should follow master status ${master.status}, got ${mergedChild.status}.`);
    }
    if (mergedChild.displayNumber !== master.displayNumber) {
        throw new Error(`Child task display number should follow master display number ${master.displayNumber}, got ${mergedChild.displayNumber}.`);
    }

    const closeAttempt = await requestAllowError(`/api/tasks/${master.id}/status`, authorized(adminToken, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'DONE' })
    }));
    if (closeAttempt.status !== 400) {
        throw new Error(`DONE before approvals should be blocked, got ${closeAttempt.status}.`);
    }

    const firstApproval = await request(`/api/tasks/${master.id}/close-approve`, authorized(employeeToken, {
        method: 'POST'
    }));
    if (firstApproval.closed) {
        throw new Error('Task closed after only one approval.');
    }

    const secondApproval = await request(`/api/tasks/${master.id}/close-approve`, authorized(managerToken, {
        method: 'POST'
    }));
    if (!secondApproval.closed || secondApproval.task.status !== 'DONE') {
        throw new Error('Task was not closed after all assignee approvals.');
    }

    const closedChild = await request(`/api/tasks/${child.id}`, authorized(adminToken));
    if (closedChild.status !== 'DONE') {
        throw new Error(`Child task should move to DONE together with master, got ${closedChild.status}.`);
    }

    const listedTasks = await request('/api/tasks?limit=100', authorized(adminToken));
    if (listedTasks.tasks.some((task) => task.id === child.id)) {
        throw new Error('UNION child task should stay hidden from the main task list.');
    }

    const finalMergeInfo = await request(`/api/tasks/${master.id}/merge-info`, authorized(adminToken));
    if (finalMergeInfo.closeApproval.pendingAssigneeIds.length !== 0) {
        throw new Error('Final merge info still has pending close approvals.');
    }

    console.log('Merge approval smoke OK:', {
        masterTaskId: master.id,
        childTaskId: child.id,
        childStatus: mergedChild.status,
        childDisplayNumber: mergedChild.displayNumber,
        finalStatus: secondApproval.task.status,
        approvals: finalMergeInfo.closeApproval.approvedAssigneeIds.length
    });
};

main().catch((error) => {
    console.error('Merge approval smoke failed:', error.message);
    process.exit(1);
});
