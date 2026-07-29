import { PRODUCT_USER_ROLES, TASK_PRIORITIES, USER_ROLES, TASK_STATUSES } from './enums.js';
import type {
  AdminRegisterRequestDto,
  LoginRequestDto,
  RegisterRequestDto
} from './auth.js';
import type {
  CreateTaskRequestDto,
  UpdateTaskRequestDto,
  UpdateTaskStatusRequestDto
} from './tasks.js';
import type {
  UpdateUserProfileRequestDto,
  UpdateUserRoleRequestDto
} from './users.js';

const LEGACY_USER_ROLE_ALIASES: Record<string, (typeof USER_ROLES)[number]> = {
  DIRECTOR: 'AGENT',
  MANAGER: 'AGENT',
  EMPLOYEE: 'AGENT',
  FINANCE: 'AGENT',
  USER: 'REQUESTER'
};

export class SharedRuntimeSchemaError extends Error {
  issues: string[];

  constructor(message: string, issues?: string[]) {
    super(message);
    this.name = 'SharedRuntimeSchemaError';
    this.issues = issues ?? [message];
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const expectObject = (value: unknown): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    throw new SharedRuntimeSchemaError('Request payload must be an object');
  }

  return value;
};

const expectNonEmptyString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SharedRuntimeSchemaError(`${field} must be a non-empty string`);
  }

  return value;
};

const isEmailLike = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const createRuntimeSchema = <T>(parser: (value: unknown) => T) => ({
  parse(value: unknown): T {
    return parser(value);
  }
});

const readOptionalString = (
  payload: Record<string, unknown>,
  field: string,
  options?: { allowNull?: boolean }
): string | null | undefined => {
  if (!Object.prototype.hasOwnProperty.call(payload, field)) {
    return undefined;
  }

  const value = payload[field];

  if (value === null && options?.allowNull) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new SharedRuntimeSchemaError(`${field} must be a string`);
  }

  return value;
};

const readRequiredString = (
  payload: Record<string, unknown>,
  field: string
): string => {
  if (!Object.prototype.hasOwnProperty.call(payload, field) || typeof payload[field] !== 'string') {
    throw new SharedRuntimeSchemaError(`${field} must be a string`);
  }

  return payload[field];
};

const readOptionalStrictString = (
  payload: Record<string, unknown>,
  field: string
): string | undefined => {
  const value = readOptionalString(payload, field);

  if (value === null) {
    throw new SharedRuntimeSchemaError(`${field} must be a string`);
  }

  return value;
};

const readOptionalEnum = <T extends readonly string[]>(
  payload: Record<string, unknown>,
  field: string,
  allowedValues: T
): T[number] | undefined => {
  if (!Object.prototype.hasOwnProperty.call(payload, field)) {
    return undefined;
  }

  const value = payload[field];

  if (typeof value !== 'string' || !allowedValues.includes(value as T[number])) {
    throw new SharedRuntimeSchemaError(`Invalid ${field}`);
  }

  return value as T[number];
};

const readOptionalNumber = (
  payload: Record<string, unknown>,
  field: string
): number | undefined => {
  if (!Object.prototype.hasOwnProperty.call(payload, field)) {
    return undefined;
  }

  const value = payload[field];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }

  throw new SharedRuntimeSchemaError(`${field} must be a number`);
};

const readOptionalBoolean = (
  payload: Record<string, unknown>,
  field: string
): boolean | undefined => {
  if (!Object.prototype.hasOwnProperty.call(payload, field)) {
    return undefined;
  }

  const value = payload[field];
  if (typeof value === 'boolean') {
    return value;
  }

  throw new SharedRuntimeSchemaError(`${field} must be a boolean`);
};

const readOptionalStringArray = (
  payload: Record<string, unknown>,
  field: string
): string[] | undefined => {
  if (!Object.prototype.hasOwnProperty.call(payload, field)) {
    return undefined;
  }

  const value = payload[field];

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new SharedRuntimeSchemaError(`${field} must be an array of strings`);
  }

  return [...value];
};

const normalizeUserRoleInput = (value: string): (typeof USER_ROLES)[number] | null => {
  const normalized = LEGACY_USER_ROLE_ALIASES[value] ?? value;

  if (!USER_ROLES.includes(normalized as (typeof USER_ROLES)[number])) {
    return null;
  }

  return normalized as (typeof USER_ROLES)[number];
};

const normalizeProductUserRoleInput = (
  value: string
): (typeof PRODUCT_USER_ROLES)[number] | null => {
  const normalized = LEGACY_USER_ROLE_ALIASES[value] ?? value;

  if (!PRODUCT_USER_ROLES.includes(normalized as (typeof PRODUCT_USER_ROLES)[number])) {
    return null;
  }

  return normalized as (typeof PRODUCT_USER_ROLES)[number];
};

export const loginRequestRuntimeSchema = createRuntimeSchema<LoginRequestDto>((value) => {
  const payload = expectObject(value);
  const email = expectNonEmptyString(payload.email, 'email');
  const password = expectNonEmptyString(payload.password, 'password');

  if (!isEmailLike(email)) {
    throw new SharedRuntimeSchemaError('Valid email is required');
  }

  return {
    email,
    password
  };
});

export const registerRequestRuntimeSchema = createRuntimeSchema<RegisterRequestDto>((value) => {
  const payload = expectObject(value);

  const normalized = {
    name: readRequiredString(payload, 'name'),
    email: readRequiredString(payload, 'email'),
    password: readRequiredString(payload, 'password'),
    position: readOptionalStrictString(payload, 'position'),
    department: readOptionalStrictString(payload, 'department')
  };

  const result: RegisterRequestDto = {
    name: normalized.name,
    email: normalized.email,
    password: normalized.password
  };

  if (normalized.position !== undefined) result.position = normalized.position;
  if (normalized.department !== undefined) result.department = normalized.department;

  return result;
});

