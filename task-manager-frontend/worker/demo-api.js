const now = "2026-07-24T09:00:00.000Z";

const users = [
  { id: "u-admin", name: "Admin User", email: "admin@taskmanager.com", role: "ADMIN", position: "CEO", department: "Management", skills: ["leadership", "strategy"] },
  { id: "u-manager", name: "John Manager", email: "manager@taskmanager.com", role: "AGENT", position: "ServiceDesk Agent", department: "Support", skills: ["triage", "coordination"] },
  { id: "u-employee", name: "Jane Employee", email: "employee@taskmanager.com", role: "AGENT", position: "ServiceDesk Agent", department: "Support", skills: ["workstations", "debugging"] },
  { id: "u-support", name: "Alex Support", email: "support@taskmanager.com", role: "AGENT", position: "Support Specialist", department: "Support", skills: ["support", "triage"] },
  { id: "u-requester", name: "Olga Requester", email: "requester@taskmanager.com", role: "REQUESTER", position: "Office Employee", department: "Office", skills: ["requests"] },
  { id: "u-viewer", name: "Eve Viewer", email: "viewer@taskmanager.com", role: "VIEWER", position: "Observer", department: "Management", skills: ["reporting"] },
];

const folders = [
  { id: "f-it", name: "IT и доступы", description: "Заявки по доступам, рабочим местам и оборудованию", isActive: true, taskCount: 3, canDelete: false, counts: { tasks: 3, types: 2, subtypes: 3, teams: 1 } },
  { id: "f-ops", name: "Операции и склад", description: "Склад, отгрузки, возвраты и операционные вопросы", isActive: true, taskCount: 1, canDelete: false, counts: { tasks: 1, types: 1, subtypes: 1, teams: 1 } },
  { id: "f-docs", name: "Документы и отгрузки", description: "Документы, накладные, отгрузки и возвраты", isActive: true, taskCount: 1, canDelete: false, counts: { tasks: 1, types: 1, subtypes: 1, teams: 1 } },
];

const entities = [
  { id: "e-incident", name: "Инцидент", code: "INCIDENT", description: "Что-то сломалось и мешает работе", isActive: true },
  { id: "e-request", name: "Запрос", code: "REQUEST", description: "Стандартный запрос на услугу или изменение", isActive: true },
  { id: "e-problem", name: "Проблема", code: "PROBLEM", description: "Повторяющаяся или системная проблема", isActive: true },
];

const types = [
  { id: "t-access", name: "Доступы и аккаунты", code: "ACCESS", folderId: "f-it", entityId: "e-request", description: "Создание, изменение и восстановление доступов", isActive: true },
  { id: "t-workplace", name: "Рабочее место", code: "WORKPLACE", folderId: "f-it", entityId: "e-incident", description: "Компьютеры, периферия, сеть и офисное ПО", isActive: true },
  { id: "t-onec", name: "1С", code: "ONE_C", folderId: "f-ops", entityId: "e-problem", description: "Ошибки, права и консультации по 1С", isActive: true },
  { id: "t-docs", name: "Документы", code: "DOCS", folderId: "f-docs", entityId: "e-request", description: "Закрывающие документы и накладные", isActive: true },
];

const subtypes = [
  { id: "st-password", name: "Сброс пароля", code: "PASSWORD_RESET", folderId: "f-it", typeId: "t-access", isActive: true },
  { id: "st-vpn", name: "VPN / удалённый доступ", code: "VPN", folderId: "f-it", typeId: "t-access", isActive: true },
  { id: "st-printer", name: "Принтеры", code: "PRINTER", folderId: "f-it", typeId: "t-workplace", isActive: true },
  { id: "st-onec-rights", name: "Права в 1С", code: "ONE_C_RIGHTS", folderId: "f-ops", typeId: "t-onec", isActive: true },
  { id: "st-invoice", name: "Счета и накладные", code: "INVOICE", folderId: "f-docs", typeId: "t-docs", isActive: true },
];

const teams = [
  { id: "team-support", name: "ServiceDesk Support", description: "Первая линия поддержки", isActive: true, folderIds: ["f-it"], userIds: ["u-manager", "u-employee", "u-support"], counts: { members: 3, folders: 1 } },
  { id: "team-ops", name: "Operations Desk", description: "Операционные вопросы", isActive: true, folderIds: ["f-ops", "f-docs"], userIds: ["u-support"], counts: { members: 1, folders: 2 } },
];

