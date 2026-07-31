import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { UserCard } from '../components/ui/UserCard';
import { DataState } from '../components/ui/DataState';
import { Modal } from '../components/ui/Modal';
import { Tabs } from '../components/ui/Tabs';
import { useAuth } from '../contexts/AuthContext';
import { authApi, departmentsApi, usersApi } from '../api';
import type { AdminRegisterRequest, DepartmentSummary, ManagedDepartment, TeamUser, UserRole } from '../types';
import { getRoleLabel } from '../utils';
import { Eye, EyeOff, Sparkles } from 'lucide-react';

type ManagedRole = 'ADMIN' | 'AGENT' | 'REQUESTER';
type RoleDraft = ManagedRole | 'VIEWER';
type AccessFilter = 'all' | 'active' | 'inactive';

const toManagedRole = (role?: UserRole): RoleDraft => {
  if (role === 'ADMIN') {
    return 'ADMIN';
  }

  if (role === 'REQUESTER') {
    return 'REQUESTER';
  }

  if (role === 'VIEWER') {
    return 'VIEWER';
  }

  return 'AGENT';
};

const getDepartmentLabel = (user: {
  department?: string | null;
  primaryDepartment?: {
    name?: string | null;
  } | null;
  departmentMemberships?: Array<{
    isPrimary?: boolean;
    department: {
      name?: string | null;
    };
  }>;
}) => {
  const primaryDepartmentName = user.primaryDepartment?.name?.trim();
  if (primaryDepartmentName) {
    return primaryDepartmentName;
  }

  if (user.department?.trim()) {
    return user.department.trim();
  }

  const primaryMembershipName = Array.isArray(user.departmentMemberships)
    ? user.departmentMemberships
        .find((membership) => membership.isPrimary)
        ?.department?.name?.trim()
    : undefined;

  if (primaryMembershipName) {
    return primaryMembershipName;
  }

  return undefined;
};

const getEditableDepartmentValue = (user: {
  department?: string | null;
  primaryDepartment?: {
    name?: string | null;
  } | null;
  departmentMemberships?: Array<{
    isPrimary?: boolean;
    department?: {
      name?: string | null;
    } | null;
  }>;
}) => {
  const primaryDepartmentName = user.primaryDepartment?.name?.trim();
  if (primaryDepartmentName) {
    return primaryDepartmentName;
  }

  if (user.department?.trim()) {
    return user.department.trim();
  }

  const membershipDepartmentName = Array.isArray(user.departmentMemberships)
    ? user.departmentMemberships
        .filter((membership) => membership.isPrimary)
        .map((membership) => membership.department?.name?.trim())
        .find((name): name is string => Boolean(name))
    : undefined;

  return membershipDepartmentName || '';
};

const parseSkillsDraft = (value: string) => {
  const seen = new Set<string>();

  const normalizedSkills = value
    .split(/[\n,]/)
    .map((skill) => skill.trim())
    .filter(Boolean)
    .filter((skill) => {
      const normalizedSkill = skill.toLowerCase();
      if (seen.has(normalizedSkill)) {
        return false;
      }
      seen.add(normalizedSkill);
      return true;
    });

  return normalizedSkills.length > 0 ? normalizedSkills : null;
};

const MANAGED_ROLE_OPTIONS: ManagedRole[] = [
  'ADMIN',
  'AGENT',
  'REQUESTER',
];

const PRIVILEGED_ROLES = new Set<UserRole>(['ADMIN']);

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error !== 'object' || error === null) {
    return fallback;
  }

  const response = (error as {
    response?: {
      data?: {
        error?: string;
        message?: string;
        errors?: Array<{ msg?: string; message?: string }>;
      };
    };
  }).response;
  const firstValidationError = response?.data?.errors?.[0];
  return response?.data?.error
    || response?.data?.message
    || firstValidationError?.msg
    || firstValidationError?.message
    || fallback;
};

const getDeleteConfirmationMessage = (userName: string) =>
  [
    `Удалить сотрудника ${userName} из структуры компании?`,
    'Аккаунт будет отключён и отвязан от отделов, команд и текущих назначений.',
    'История заявок, переписка и финансовые данные сохранятся.',
  ].join(' ');

const getDepartmentDeleteConfirmationMessage = (departmentName: string) =>
  [
    `Удалить отдел ${departmentName}?`,
    'Удаление доступно только для отделов без сотрудников, заявок и руководителя.',
    'Это действие нельзя отменить.',
  ].join(' ');

const getDepartmentUsageSummary = (department: ManagedDepartment) => {
  const parts: string[] = [];

  if (department.membershipCount > 0) {
    parts.push(`сотрудники (${department.membershipCount})`);
  }

  if (department.taskCount > 0) {
    parts.push(`заявки (${department.taskCount})`);
  }

  if (department.legacyUserCount > 0) {
      parts.push(`связи прежней версии (${department.legacyUserCount})`);
  }

  if (department.headUser) {
    parts.push(`руководитель: ${department.headUser.name}`);
  }

  return parts.length > 0
    ? `Удаление недоступно: ${parts.join(', ')}.`
    : 'Отдел можно удалить безопасно.';
};