export const adminRegisterRequestRuntimeSchema = createRuntimeSchema<AdminRegisterRequestDto>((value) => {
  const payload = expectObject(value);
  const rawRole = readOptionalStrictString(payload, 'role');
  const role = rawRole === undefined ? undefined : normalizeProductUserRoleInput(rawRole);

  if (rawRole !== undefined && role === null) {
    throw new SharedRuntimeSchemaError('Invalid role');
  }

  const normalized = {
    name: readRequiredString(payload, 'name'),
    email: readRequiredString(payload, 'email'),
    password: readRequiredString(payload, 'password'),
    role: role ?? undefined,
    position: readOptionalStrictString(payload, 'position'),
    department: readOptionalStrictString(payload, 'department'),
    skills: readOptionalStringArray(payload, 'skills')
  };

  const result: AdminRegisterRequestDto = {
    name: normalized.name,
    email: normalized.email,
    password: normalized.password
  };

  if (normalized.role !== undefined) result.role = normalized.role;
  if (normalized.position !== undefined) result.position = normalized.position;
  if (normalized.department !== undefined) result.department = normalized.department;
  if (normalized.skills !== undefined) result.skills = normalized.skills;

  return result;
});

export const updateTaskStatusRequestRuntimeSchema =
  createRuntimeSchema<UpdateTaskStatusRequestDto>((value) => {
    const payload = expectObject(value);
    const status = expectNonEmptyString(payload.status, 'status');

    if (!TASK_STATUSES.includes(status as UpdateTaskStatusRequestDto['status'])) {
      throw new SharedRuntimeSchemaError('Invalid status');
    }

    return { status: status as UpdateTaskStatusRequestDto['status'] };
  });

export const createTaskRequestRuntimeSchema =
  createRuntimeSchema<CreateTaskRequestDto>((value) => {
    const payload = expectObject(value);

    const normalized = {
      title: readRequiredString(payload, 'title'),
      description: readOptionalStrictString(payload, 'description'),
      priority: readOptionalEnum(payload, 'priority', TASK_PRIORITIES),
      status: readOptionalEnum(payload, 'status', TASK_STATUSES),
      startDate: readOptionalStrictString(payload, 'startDate'),
      dueDate: readOptionalStrictString(payload, 'dueDate'),
      departmentId: readOptionalString(payload, 'departmentId', { allowNull: true }),
      assigneeIds: readOptionalStringArray(payload, 'assigneeIds')
    };

    const result: CreateTaskRequestDto = { title: normalized.title };

    if (normalized.description !== undefined) result.description = normalized.description;
    if (normalized.priority !== undefined) result.priority = normalized.priority;
    if (normalized.status !== undefined) result.status = normalized.status;
    if (normalized.startDate !== undefined) result.startDate = normalized.startDate;
    if (normalized.dueDate !== undefined) result.dueDate = normalized.dueDate;
    if (normalized.departmentId !== undefined) result.departmentId = normalized.departmentId;
    if (normalized.assigneeIds !== undefined) result.assigneeIds = normalized.assigneeIds;

    return result;
  });

export const updateTaskRequestRuntimeSchema =
  createRuntimeSchema<UpdateTaskRequestDto>((value) => {
    const payload = expectObject(value);

    const normalized = {
      title: readOptionalString(payload, 'title'),
      description: readOptionalString(payload, 'description', { allowNull: true }),
      priority: readOptionalEnum(payload, 'priority', TASK_PRIORITIES),
      startDate: readOptionalString(payload, 'startDate', { allowNull: true }),
      dueDate: readOptionalString(payload, 'dueDate', { allowNull: true }),
      progress: readOptionalNumber(payload, 'progress'),
      departmentId: readOptionalString(payload, 'departmentId', { allowNull: true }),
      requesterCloseRequired: readOptionalBoolean(payload, 'requesterCloseRequired'),
      assigneeIds: readOptionalStringArray(payload, 'assigneeIds')
    };

    return Object.fromEntries(
      Object.entries(normalized).filter(([, fieldValue]) => fieldValue !== undefined)
    ) as UpdateTaskRequestDto;
  });

export const updateUserRoleRequestRuntimeSchema =
  createRuntimeSchema<UpdateUserRoleRequestDto>((value) => {
    const payload = expectObject(value);
    const rawRole = expectNonEmptyString(payload.role, 'role');
    const role = normalizeProductUserRoleInput(rawRole);

    if (!role) {
      throw new SharedRuntimeSchemaError('Invalid role');
    }

    return { role };
  });

export const updateUserProfileRequestRuntimeSchema =
  createRuntimeSchema<UpdateUserProfileRequestDto>((value) => {
    const payload = expectObject(value);

    const normalized = {
      name: readOptionalString(payload, 'name'),
      email: readOptionalString(payload, 'email'),
      password: readOptionalString(payload, 'password'),
      position: readOptionalString(payload, 'position', { allowNull: true }),
      department: readOptionalString(payload, 'department', { allowNull: true }),
      skills: undefined as UpdateUserProfileRequestDto['skills']
    };

    if (Object.prototype.hasOwnProperty.call(payload, 'skills')) {
      if (payload.skills !== null && !Array.isArray(payload.skills)) {
        throw new SharedRuntimeSchemaError('skills must be an array or null');
      }

      normalized.skills = payload.skills === null ? null : [...payload.skills];
    }

    return Object.fromEntries(
      Object.entries(normalized).filter(([, fieldValue]) => fieldValue !== undefined)
    ) as UpdateUserProfileRequestDto;
  });
