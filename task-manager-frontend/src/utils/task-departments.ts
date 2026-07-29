import type { DepartmentSummary, SessionUser } from '../types';

export interface TaskDepartmentOption {
  id: string;
  name: string;
  isPrimary: boolean;
}

const getMembershipTaskDepartmentOptions = (user: SessionUser | null | undefined): TaskDepartmentOption[] => {
  const memberships = Array.isArray(user?.departmentMemberships) ? user.departmentMemberships : [];
  const seen = new Set<string>();

  return memberships
    .map((membership) => ({
      id: membership.department?.id ?? '',
      name: membership.department?.name?.trim() ?? '',
      isPrimary: Boolean(membership.isPrimary),
    }))
    .filter((membership) => membership.id && membership.name)
    .filter((membership) => {
      if (seen.has(membership.id)) {
        return false;
      }
      seen.add(membership.id);
      return true;
    })
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
};

export const getTaskDepartmentOptions = (
  user: SessionUser | null | undefined,
  departments?: DepartmentSummary[] | null
): TaskDepartmentOption[] => {
  const membershipOptions = getMembershipTaskDepartmentOptions(user);

  if (!Array.isArray(departments)) {
    return membershipOptions;
  }

  const membershipById = new Map(membershipOptions.map((membership) => [membership.id, membership]));
  const seen = new Set<string>();

  return departments
    .map((department) => ({
      id: department.id ?? '',
      name: department.name?.trim() ?? '',
      isPrimary: Boolean(department.id && membershipById.get(department.id)?.isPrimary),
    }))
    .filter((department) => department.id && department.name)
    .filter((department) => {
      if (seen.has(department.id)) {
        return false;
      }
      seen.add(department.id);
      return true;
    })
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
};

export const getDefaultTaskDepartmentId = (options: TaskDepartmentOption[]) =>
  options.find((option) => option.isPrimary)?.id ?? (options.length === 1 ? options[0].id : '');