const tasks = [
  {
    id: "task-1001",
    ticketNumber: 1001,
    displayNumber: "#1001",
    title: "Не работает VPN после обновления",
    description: "После обновления macOS подключение к VPN сбрасывается через несколько секунд.",
    status: "IN_PROGRESS",
    priority: "HIGH",
    sourceChannel: "WEB",
    progress: 45,
    folderId: "f-it",
    entityId: "e-incident",
    typeId: "t-access",
    subtypeId: "st-vpn",
    authorId: "u-requester",
    createdAt: "2026-07-23T10:15:00.000Z",
    updatedAt: "2026-07-24T08:10:00.000Z",
    dueDate: "2026-07-24T15:00:00.000Z",
    assigneeIds: ["u-manager"],
    tags: ["vpn", "remote"],
  },
  {
    id: "task-1002",
    ticketNumber: 1002,
    displayNumber: "#1002",
    title: "Нужен доступ к папке Финансы",
    description: "Прошу открыть доступ к общей папке для подготовки отчёта.",
    status: "TODO",
    priority: "MEDIUM",
    sourceChannel: "WEB",
    progress: 0,
    folderId: "f-it",
    entityId: "e-request",
    typeId: "t-access",
    subtypeId: "st-password",
    authorId: "u-requester",
    createdAt: "2026-07-24T07:20:00.000Z",
    updatedAt: "2026-07-24T07:20:00.000Z",
    dueDate: "2026-07-25T12:00:00.000Z",
    assigneeIds: [],
    tags: ["access"],
  },
  {
    id: "task-1003",
    ticketNumber: 1003,
    displayNumber: "#1003",
    title: "Принтер на складе печатает с полосами",
    description: "Проблема повторяется на всех накладных, требуется диагностика.",
    status: "REVIEW",
    priority: "LOW",
    sourceChannel: "EMAIL",
    progress: 80,
    folderId: "f-it",
    entityId: "e-incident",
    typeId: "t-workplace",
    subtypeId: "st-printer",
    authorId: "u-support",
    createdAt: "2026-07-22T12:00:00.000Z",
    updatedAt: "2026-07-24T06:45:00.000Z",
    dueDate: "2026-07-26T09:00:00.000Z",
    assigneeIds: ["u-employee"],
    tags: ["printer", "warehouse"],
  },
  {
    id: "task-1004",
    ticketNumber: 1004,
    displayNumber: "#1004",
    title: "Ошибка прав при проведении документа в 1С",
    description: "Пользователь видит ошибку доступа при проведении возврата.",
    status: "DONE",
    priority: "URGENT",
    sourceChannel: "WEB",
    progress: 100,
    folderId: "f-ops",
    entityId: "e-problem",
    typeId: "t-onec",
    subtypeId: "st-onec-rights",
    authorId: "u-manager",
    createdAt: "2026-07-21T11:30:00.000Z",
    updatedAt: "2026-07-23T17:00:00.000Z",
    dueDate: "2026-07-22T17:00:00.000Z",
    assigneeIds: ["u-support"],
    tags: ["1c"],
  },
  {
    id: "task-1005",
    ticketNumber: 1005,
    displayNumber: "#1005",
    title: "Подготовить копии закрывающих документов",
    description: "Нужны копии документов по июньской отгрузке для клиента.",
    status: "TODO",
    priority: "MEDIUM",
    sourceChannel: "WEB",
    progress: 15,
    folderId: "f-docs",
    entityId: "e-request",
    typeId: "t-docs",
    subtypeId: "st-invoice",
    authorId: "u-requester",
    createdAt: "2026-07-24T06:10:00.000Z",
    updatedAt: "2026-07-24T06:35:00.000Z",
    dueDate: "2026-07-25T18:00:00.000Z",
    assigneeIds: ["u-support"],
    tags: ["docs"],
  },
];

const comments = {
  "task-1001": [
    { id: "c-1", taskId: "task-1001", authorId: "u-manager", author: { id: "u-manager", name: "John Manager" }, content: "Проверяю профиль VPN и сертификаты.", visibility: "PUBLIC", createdAt: "2026-07-24T08:25:00.000Z" },
  ],
  "task-1003": [
    { id: "c-2", taskId: "task-1003", authorId: "u-employee", author: { id: "u-employee", name: "Jane Employee" }, content: "Картридж заменён, нужен тестовый прогон.", visibility: "PUBLIC", createdAt: "2026-07-24T06:55:00.000Z" },
  ],
};

const cannedReplies = [
  { id: "cr-1", title: "Уточнение деталей", body: "Спасибо за обращение. Уточните, пожалуйста, когда проблема появилась и повторяется ли она у коллег.", category: "Диагностика", isActive: true, visibility: "SHARED", authorId: "u-admin", createdAt: now, updatedAt: now },
  { id: "cr-2", title: "Решено", body: "Проблема устранена. Проверьте, пожалуйста, что всё работает корректно.", category: "Закрытие", isActive: true, visibility: "SHARED", authorId: "u-admin", createdAt: now, updatedAt: now },
];