export const TeamPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { users, loadingUsers, usersError, fetchUsers } = useAppStore();
  const [selectedUser, setSelectedUser] = useState<TeamUser | null>(null);
  const [availableDepartments, setAvailableDepartments] = useState<DepartmentSummary[] | null>(null);
  const [managedDepartments, setManagedDepartments] = useState<ManagedDepartment[] | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [roleDraft, setRoleDraft] = useState<RoleDraft>('AGENT');
  const [departmentDraft, setDepartmentDraft] = useState('');
  const [positionDraft, setPositionDraft] = useState('');
  const [skillsDraft, setSkillsDraft] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [pageMessage, setPageMessage] = useState('');
  const [departmentAdminError, setDepartmentAdminError] = useState('');
  const [departmentAdminSuccess, setDepartmentAdminSuccess] = useState('');
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [editingDepartmentId, setEditingDepartmentId] = useState<string | null>(null);
  const [editingDepartmentName, setEditingDepartmentName] = useState('');
  const [departmentActionId, setDepartmentActionId] = useState<string | null>(null);
  const [loadingManagedDepartments, setLoadingManagedDepartments] = useState(false);
  const [isCreatingDepartment, setIsCreatingDepartment] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [temporaryPasswordConfirm, setTemporaryPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('active');
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createRole, setCreateRole] = useState<ManagedRole>('REQUESTER');
  const [createPosition, setCreatePosition] = useState('');
  const [createDepartment, setCreateDepartment] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [activeSection, setActiveSection] = useState<'users' | 'departments'>('users');
  const isAdmin = currentUser?.role === 'ADMIN';

  const loadAvailableDepartments = async () => {
    try {
      const departments = await departmentsApi.getAll();
      setAvailableDepartments(departments);
      return departments;
    } catch {
      setAvailableDepartments(null);
      return null;
    }
  };

  const loadManagedDepartments = async () => {
    if (!isAdmin) {
      setManagedDepartments(null);
      setDepartmentAdminError('');
      return null;
    }

    setLoadingManagedDepartments(true);

    try {
      const departments = await departmentsApi.getManaged();
      setManagedDepartments(departments);
      setDepartmentAdminError('');
      return departments;
    } catch (error) {
      setManagedDepartments(null);
      setDepartmentAdminError(getApiErrorMessage(error, 'Не удалось загрузить список отделов.'));
      return null;
    } finally {
      setLoadingManagedDepartments(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!isAdmin) {
      setAvailableDepartments(null);
      setManagedDepartments(null);
      setDepartmentAdminError('');
      setDepartmentAdminSuccess('');
      return;
    }

    let isActive = true;

    Promise.all([
      departmentsApi.getAll().catch(() => null),
      departmentsApi.getManaged().catch((error) => error),
    ]).then(([activeDepartments, managedDepartmentsResult]) => {
      if (!isActive) {
        return;
      }

      setAvailableDepartments(activeDepartments);

      if (managedDepartmentsResult instanceof Error) {
        setManagedDepartments(null);
        setDepartmentAdminError('Не удалось загрузить список отделов.');
      } else if (managedDepartmentsResult && typeof managedDepartmentsResult === 'object' && 'response' in managedDepartmentsResult) {
        setManagedDepartments(null);
        setDepartmentAdminError(getApiErrorMessage(managedDepartmentsResult, 'Не удалось загрузить список отделов.'));
      } else {
        setManagedDepartments(managedDepartmentsResult);
        setDepartmentAdminError('');
      }

      setLoadingManagedDepartments(false);
    });

    setLoadingManagedDepartments(true);

    return () => {
      isActive = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedUser) {
      setActionError('');
      setActionSuccess('');
      setNameDraft('');
      setEmailDraft('');
      setDepartmentDraft('');
      setPositionDraft('');
      setSkillsDraft('');
      return;
    }

    setRoleDraft(toManagedRole(selectedUser.role));
    setNameDraft(selectedUser.name || '');
    setEmailDraft(selectedUser.email || '');
    setDepartmentDraft(getEditableDepartmentValue(selectedUser));
    setPositionDraft(selectedUser.position || '');
    setSkillsDraft(Array.isArray(selectedUser.skills) ? selectedUser.skills.join(', ') : '');
    setActionError('');
    setActionSuccess('');
  }, [selectedUser]);

  const departmentOptions = useMemo(() => {
    const options = Array.isArray(availableDepartments)
      ? availableDepartments
          .map((department) => department.name?.trim())
          .filter((name): name is string => Boolean(name))
      : [];

    const currentValue = selectedUser ? getEditableDepartmentValue(selectedUser) : '';
    if (currentValue && !options.includes(currentValue)) {
      options.unshift(currentValue);
    }

    return [...new Set(options)];
  }, [availableDepartments, selectedUser]);

  const selectedUserSkills = useMemo(() => {
    if (!selectedUser || !Array.isArray(selectedUser.skills) || selectedUser.skills.length === 0) {
      return 'Не указаны';
    }

    return selectedUser.skills.join(', ');
  }, [selectedUser]);

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return users.filter((teamUser) => {
      if (accessFilter === 'active' && !teamUser.isActive) return false;
      if (accessFilter === 'inactive' && teamUser.isActive) return false;
      if (!needle) return true;

      return [teamUser.name, teamUser.email, teamUser.position, getDepartmentLabel(teamUser)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [accessFilter, search, users]);

  const isSelf = selectedUser?.id === currentUser?.id;
  const isDepartmentActionPending = Boolean(departmentActionId) || isCreatingDepartment;

  const handleCloseModal = () => {
    if (isSavingRole || isSavingStatus || isSavingPassword || isDeleting) {
      return;
    }

    setPasswordOpen(false);
    setTemporaryPassword('');
    setTemporaryPasswordConfirm('');
    setPasswordError('');
    setSelectedUser(null);
  };

  const closePasswordModal = () => {
    if (isSavingPassword) return;
    setPasswordOpen(false);
    setTemporaryPassword('');
    setTemporaryPasswordConfirm('');
    setPasswordError('');
  };

  const openPasswordModal = () => {
    setTemporaryPassword('');
    setTemporaryPasswordConfirm('');
    setPasswordError('');
    setPasswordOpen(true);
  };

  const handleTemporaryPasswordSave = async () => {
    if (!selectedUser) return;
    if (temporaryPassword.length < 10) {
      setPasswordError('Временный пароль должен содержать минимум 10 символов.');
      return;
    }
    if (temporaryPassword !== temporaryPasswordConfirm) {
      setPasswordError('Пароли не совпадают. Проверьте оба поля.');
      return;
    }

    setIsSavingPassword(true);
    setPasswordError('');
    try {
      const response = await usersApi.updatePassword(selectedUser.id, { password: temporaryPassword });
      setPasswordOpen(false);
      setTemporaryPassword('');
      setTemporaryPasswordConfirm('');
      setPasswordError('');
      setActionError('');
      setActionSuccess(response.message || 'Временный пароль установлен. Все предыдущие сессии пользователя отозваны.');
    } catch (error) {
      setPasswordError(getApiErrorMessage(error, 'Не удалось установить временный пароль.'));
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleRoleSave = async () => {
    if (!selectedUser) {
      return;
    }

    if (isSelf) {
      setActionError('Нельзя менять роль текущей учётной записи администратора из этого экрана.');
      return;
    }

    if (roleDraft === selectedUser.role) {
      setActionSuccess('Роль уже установлена.');
      return;
    }

    if (roleDraft === 'VIEWER') {
      setActionError('Архивную роль наблюдателя нельзя назначить заново. Выберите рабочую роль пользователя.');
      return;
    }

    const requiresExtraConfirmation = PRIVILEGED_ROLES.has(selectedUser.role) || PRIVILEGED_ROLES.has(roleDraft);
    if (requiresExtraConfirmation) {
      const confirmed = window.confirm(
        `Изменить роль пользователя ${selectedUser.name} с «${getRoleLabel(selectedUser.role)}» на «${getRoleLabel(roleDraft)}»?`
      );
      if (!confirmed) {
        return;
      }
    }

    setIsSavingRole(true);
    setActionError('');
    setActionSuccess('');

    try {
      await usersApi.updateRole(selectedUser.id, roleDraft);
      setSelectedUser((current) => (current ? { ...current, role: roleDraft } : current));
      await fetchUsers();
      setActionSuccess('Роль пользователя обновлена.');
    } catch (error) {
      setActionError(getApiErrorMessage(error, 'Не удалось изменить роль пользователя.'));
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleProfileSave = async () => {
    if (!selectedUser) {
      return;
    }

    setIsSavingProfile(true);
    setActionError('');
    setActionSuccess('');

    try {
      await usersApi.updateProfile(selectedUser.id, {
        name: nameDraft.trim(),
        email: emailDraft.trim().toLowerCase(),
        department: departmentDraft.trim() ? departmentDraft.trim() : null,
        position: positionDraft.trim() ? positionDraft.trim() : null,
        skills: parseSkillsDraft(skillsDraft),
      });

      const [, refreshedUser] = await Promise.all([
        fetchUsers(),
        usersApi.getById(selectedUser.id),
      ]);

      setSelectedUser((current) => (current ? { ...current, ...refreshedUser } : current));
      setActionSuccess('Данные сотрудника обновлены.');
    } catch (error) {
      setActionError(getApiErrorMessage(error, 'Не удалось сохранить данные сотрудника.'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const resetCreateForm = () => {
    setCreateName('');
    setCreateEmail('');
    setCreatePassword('');
    setShowCreatePassword(false);
    setCreateRole('REQUESTER');
    setCreatePosition('');
    setCreateDepartment('');
    setCreateError('');
  };

  const handleCreateUser = async () => {
    if (createName.trim().length < 2) {
      setCreateError('Имя сотрудника должно содержать минимум 2 символа.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createEmail.trim())) {
      setCreateError('Укажите имя и рабочую электронную почту сотрудника.');
      return;
    }
    if (createPassword.length < 10) {
      setCreateError('Временный пароль должен содержать минимум 10 символов.');
      return;
    }

    const payload: AdminRegisterRequest = {
      name: createName.trim(),
      email: createEmail.trim().toLowerCase(),
      password: createPassword,
      role: createRole,
    };
    if (createPosition.trim()) payload.position = createPosition.trim();
    if (createDepartment.trim()) payload.department = createDepartment.trim();

    setIsCreatingUser(true);
    setCreateError('');
    try {
      const response = await authApi.registerAdmin(payload);
      await fetchUsers();
      setCreateOpen(false);
      resetCreateForm();
      setPageMessage(`Учётная запись «${response.user.name}» создана. Передайте сотруднику временный пароль безопасным способом.`);
    } catch (error) {
      const message = getApiErrorMessage(error, 'Не удалось создать учётную запись.');
      setCreateError(message === 'Email already exists' ? 'Пользователь с такой электронной почтой уже существует.' : message);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const generateTemporaryPassword = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const randomValues = window.crypto.getRandomValues(new Uint32Array(14));
    const generated = Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('');
    setCreatePassword(generated);
    setShowCreatePassword(true);
    setCreateError('');
  };

  const handleToggleUserStatus = async () => {
    if (!selectedUser) return;
    if (isSelf && selectedUser.isActive) {
      setActionError('Нельзя отключить текущую учётную запись администратора.');
      return;
    }

    const nextIsActive = !selectedUser.isActive;
    if (!nextIsActive && !window.confirm(`Отключить доступ пользователю ${selectedUser.name}? Активные сессии будут отозваны.`)) {
      return;
    }

    setIsSavingStatus(true);
    setActionError('');
    setActionSuccess('');
    try {
      const response = await usersApi.updateStatus(selectedUser.id, nextIsActive);
      setSelectedUser((current) => current ? { ...current, isActive: response.user.isActive } : current);
      await fetchUsers();
      setActionSuccess(response.message);
    } catch (error) {
      setActionError(getApiErrorMessage(error, 'Не удалось изменить доступ пользователя.'));
    } finally {
      setIsSavingStatus(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) {
      return;
    }

    if (isSelf) {
      setActionError('Нельзя удалить текущую учётную запись администратора.');
      return;
    }

    const confirmed = window.confirm(getDeleteConfirmationMessage(selectedUser.name));
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setActionError('');
    setActionSuccess('');

    try {
      const response = (await usersApi.archive(selectedUser.id)) as { message?: string };
      await fetchUsers();
      setSelectedUser(null);
      setPageMessage(response?.message || `Сотрудник «${selectedUser.name}» удалён из структуры компании.`);
    } catch (error) {
      setActionError(getApiErrorMessage(error, 'Не удалось удалить пользователя.'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateDepartment = async () => {
    const trimmedName = newDepartmentName.trim();
    if (!trimmedName) {
      setDepartmentAdminError('Укажите название отдела.');
      setDepartmentAdminSuccess('');
      return;
    }

    setIsCreatingDepartment(true);
    setDepartmentAdminError('');
    setDepartmentAdminSuccess('');

    try {
      const createdDepartment = await departmentsApi.create({ name: trimmedName });
      await Promise.all([
        loadAvailableDepartments(),
        loadManagedDepartments(),
      ]);
      setNewDepartmentName('');
      setDepartmentAdminSuccess(`Отдел «${createdDepartment.name}» создан.`);
    } catch (error) {
      setDepartmentAdminError(getApiErrorMessage(error, 'Не удалось создать отдел.'));
    } finally {
      setIsCreatingDepartment(false);
    }
  };

  const startDepartmentRename = (department: ManagedDepartment) => {
    setEditingDepartmentId(department.id);
    setEditingDepartmentName(department.name);
    setDepartmentAdminError('');
    setDepartmentAdminSuccess('');
  };

  const cancelDepartmentRename = () => {
    setEditingDepartmentId(null);
    setEditingDepartmentName('');
  };

  const handleRenameDepartment = async (department: ManagedDepartment) => {
    const trimmedName = editingDepartmentName.trim();
    if (!trimmedName) {
      setDepartmentAdminError('Укажите название отдела.');
      setDepartmentAdminSuccess('');
      return;
    }

    if (trimmedName === department.name) {
      cancelDepartmentRename();
      return;
    }

    setDepartmentActionId(department.id);
    setDepartmentAdminError('');
    setDepartmentAdminSuccess('');

    try {
      const updatedDepartment = await departmentsApi.update(department.id, { name: trimmedName });
      await Promise.all([
        fetchUsers(),
        loadAvailableDepartments(),
        loadManagedDepartments(),
      ]);
      cancelDepartmentRename();
      setDepartmentAdminSuccess(`Отдел «${updatedDepartment.name}» переименован.`);
    } catch (error) {
      setDepartmentAdminError(getApiErrorMessage(error, 'Не удалось обновить отдел.'));
    } finally {
      setDepartmentActionId(null);
    }
  };

  const handleToggleDepartmentStatus = async (department: ManagedDepartment) => {
    const nextIsActive = !department.isActive;
    const confirmationMessage = nextIsActive
      ? `Снова сделать отдел «${department.name}» активным? Он появится в списках выбора для новых назначений.`
      : `Отключить отдел «${department.name}»? Он исчезнет из списков выбора для новых назначений, но исторические связи сохранятся.`;

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    setDepartmentActionId(department.id);
    setDepartmentAdminError('');
    setDepartmentAdminSuccess('');

    try {
      await departmentsApi.update(department.id, { isActive: nextIsActive });
      await Promise.all([
        loadAvailableDepartments(),
        loadManagedDepartments(),
      ]);
      setDepartmentAdminSuccess(
        nextIsActive
          ? `Отдел «${department.name}» снова активен.`
          : `Отдел «${department.name}» отключён для новых назначений.`
      );
    } catch (error) {
      setDepartmentAdminError(getApiErrorMessage(error, 'Не удалось обновить статус отдела.'));
    } finally {
      setDepartmentActionId(null);
    }
  };

  const handleDeleteDepartment = async (department: ManagedDepartment) => {
    const confirmed = window.confirm(
      department.canDelete
        ? getDepartmentDeleteConfirmationMessage(department.name)
        : [
            `Удалить отдел «${department.name}» и снять все его связи?`,
            getDepartmentUsageSummary(department),
            'Сотрудники и заявки сохранятся без привязки к этому отделу.',
          ].join(' ')
    );
    if (!confirmed) {
      return;
    }

    setDepartmentActionId(department.id);
    setDepartmentAdminError('');
    setDepartmentAdminSuccess('');

    try {
      const response = await departmentsApi.deleteManaged(department.id, { detach: !department.canDelete });
      await Promise.all([
        loadAvailableDepartments(),
        loadManagedDepartments(),
      ]);
      if (editingDepartmentId === department.id) {
        cancelDepartmentRename();
      }
      setDepartmentAdminSuccess(response.message || `Отдел «${department.name}» удалён.`);
    } catch (error) {
      setDepartmentAdminError(getApiErrorMessage(error, 'Не удалось удалить отдел.'));
    } finally {
      setDepartmentActionId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Пользователи</h1>
          <p className="page-subtitle mt-1">Учётные записи сотрудников, роли и управление доступом к ServiceDesk.</p>
        </div>
        {isAdmin && activeSection === 'users' && (
          <button type="button" className="btn btn-primary" onClick={() => { resetCreateForm(); setCreateOpen(true); }} data-testid="team-create-user">
            Создать сотрудника
          </button>
        )}
      </div>

      {isAdmin && (
        <Tabs
          value={activeSection}
          onChange={(value) => setActiveSection(value as 'users' | 'departments')}
          ariaLabel="Управление пользователями"
          tabs={[
            { key: 'users', label: 'Сотрудники и роли' },
            { key: 'departments', label: 'Отделы компании' },
          ]}
        />
      )}

      {(!isAdmin || activeSection === 'users') && (
        <section className="space-y-4" data-testid="team-users-section">
      <div className="rounded-[14px] border border-[#e3e3e3] bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-center">
          <input
            className="input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по имени, почте, должности или отделу"
            data-testid="team-user-search"
          />
          <select className="input" value={accessFilter} onChange={(event) => setAccessFilter(event.target.value as AccessFilter)} data-testid="team-access-filter">
            <option value="all">Все учётные записи</option>
            <option value="active">Только активные</option>
            <option value="inactive">Только отключённые</option>
          </select>
          <div className="chip whitespace-nowrap">Показано: {filteredUsers.length} из {users.length}</div>
        </div>
      </div>
      {pageMessage && (
        <div className="rounded-[12px] border border-[#b8e4c6] bg-[#eef9f2] px-4 py-3 text-sm text-[#1f7a42]">
          {pageMessage}
        </div>
      )}
      {loadingUsers ? (
        <DataState variant="loading" message="Загружаем пользователей..." />
      ) : usersError ? (
        <DataState variant="error" message={usersError} />
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
           {filteredUsers.map((u) => (
             <UserCard
               key={u.id}
               name={u.name}
               avatar={u.avatar}
               role={getRoleLabel(u.role)}
               done={u.doneTasks ?? 0}
               total={(u.doneTasks ?? 0) + (u.inProgressTasks ?? 0) || 1}
               extraTop={getDepartmentLabel(u)}
               skills={Array.isArray(u.skills) ? u.skills.join(', ') : ''}
               isActive={u.isActive}
               onClick={() => setSelectedUser(u)}
             />
           ))}
          {filteredUsers.length === 0 && (
            <DataState variant="empty" message={users.length === 0 ? 'Список команды пока пуст. Создайте первую учётную запись сотрудника.' : 'По выбранным условиям сотрудники не найдены.'} />
          )}
        </div>
      )}
        </section>
      )}

      {isAdmin && activeSection === 'departments' && (
        <section className="rounded-[16px] border border-[#e3e3e3] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]" data-testid="team-departments-section">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#1f1f1f]">Отделы</h2>
              <p className="mt-1 max-w-[760px] text-sm text-[#6b6b6b]">
                Создавайте новые отделы, переименовывайте рабочие названия и отключайте устаревшие. Неактивные отделы скрываются из обычных
                списков выбора, но исторические данные сохраняются.
              </p>
            </div>
            <div className="chip">{managedDepartments?.length ?? 0} отделов</div>
          </div>

          <div className="mt-4 rounded-[12px] border border-[#e6e6e6] bg-[#fafafa] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Новый отдел</label>
                <input
                  className="input w-full"
                  value={newDepartmentName}
                  onChange={(event) => setNewDepartmentName(event.target.value)}
                  placeholder="Например, Отдел продаж"
                  disabled={isDepartmentActionPending}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreateDepartment}
                disabled={isDepartmentActionPending}
              >
                {isCreatingDepartment ? 'Создаём...' : 'Создать отдел'}
              </button>
            </div>
          </div>

          {(departmentAdminError || departmentAdminSuccess) && (
            <div
              className={`mt-4 rounded-[10px] px-3 py-2 text-sm ${
                departmentAdminError
                  ? 'border border-[#f3c4c4] bg-[#fff4f4] text-[#b23b3b]'
                  : 'border border-[#b8e4c6] bg-[#eef9f2] text-[#1f7a42]'
              }`}
            >
              {departmentAdminError || departmentAdminSuccess}
            </div>
          )}

          <div className="mt-4">
            {loadingManagedDepartments ? (
              <DataState variant="loading" message="Загружаем отделы..." />
            ) : departmentAdminError && !managedDepartments ? (
              <DataState variant="error" message={departmentAdminError} />
            ) : managedDepartments && managedDepartments.length > 0 ? (
              <div className="space-y-3">
                {managedDepartments.map((department) => {
                  const isEditingDepartment = editingDepartmentId === department.id;
                  const isBusy = departmentActionId === department.id;

                  return (
                    <div key={department.id} className="rounded-[12px] border border-[#e6e6e6] bg-[#fcfcfc] p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          {isEditingDepartment ? (
                            <div className="max-w-[420px]">
                              <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Название отдела</label>
                              <input
                                className="input w-full"
                                value={editingDepartmentName}
                                onChange={(event) => setEditingDepartmentName(event.target.value)}
                                disabled={isBusy}
                              />
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold text-[#1f1f1f]">{department.name}</h3>
                              <span
                                className={`rounded-[10px] px-2.5 py-1 text-xs font-medium ${
                                  department.isActive
                                    ? 'border border-[#b8e4c6] bg-[#eef9f2] text-[#1f7a42]'
                                    : 'border border-[#e7d8a7] bg-[#fff9e8] text-[#8b6a16]'
                                }`}
                              >
                                {department.isActive ? 'Активен' : 'Неактивен'}
                              </span>
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#6b6b6b]">
                            <span className="chip">Сотрудники: {department.membershipCount}</span>
                            <span className="chip">Заявки: {department.taskCount}</span>
                            <span className="chip">Связи прежней версии: {department.legacyUserCount}</span>
                            <span className="chip">
                              Руководитель: {department.headUser ? department.headUser.name : 'не назначен'}
                            </span>
                          </div>

                          <p className="mt-3 text-sm text-[#6b6b6b]">
                            {department.isActive
                              ? 'Отдел доступен для новых назначений и выбора в формах.'
                              : 'Отдел скрыт из обычных списков выбора, но сохраняется для истории и существующих данных.'}
                          </p>
                          {!department.canDelete && (
                            <p className="mt-2 text-sm text-[#8b6a16]">{getDepartmentUsageSummary(department)}</p>
                          )}
                          {department.members && department.members.length > 0 ? (
                            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                              {department.members.slice(0, 9).map((member) => (
                                <div key={member.id} className="rounded-[10px] border border-[#e6e6e6] bg-white px-3 py-2 text-sm">
                                  <p className="font-medium text-[#1f1f1f]">{member.name}</p>
                                  <p className="truncate text-xs text-[#6b6b6b]">{member.email}</p>
                                  <p className="mt-1 text-xs text-[#8a8a8a]">
                                    {getRoleLabel(member.role)}{member.isPrimary ? ' · основной отдел' : ''}{member.isActive ? '' : ' · доступ отключён'}
                                  </p>
                                </div>
                              ))}
                              {department.members.length > 9 && (
                                <div className="rounded-[10px] border border-dashed border-[#d7d7d7] bg-white px-3 py-2 text-sm text-[#6b6b6b]">
                                  Ещё сотрудников: {department.members.length - 9}
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-[#8a8a8a]">В отделе пока нет сотрудников.</p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 lg:max-w-[320px] lg:justify-end">
                          {isEditingDepartment ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => handleRenameDepartment(department)}
                                disabled={isBusy}
                              >
                                {isBusy ? 'Сохраняем...' : 'Сохранить'}
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={cancelDepartmentRename}
                                disabled={isBusy}
                              >
                                Отмена
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn"
                                onClick={() => startDepartmentRename(department)}
                                disabled={isDepartmentActionPending}
                              >
                                Переименовать
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() => handleToggleDepartmentStatus(department)}
                                disabled={isDepartmentActionPending}
                              >
                                {isBusy
                                  ? 'Сохраняем...'
                                  : department.isActive
                                    ? 'Отключить'
                                    : 'Включить'}
                              </button>
                              <button
                                type="button"
                                className="btn border-[#efc1c1] text-[#b23b3b] hover:bg-[#fff4f4]"
                                onClick={() => handleDeleteDepartment(department)}
                                disabled={isDepartmentActionPending}
                                title={department.canDelete ? undefined : `Удалить с безопасной отвязкой: ${getDepartmentUsageSummary(department)}`}
                              >
                                {isBusy ? 'Удаляем...' : 'Удалить'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <DataState
                variant="empty"
                message="Список отделов пока пуст. Создайте первый рабочий отдел, чтобы использовать его в назначениях и профилях сотрудников."
              />
            )}
          </div>
        </section>
      )}

      <Modal
        open={isAdmin && createOpen}
        onClose={() => {
          if (!isCreatingUser) setCreateOpen(false);
        }}
        title="Создать сотрудника"
        testId="team-create-user-modal"
      >
        <div className="space-y-4">
          <div className="rounded-[10px] border border-[#e3e3e3] bg-[#fafafa] px-3 py-2 text-sm text-[#656565]">
            Создайте рабочую учётную запись и передайте временный пароль сотруднику безопасным способом. После первого входа пароль можно заменить в профиле.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-[#4a4a4a]">Имя *</label>
              <input className="input w-full" value={createName} onChange={(event) => { setCreateName(event.target.value); setCreateError(''); }} data-testid="team-create-name" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[#4a4a4a]">Рабочая почта *</label>
              <input type="email" className="input w-full" value={createEmail} onChange={(event) => { setCreateEmail(event.target.value); setCreateError(''); }} data-testid="team-create-email" />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-sm text-[#4a4a4a]" htmlFor="team-create-password">Временный пароль *</label>
                <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-[#4f4f4f] hover:underline" onClick={generateTemporaryPassword}>
                  <Sparkles size={13} />
                  Сгенерировать
                </button>
              </div>
              <div className="relative">
                <input
                  id="team-create-password"
                  type={showCreatePassword ? 'text' : 'password'}
                  minLength={10}
                  autoComplete="new-password"
                  className="input w-full pr-10"
                  value={createPassword}
                  onChange={(event) => {
                    setCreatePassword(event.target.value);
                    setCreateError('');
                  }}
                  data-testid="team-create-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#858585] hover:text-[#222]"
                  onClick={() => setShowCreatePassword((value) => !value)}
                  aria-label={showCreatePassword ? 'Скрыть пароль' : 'Показать пароль'}
                  title={showCreatePassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showCreatePassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <p className={`mt-1 text-xs ${createPassword.length > 0 && createPassword.length < 10 ? 'text-[#b23b3b]' : 'text-[#7a7a7a]'}`}>
                {createPassword.length === 0
                  ? 'Минимум 10 символов.'
                  : createPassword.length < 10
                    ? `Добавьте ещё ${10 - createPassword.length} симв.`
                    : 'Пароль подходит.'}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-[#4a4a4a]">Роль *</label>
              <select className="input w-full" value={createRole} onChange={(event) => setCreateRole(event.target.value as ManagedRole)} data-testid="team-create-role">
                {MANAGED_ROLE_OPTIONS.map((role) => <option key={role} value={role}>{getRoleLabel(role)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-[#4a4a4a]">Должность</label>
              <input className="input w-full" value={createPosition} onChange={(event) => setCreatePosition(event.target.value)} placeholder="Опционально" data-testid="team-create-position" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[#4a4a4a]">Отдел</label>
              <select className="input w-full" value={createDepartment} onChange={(event) => setCreateDepartment(event.target.value)} data-testid="team-create-department">
                <option value="">Без отдела</option>
                {departmentOptions.map((departmentName) => <option key={departmentName} value={departmentName}>{departmentName}</option>)}
              </select>
            </div>
          </div>
          {createError && <div className="rounded-[10px] border border-[#f3c4c4] bg-[#fff4f4] px-3 py-2 text-sm text-[#b23b3b]" role="alert" data-testid="team-create-error">{createError}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setCreateOpen(false)} disabled={isCreatingUser}>Отмена</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleCreateUser()}
              disabled={isCreatingUser}
              data-testid="team-create-submit"
            >
              {isCreatingUser ? 'Создаём...' : 'Создать учётную запись'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!selectedUser}
        onClose={handleCloseModal}
        title={selectedUser ? selectedUser.name : 'Карточка сотрудника'}
      >
        {selectedUser && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[12px] border border-[#e3e3e3] bg-[#fafafa] p-3">
                <p className="text-xs uppercase tracking-wide text-[#8a8a8a]">Электронная почта</p>
                <p className="mt-1 text-sm font-semibold text-[#1f1f1f] break-all">{selectedUser.email}</p>
              </div>
              <div className="rounded-[12px] border border-[#e3e3e3] bg-[#fafafa] p-3">
                <p className="text-xs uppercase tracking-wide text-[#8a8a8a]">Роль</p>
                <p className="mt-1 text-sm font-semibold text-[#1f1f1f]">{getRoleLabel(selectedUser.role)}</p>
              </div>
              <div className="rounded-[12px] border border-[#e3e3e3] bg-[#fafafa] p-3">
                <p className="text-xs uppercase tracking-wide text-[#8a8a8a]">Доступ</p>
                <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${selectedUser.isActive ? 'bg-[#eef9f2] text-[#1f7a42]' : 'bg-[#f0f0f0] text-[#666666]'}`} data-testid="team-user-status-badge">
                  {selectedUser.isActive ? 'Активен' : 'Отключён'}
                </span>
              </div>
              <div className="rounded-[12px] border border-[#e3e3e3] bg-[#fafafa] p-3">
                <p className="text-xs uppercase tracking-wide text-[#8a8a8a]">Текущий отдел</p>
                <p className="mt-1 text-sm font-semibold text-[#1f1f1f]">{getDepartmentLabel(selectedUser) || 'Не указан'}</p>
              </div>
              <div className="rounded-[12px] border border-[#e3e3e3] bg-[#fafafa] p-3">
                <p className="text-xs uppercase tracking-wide text-[#8a8a8a]">Должность</p>
                <p className="mt-1 text-sm font-semibold text-[#1f1f1f]">{selectedUser.position || 'Не указана'}</p>
              </div>
              <div className="rounded-[12px] border border-[#e3e3e3] bg-[#fafafa] p-3">
                <p className="text-xs uppercase tracking-wide text-[#8a8a8a]">Заявки</p>
                <p className="mt-1 text-sm font-semibold text-[#1f1f1f]">
                  {selectedUser.doneTasks ?? 0} завершено / {selectedUser.inProgressTasks ?? 0} в работе
                </p>
              </div>
            </div>

            <div className="rounded-[12px] border border-[#e3e3e3] bg-[#fafafa] p-3">
              <p className="text-xs uppercase tracking-wide text-[#8a8a8a]">Навыки</p>
              <p className="mt-1 text-sm text-[#1f1f1f]">{selectedUserSkills}</p>
            </div>

            {isAdmin ? (
              <div className="rounded-[12px] border border-dashed border-[#d7d7d7] bg-[#fcfcfc] p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#1f1f1f]">Управление учётной записью</p>
                    <p className="mt-1 text-xs text-[#8a8a8a]">Основное действие при увольнении или паузе в работе — отключить доступ, сохранив историю заявок.</p>
                  </div>
                  {isSelf && (
                    <span className="rounded-[10px] border border-[#e7d8a7] bg-[#fff9e8] px-3 py-1 text-xs text-[#8b6a16]">
                      Текущий администратор
                    </span>
                  )}
                </div>

                <div className="mt-4 rounded-[12px] border border-[#dfe5e1] bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#1f1f1f]">Доступ к системе</p>
                      <p className="mt-1 text-xs text-[#737373]">
                        {selectedUser.isActive
                          ? 'Пользователь может входить в ServiceDesk. Отключение отзовёт действующие сессии и сохранит историю.'
                          : 'Вход заблокирован, но профиль и вся история заявок сохранены.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={selectedUser.isActive ? 'btn' : 'btn btn-primary'}
                      onClick={() => void handleToggleUserStatus()}
                      disabled={isSavingStatus || isSavingProfile || isSavingRole || isDeleting || (isSelf && selectedUser.isActive)}
                      data-testid="team-user-toggle-status"
                    >
                      {isSavingStatus ? 'Сохраняем...' : selectedUser.isActive ? 'Отключить доступ' : 'Включить доступ'}
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-[12px] border border-[#e6e6e6] bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#1f1f1f]">Временный пароль</p>
                      <p className="mt-1 text-xs leading-5 text-[#737373]">
                        Используйте для импортированных сотрудников или восстановления доступа. После сохранения все текущие сессии пользователя будут отозваны.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn shrink-0"
                      onClick={openPasswordModal}
                      disabled={isSavingStatus || isSavingProfile || isSavingRole || isSavingPassword || isDeleting}
                      data-testid="team-user-set-password"
                    >
                      Установить временный пароль
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-[12px] border border-[#e6e6e6] bg-white p-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-semibold text-[#1f1f1f]">Данные сотрудника</p>
                    <p className="text-xs text-[#8a8a8a]">Измените контактные данные, отдел, должность и навыки сотрудника.</p>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Имя</label>
                      <input
                        className="input w-full"
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        disabled={isSavingProfile || isSavingRole || isSavingStatus || isDeleting}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Электронная почта</label>
                      <input
                        type="email"
                        className="input w-full"
                        value={emailDraft}
                        onChange={(event) => setEmailDraft(event.target.value)}
                        disabled={isSavingProfile || isSavingRole || isSavingStatus || isDeleting}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Отдел</label>
                      {departmentOptions.length > 0 ? (
                        <select
                          className="input w-full"
                          value={departmentDraft}
                          onChange={(event) => setDepartmentDraft(event.target.value)}
                          disabled={isSavingProfile || isSavingRole || isSavingStatus || isDeleting}
                        >
                          <option value="">Не указан</option>
                          {departmentOptions.map((departmentName) => (
                            <option key={departmentName} value={departmentName}>
                              {departmentName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="input w-full"
                          value={departmentDraft}
                          onChange={(event) => setDepartmentDraft(event.target.value)}
                          placeholder="Название отдела"
                          disabled={isSavingProfile || isSavingRole || isSavingStatus || isDeleting}
                        />
                      )}
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Должность</label>
                      <input
                        className="input w-full"
                        value={positionDraft}
                        onChange={(event) => setPositionDraft(event.target.value)}
                        placeholder="Например, руководитель отдела"
                        disabled={isSavingProfile || isSavingRole || isSavingStatus || isDeleting}
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Навыки</label>
                    <textarea
                      className="input min-h-[96px] w-full"
                      value={skillsDraft}
                      onChange={(event) => setSkillsDraft(event.target.value)}
                      placeholder="Например: React, PostgreSQL, Управление проектами"
                      disabled={isSavingProfile || isSavingRole || isSavingStatus || isDeleting}
                    />
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleProfileSave}
                      disabled={isSavingProfile || isSavingRole || isSavingStatus || isDeleting || !nameDraft.trim() || !emailDraft.trim()}
                    >
                      {isSavingProfile ? 'Сохраняем...' : 'Сохранить'}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Роль пользователя</label>
                    <select
                      className="input w-full"
                      value={roleDraft}
                      onChange={(event) => setRoleDraft(event.target.value as RoleDraft)}
                      disabled={isSavingProfile || isSavingRole || isSavingStatus || isDeleting || isSelf}
                      data-testid="team-user-role-select"
                    >
                      {selectedUser.role === 'VIEWER' && (
                        <option value="VIEWER">Наблюдатель (архивная роль)</option>
                      )}
                      {MANAGED_ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {getRoleLabel(role)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleRoleSave}
                    disabled={isSavingProfile || isSavingRole || isSavingStatus || isDeleting || isSelf || roleDraft === selectedUser.role}
                  >
                    {isSavingRole ? 'Сохраняем...' : 'Сохранить'}
                  </button>
                </div>

                {(actionError || actionSuccess) && (
                  <div
                    className={`mt-3 rounded-[10px] px-3 py-2 text-sm ${
                      actionError
                        ? 'border border-[#f3c4c4] bg-[#fff4f4] text-[#b23b3b]'
                        : 'border border-[#b8e4c6] bg-[#eef9f2] text-[#1f7a42]'
                    }`}
                  >
                    {actionError || actionSuccess}
                  </div>
                )}

                <div className="mt-4 border-t border-[#e6e6e6] pt-4">
                  <p className="text-sm font-semibold text-[#666666]">Удаление из структуры компании</p>
                  <p className="mt-1 text-xs text-[#8a8a8a]">
                    Аккаунт будет отключён и отвязан от отделов, команд и активных назначений.
                    История заявок, сообщений и финансовые данные останутся доступными для аудита.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-[#8a8a8a]">
                      {isSelf
                        ? 'Текущую учётную запись администратора удалить нельзя.'
                        : 'Сотрудник исчезнет из активного списка, но останется в архиве.'}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-[#9a5b5b] underline underline-offset-2 hover:text-[#b23b3b]"
                      onClick={handleDeleteUser}
                      disabled={isDeleting || isSavingProfile || isSavingRole || isSavingStatus || isSelf}
                    >
                      {isDeleting ? 'Удаляем...' : 'Удалить из компании'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[12px] border border-dashed border-[#d7d7d7] bg-[#fcfcfc] p-3">
                <p className="text-sm font-semibold text-[#1f1f1f]">Управление аккаунтом</p>
                <p className="mt-2 text-sm text-[#6b6b6b]">
                  Изменение ролей и удаление пользователей доступны только администратору системы.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={passwordOpen && !!selectedUser}
        onClose={closePasswordModal}
        title="Установить временный пароль"
        testId="team-password-modal"
      >
        <div className="space-y-4">
          <div className="rounded-[10px] border border-[#eee0c8] bg-[#fff8ed] p-3 text-sm leading-6 text-[#76511d]" data-testid="team-password-warning">
            Новый пароль будет установлен для пользователя <strong>{selectedUser?.name}</strong>. Все его текущие сессии будут отозваны, и потребуется войти заново.
          </div>
          <label className="block text-sm font-medium text-[#4a4a4a]">
            <span className="mb-1.5 block">Временный пароль</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              className="input w-full"
              value={temporaryPassword}
              onChange={(event) => setTemporaryPassword(event.target.value)}
              disabled={isSavingPassword}
              data-testid="team-password-input"
            />
            <span className="mt-1 block text-xs font-normal text-[#777]">Минимум 10 символов. Передайте пароль сотруднику безопасным способом.</span>
          </label>
          <label className="block text-sm font-medium text-[#4a4a4a]">
            <span className="mb-1.5 block">Повторите пароль</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              className="input w-full"
              value={temporaryPasswordConfirm}
              onChange={(event) => setTemporaryPasswordConfirm(event.target.value)}
              disabled={isSavingPassword}
              data-testid="team-password-confirm"
            />
          </label>
          {passwordError && (
            <div className="rounded-[10px] border border-[#f3c4c4] bg-[#fff4f4] px-3 py-2 text-sm text-[#b23b3b]" role="alert" data-testid="team-password-error">
              {passwordError}
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn" onClick={closePasswordModal} disabled={isSavingPassword}>Отмена</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleTemporaryPasswordSave()}
              disabled={isSavingPassword || temporaryPassword.length < 10 || temporaryPasswordConfirm.length < 10}
              data-testid="team-password-submit"
            >
              {isSavingPassword ? 'Сохраняем...' : 'Установить пароль'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
