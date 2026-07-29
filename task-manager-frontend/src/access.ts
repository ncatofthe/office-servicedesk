import type { CapabilityAwareUser, UserCapability, UserRole } from './types';

export type AppModuleKey =
  | 'dashboard'
  | 'create'
  | 'tasks'
  | 'kanban'
  | 'knowledge'
  | 'cannedReplies'
  | 'team'
  | 'admin'
  | 'reports';

export type ModuleVisibility = 'hidden' | 'read-only' | 'full';

type RoleModuleMatrix = Record<UserRole, Record<AppModuleKey, ModuleVisibility>>;

export const ROLE_MODULE_MATRIX: RoleModuleMatrix = {
  ADMIN: {
    dashboard: 'full',
    create: 'full',
    tasks: 'full',
    kanban: 'full',
    knowledge: 'full',
    cannedReplies: 'full',
    team: 'full',
    admin: 'full',
    reports: 'full',
  },
  AGENT: {
    dashboard: 'full',
    create: 'full',
    tasks: 'full',
    kanban: 'full',
    knowledge: 'full',
    cannedReplies: 'full',
    team: 'hidden',
    admin: 'hidden',
    reports: 'hidden',
  },
  REQUESTER: {
    dashboard: 'full',
    create: 'full',
    tasks: 'full',
    kanban: 'hidden',
    knowledge: 'read-only',
    cannedReplies: 'hidden',
    team: 'hidden',
    admin: 'hidden',
    reports: 'hidden',
  },
  VIEWER: {
    dashboard: 'read-only',
    create: 'hidden',
    tasks: 'read-only',
    kanban: 'read-only',
    knowledge: 'read-only',
    cannedReplies: 'hidden',
    team: 'hidden',
    admin: 'hidden',
    reports: 'full',
  },
};

export const APP_NAV_ITEMS: Array<{ path: string; label: string; moduleKey: Exclude<AppModuleKey, 'create'> }> = [
  { path: '/', label: 'Главная', moduleKey: 'dashboard' },
  { path: '/tickets', label: 'Заявки', moduleKey: 'tasks' },
  { path: '/queue', label: 'Очередь', moduleKey: 'kanban' },
  { path: '/knowledge', label: 'База знаний', moduleKey: 'knowledge' },
  { path: '/canned-replies', label: 'Шаблоны ответов', moduleKey: 'cannedReplies' },
  { path: '/admin', label: 'Настройки', moduleKey: 'admin' },
  { path: '/team', label: 'Пользователи', moduleKey: 'team' },
];

export const ROLE_CAPABILITY_MATRIX: Record<UserRole, UserCapability[]> = {
  ADMIN: [
    'tickets:read',
    'tickets:create',
    'tickets:update',
    'tickets:assign',
    'tickets:comment',
    'tickets:delete',
    'directories:read',
    'directories:manage',
    'knowledge:read',
    'knowledge:manage',
    'users:read',
    'users:manage',
    'reports:read',
  ],
  AGENT: ['tickets:read', 'tickets:create', 'tickets:update', 'tickets:assign', 'tickets:comment', 'directories:read', 'knowledge:read', 'knowledge:manage', 'users:read'],
  REQUESTER: ['tickets:read', 'tickets:create', 'tickets:comment', 'knowledge:read'],
  VIEWER: ['tickets:read', 'knowledge:read', 'reports:read'],
};

const DEFAULT_ROLE: UserRole = 'REQUESTER';

const resolveRole = (role?: UserRole): UserRole => {
  if (!role) {
    return DEFAULT_ROLE;
  }

  return role in ROLE_MODULE_MATRIX ? role : DEFAULT_ROLE;
};

export const getModuleVisibility = (role: UserRole | undefined, moduleKey: AppModuleKey): ModuleVisibility =>
  ROLE_MODULE_MATRIX[resolveRole(role)][moduleKey];

export const canAccessModule = (role: UserRole | undefined, moduleKey: AppModuleKey): boolean =>
  getModuleVisibility(role, moduleKey) !== 'hidden';

export const canCreateTasks = (role: UserRole | undefined): boolean =>
  hasCapability({ role }, 'tickets:create');

export const getUserCapabilities = (user: CapabilityAwareUser | null | undefined): UserCapability[] => {
  const roleCapabilities = ROLE_CAPABILITY_MATRIX[resolveRole(user?.role)];
  const explicitCapabilities = user?.capabilities || [];
  return Array.from(new Set([...roleCapabilities, ...explicitCapabilities]));
};

export const hasCapability = (
  user: CapabilityAwareUser | null | undefined,
  capability: UserCapability
): boolean => getUserCapabilities(user).includes(capability);

export const hasAllCapabilities = (
  user: CapabilityAwareUser | null | undefined,
  capabilities: UserCapability[]
): boolean => capabilities.every((capability) => hasCapability(user, capability));

export const hasAnyCapability = (
  user: CapabilityAwareUser | null | undefined,
  capabilities: UserCapability[]
): boolean => capabilities.some((capability) => hasCapability(user, capability));