const knowledgeArticles = [
  { id: "ka-1", title: "Как оформить заявку на доступ", slug: "access-request", body: "Укажите систему, роль и согласующего руководителя.", category: "Доступы", isPublished: true, createdById: "u-admin", updatedById: "u-admin", createdAt: now, updatedAt: now },
  { id: "ka-2", title: "Что приложить к заявке по 1С", slug: "one-c-ticket", body: "Нужен скриншот ошибки, номер документа и описание действия.", category: "1С", isPublished: true, createdById: "u-admin", updatedById: "u-admin", createdAt: now, updatedAt: now },
];

const json = (data, init = {}) =>
  Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init.headers || {}),
    },
  });

const readJson = async (request) => {
  try {
    return await request.json();
  } catch {
    return {};
  }
};

const asUser = (user) => ({
  ...user,
  isActive: true,
  createdAt: now,
  updatedAt: now,
  primaryDepartment: user.department ? { id: `dep-${user.department.toLowerCase()}`, name: user.department, isActive: true } : null,
  departmentMemberships: user.department
    ? [{ id: `m-${user.id}`, userId: user.id, departmentId: `dep-${user.department.toLowerCase()}`, isPrimary: true, department: { id: `dep-${user.department.toLowerCase()}`, name: user.department, isActive: true } }]
    : [],
});

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: true,
  position: user.position,
  department: user.department,
  skills: user.skills,
  createdAt: now,
  updatedAt: now,
});

const tokenFor = (user) => `demo-token:${user.id}`;

const userFromRequest = (request) => {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const userId = token.startsWith("demo-token:") ? token.slice("demo-token:".length) : "";
  return users.find((user) => user.id === userId) || null;
};

const requireUser = (request) => {
  const user = userFromRequest(request);
  if (!user) {
    return { response: json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user };
};

const withRelations = (task) => {
  const author = users.find((user) => user.id === task.authorId);
  const assignees = task.assigneeIds.map((userId, index) => {
    const user = users.find((item) => item.id === userId);
    return user
      ? { id: `a-${task.id}-${index}`, taskId: task.id, userId, user: { id: user.id, name: user.name, role: user.role } }
      : null;
  }).filter(Boolean);
  const folder = folders.find((item) => item.id === task.folderId);
  return {
    ...task,
    author: author ? publicUser(author) : null,
    assignees,
    department: folder ? { id: folder.id, name: folder.name, isActive: true } : null,
    _count: { comments: comments[task.id]?.length || 0, assignees: assignees.length },
    sla: {
      policy: { id: "sla-default", name: "Demo SLA", firstResponseMinutes: 60, resolutionMinutes: 480 },
      firstResponseDueAt: task.dueDate,
      resolutionDueAt: task.dueDate,
      firstResponseStatus: task.status === "TODO" ? "RUNNING" : "MET",
      resolutionStatus: task.status === "DONE" ? "MET" : "RUNNING",
    },
  };
};

const listTasks = (url) => {
  let result = tasks.map(withRelations);
  const search = (url.searchParams.get("search") || "").toLowerCase();
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const folderId = url.searchParams.get("folderId");
  if (search) {
    result = result.filter((task) => `${task.title} ${task.description}`.toLowerCase().includes(search));
  }
  if (status) result = result.filter((task) => task.status === status);
  if (priority) result = result.filter((task) => task.priority === priority);
  if (folderId) result = result.filter((task) => task.folderId === folderId);
  result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const total = result.length;
  const limit = Number(url.searchParams.get("limit") || 25);
  const offset = Number(url.searchParams.get("offset") || 0);
  return { tasks: result.slice(offset, offset + limit), total, limit, offset };
};

const dashboard = () => {
  const pending = tasks.filter((task) => task.status === "TODO").length;
  const inProgress = tasks.filter((task) => task.status === "IN_PROGRESS" || task.status === "REVIEW").length;
  const completed = tasks.filter((task) => task.status === "DONE").length;
  return {
    kpi: { pending, inProgress, completed, completionRate: "20%" },
    efficiency: { onTimePercent: "86%", avgResolutionHours: 6.4 },
    monthlyProductivity: [
      { month: "Май", completed: 12 },
      { month: "Июн", completed: 18 },
      { month: "Июл", completed: 9 },
    ],
    activeEmployees: [
      { id: "u-manager", name: "John Manager", role: "AGENT", tasks_count: 2 },
      { id: "u-employee", name: "Jane Employee", role: "AGENT", tasks_count: 1 },
      { id: "u-support", name: "Alex Support", role: "AGENT", tasks_count: 2 },
    ],
    workerOfMonth: { id: "u-support", name: "Alex Support", role: "AGENT", completed_count: 7 },
  };
};

const reports = () => ({
  onTimePercent: 86,
  completionRatings: [
    { id: "u-manager", name: "John Manager", total: 8, done: 6, completionPercent: 75 },
    { id: "u-employee", name: "Jane Employee", total: 6, done: 5, completionPercent: 83 },
    { id: "u-support", name: "Alex Support", total: 10, done: 9, completionPercent: 90 },
  ],
  activity: [
    { month: "Май", comments: 24 },
    { month: "Июн", comments: 38 },
    { month: "Июл", comments: 31 },
  ],
  overdue: [
    { id: "u-manager", name: "John Manager", overdue_count: 1 },
    { id: "u-support", name: "Alex Support", overdue_count: 2 },
  ],
});

const productSettings = () => ({
  portalName: "ServiceDesk",
  companyName: "Demo Office",
  welcomeMessage: "Портал заявок и обращений",
  locale: "ru-RU",
  timezone: "Europe/Moscow",
  defaultPriority: "MEDIUM",
  defaultFolderId: "f-it",
  defaultFolder: { id: "f-it", name: "IT и доступы" },
});

const maybeCreateTask = async (request) => {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  const payload = await readJson(request);
  const next = {
    id: `task-${1000 + tasks.length + 1}`,
    ticketNumber: 1000 + tasks.length + 1,
    displayNumber: `#${1000 + tasks.length + 1}`,
    title: payload.title || "Новая заявка",
    description: payload.description || "",
    status: "TODO",
    priority: payload.priority || "MEDIUM",
    sourceChannel: "WEB",
    progress: 0,
    folderId: payload.folderId || "f-it",
    entityId: payload.entityId || "e-request",
    typeId: payload.typeId || "t-access",
    subtypeId: payload.subtypeId || null,
    authorId: auth.user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dueDate: null,
    assigneeIds: Array.isArray(payload.assigneeIds) ? payload.assigneeIds : [],
    tags: [],
  };
  tasks.unshift(next);
  return json(withRelations(next), { status: 201 });
};

export async function handleDemoApi(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") return new Response(null, { status: 204 });
  if (method === "GET" && path === "/auth/config") return json({ publicRegistrationEnabled: false });
  if (method === "POST" && path === "/auth/login") {
    const body = await readJson(request);
    const email = String(body.email || "").toLowerCase();
    const user = users.find((item) => item.email === email);
    if (!user || body.password !== "password123") {
      return json({ error: "Неверный логин или пароль" }, { status: 401 });
    }
    return json({ message: "OK", token: tokenFor(user), user: asUser(user) });
  }
  if (method === "GET" && path === "/auth/me") {
    const auth = requireUser(request);
    if (auth.response) return auth.response;
    return json({ user: asUser(auth.user) });
  }
  if (method === "POST" && path === "/auth/logout") return json({ message: "OK" });

  if (path.startsWith("/auth/")) return json({ error: "Demo API: endpoint disabled" }, { status: 403 });

  if (method === "GET" && path === "/servicedesk/product-settings") {
    return json(productSettings());
  }

  const auth = requireUser(request);
  if (auth.response) return auth.response;

  if (method === "GET" && path === "/dashboard") return json(dashboard());
  if (method === "GET" && path === "/reports") return json(reports());
  if (method === "GET" && path === "/users") return json(users.map(publicUser));
  if (method === "GET" && /^\/users\/[^/]+$/.test(path)) {
    const user = users.find((item) => item.id === path.split("/").pop());
    return user ? json(publicUser(user)) : json({ error: "Not found" }, { status: 404 });
  }
  if (method === "GET" && path === "/departments") {
    return json(["Management", "Support", "Office"].map((name) => ({ id: `dep-${name.toLowerCase()}`, name, isActive: true })));
  }
  if (method === "GET" && path === "/departments/admin") {
    return json(["Management", "Support", "Office"].map((name) => ({ id: `dep-${name.toLowerCase()}`, name, isActive: true, membershipCount: 1, taskCount: 0, legacyUserCount: 0, canDelete: false })));
  }

  if (method === "GET" && path === "/servicedesk/admin/product-settings") {
    const settings = productSettings();
    return json({ id: "default", ...settings, createdAt: now, updatedAt: now });
  }
  if (method === "GET" && (path === "/servicedesk/folders" || path === "/servicedesk/admin/folders")) return json(folders);
  if (method === "GET" && (path === "/servicedesk/types" || path === "/servicedesk/admin/types")) return json(types);
  if (method === "GET" && (path === "/servicedesk/subtypes" || path === "/servicedesk/admin/subtypes")) return json(subtypes);
  if (method === "GET" && (path === "/servicedesk/entities" || path === "/servicedesk/admin/entities")) return json(entities);
  if (method === "GET" && (path === "/servicedesk/teams" || path === "/servicedesk/admin/teams")) {
    return json(teams.map((team) => ({
      ...team,
      users: users.filter((user) => team.userIds.includes(user.id)).map(publicUser),
      folders: folders.filter((folder) => team.folderIds.includes(folder.id)),
    })));
  }
  if (method === "GET" && /^\/servicedesk\/admin\/teams\/[^/]+\/members$/.test(path)) {
    const teamId = path.split("/").at(-2);
    const team = teams.find((item) => item.id === teamId);
    return json((team?.userIds || []).map((userId, index) => ({
      id: `tm-${teamId}-${index}`,
      teamId,
      userId,
      role: "agent",
      isLead: index === 0,
      user: publicUser(users.find((item) => item.id === userId)),
      createdAt: now,
      updatedAt: now,
    })));
  }

  if (method === "GET" && path === "/tasks") return json(listTasks(url));
  if (method === "POST" && path === "/tasks") return maybeCreateTask(request);
  if (method === "GET" && /^\/tasks\/[^/]+$/.test(path)) {
    const task = tasks.find((item) => item.id === path.split("/").pop());
    return task ? json({ ...withRelations(task), comments: comments[task.id] || [], attachments: [] }) : json({ error: "Not found" }, { status: 404 });
  }
  if (method === "PATCH" && /^\/tasks\/[^/]+\/status$/.test(path)) {
    const taskId = path.split("/")[2];
    const task = tasks.find((item) => item.id === taskId);
    const body = await readJson(request);
    if (!task) return json({ error: "Not found" }, { status: 404 });
    task.status = body.status || task.status;
    task.progress = task.status === "DONE" ? 100 : task.status === "IN_PROGRESS" ? 45 : task.progress;
    task.updatedAt = new Date().toISOString();
    return json(withRelations(task));
  }
  if (method === "GET" && /^\/tasks\/[^/]+\/timeline$/.test(path)) return json([]);
  if (method === "GET" && /^\/tasks\/[^/]+\/merge-info$/.test(path)) return json({ sourceTask: null, candidates: [] });
  if (method === "GET" && /^\/tasks\/[^/]+\/email-thread$/.test(path)) return json({ taskId: path.split("/")[2], items: [] });

  if (method === "GET" && /^\/comments\/[^/]+$/.test(path)) {
    return json(comments[path.split("/").pop()] || []);
  }
  if (method === "POST" && /^\/comments\/[^/]+$/.test(path)) {
    const taskId = path.split("/").pop();
    const body = await readJson(request);
    const item = { id: `c-${Date.now()}`, taskId, authorId: auth.user.id, author: { id: auth.user.id, name: auth.user.name }, content: body.content || "", visibility: body.visibility || "PUBLIC", createdAt: new Date().toISOString() };
    comments[taskId] = [...(comments[taskId] || []), item];
    return json(item, { status: 201 });
  }

  if (method === "GET" && path === "/notifications") return json({ items: [], total: 0, unreadCount: 0 });
  if (method === "GET" && path === "/notifications/unread-count") return json({ count: 0, unreadCount: 0 });
  if (path.startsWith("/notifications/")) return json({ message: "OK" });

  if (method === "GET" && path === "/knowledge/articles") return json(knowledgeArticles);
  if (method === "GET" && /^\/knowledge\/articles\/[^/]+$/.test(path)) {
    const id = path.split("/").pop();
    return json(knowledgeArticles.find((item) => item.id === id || item.slug === id) || knowledgeArticles[0]);
  }
  if (method === "GET" && path === "/canned-replies") return json(cannedReplies);
  if (method === "GET" && /^\/canned-replies\/[^/]+$/.test(path)) return json(cannedReplies.find((item) => item.id === path.split("/").pop()) || cannedReplies[0]);
  if (method === "GET" && /^\/files\/[^/]+$/.test(path)) return json([]);
  if (method === "GET" && /^\/files\/[^/]+\/download$/.test(path)) return new Response("Demo file", { headers: { "Content-Type": "text/plain; charset=utf-8" } });

  if (method === "GET") return json([]);
  return json({ message: "Demo API accepted" });
}
