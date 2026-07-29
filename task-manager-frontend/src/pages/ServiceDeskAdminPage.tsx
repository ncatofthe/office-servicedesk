import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RotateCcw, Settings2, Trash2, UserPlus, X } from 'lucide-react';
import {
  serviceDeskFoldersApi,
  serviceDeskTeamsApi,
  ticketEntitiesApi,
  ticketSubtypesApi,
  ticketTypesApi,
  usersApi,
} from '../api';
import { AutomationRulesAdminSection } from '../components/admin/AutomationRulesAdminSection';
import { EmailOutboxAdminSection } from '../components/admin/EmailOutboxAdminSection';
import { FreshdeskImportAdminSection } from '../components/admin/FreshdeskImportAdminSection';
import { ProductSettingsAdminSection } from '../components/admin/ProductSettingsAdminSection';
import { DataState } from '../components/ui/DataState';
import { Modal } from '../components/ui/Modal';
import { Tabs } from '../components/ui/Tabs';
import { getRoleLabel } from '../utils';
import type {
  ServiceDeskDictionaryInput,
  ServiceDeskDictionaryItem,
  ServiceDeskEntity,
  ServiceDeskFolder,
  ServiceDeskTeam,
  ServiceDeskTeamMember,
  ServiceDeskTeamMemberInput,
  ServiceDeskTicketSubtype,
  ServiceDeskTicketType,
  TeamUser,
} from '../types';

type DirectoryKey = 'folders' | 'types' | 'subtypes' | 'entities' | 'teams';
type AdminSectionKey = DirectoryKey | 'productSettings' | 'automation' | 'emailOutbox' | 'freshdeskImport';
type DirectoryItem = ServiceDeskFolder | ServiceDeskTicketType | ServiceDeskTicketSubtype | ServiceDeskEntity | ServiceDeskTeam;

const directoryCopy: Record<DirectoryKey, { tab: string; createTitle: string; editTitle: string; hint: string }> = {
  folders: {
    tab: 'Папки',
    createTitle: 'Новая папка заявок',
    editTitle: 'Редактировать папку',
    hint: 'Папка определяет рабочую очередь, в которую попадает заявка.',
  },
  types: {
    tab: 'Типы',
    createTitle: 'Новый тип заявки',
    editTitle: 'Редактировать тип заявки',
    hint: 'Тип помогает классифицировать заявку и при необходимости направить её в папку.',
  },
  subtypes: {
    tab: 'Подтипы',
    createTitle: 'Новый подтип заявки',
    editTitle: 'Редактировать подтип',
    hint: 'Подтип уточняет выбранный тип заявки.',
  },
  entities: {
    tab: 'Категории',
    createTitle: 'Новая категория обращения',
    editTitle: 'Редактировать категорию обращения',
    hint: 'Категория описывает общий характер обращения, например запрос, инцидент или проблему.',
  },
  teams: {
    tab: 'Команды и доступы',
    createTitle: 'Новая команда исполнителей',
    editTitle: 'Редактировать команду',
    hint: 'Команда объединяет исполнителей и задаёт папки, доступные её участникам.',
  },
};

const formatCount = (count: number, forms: [string, string, string]) => {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const form = mod100 >= 11 && mod100 <= 14
    ? forms[2]
    : mod10 === 1
      ? forms[0]
      : mod10 >= 2 && mod10 <= 4
        ? forms[1]
        : forms[2];
  return `${count} ${form}`;
};

interface DirectoryConfig<T extends DirectoryItem> {
  key: DirectoryKey;
  title: string;
  emptyText: string;
  getAll: () => Promise<T[]>;
  create: (data: ServiceDeskDictionaryInput) => Promise<T>;
  update: (id: string, data: ServiceDeskDictionaryInput) => Promise<T>;
  delete: (id: string, options?: { detach?: boolean }) => Promise<unknown>;
}

const isEndpointMissing = (error: unknown) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 404 || status === 501;
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 403) {
    return 'Недостаточно прав для управления настройками. Нужна роль администратора.';
  }

  if (isEndpointMissing(error)) {
    return 'Справочник или endpoint не найден на backend. Проверьте маршруты /servicedesk/admin/*.';
  }

  const response = (error as { response?: { data?: { error?: string; message?: string } } })?.response;
  return response?.data?.error || response?.data?.message || fallback;
};

const getRelationName = (items: ServiceDeskDictionaryItem[], id?: string | null) =>
  items.find((item) => item.id === id)?.name || 'Не привязано';

const getTeamFolderIds = (team: ServiceDeskTeam) => team.folderIds?.length
  ? team.folderIds
  : team.folderId
    ? [team.folderId]
    : [];

const TEAM_MEMBER_ROLES = new Set(['ADMIN', 'AGENT', 'DIRECTOR', 'MANAGER', 'EMPLOYEE']);

const getItemExtra = (
  item: DirectoryItem,
  activeKey: DirectoryKey,
  types: ServiceDeskTicketType[],
  folders: ServiceDeskFolder[]
) => {
  if (activeKey === 'folders') {
    const folder = item as ServiceDeskFolder;
    const teamCount = folder.counts?.teams ?? 0;
    return `${formatCount(teamCount, ['команда', 'команды', 'команд'])} · ${formatCount(folder.counts?.tasks ?? 0, ['заявка', 'заявки', 'заявок'])}`;
  }

  if (activeKey === 'types') {
    return `Папка: ${getRelationName(folders, (item as ServiceDeskTicketType).folderId)}`;
  }

  if (activeKey === 'subtypes') {
    return `Тип: ${getRelationName(types, (item as ServiceDeskTicketSubtype).typeId)}`;
  }

  if (activeKey === 'entities') {
    return `Код: ${(item as ServiceDeskEntity).code || 'не указан'}`;
  }

  const team = item as ServiceDeskTeam;
  const folderNames = (team.folders || [])
    .map((folder) => folder.name)
    .filter(Boolean)
    .join(', ');
  return `Папки: ${folderNames || 'не назначены'} · участников: ${team.members?.length || 0}`;
};

export const ServiceDeskAdminPage: React.FC = () => {
  const configs = useMemo<DirectoryConfig<DirectoryItem>[]>(() => [
    {
      key: 'folders',
      title: directoryCopy.folders.tab,
      emptyText: 'Папок пока нет. Создайте папку маршрутизации.',
      getAll: serviceDeskFoldersApi.getManaged,
      create: serviceDeskFoldersApi.create,
      update: serviceDeskFoldersApi.update,
      delete: serviceDeskFoldersApi.delete,
    },
    {
      key: 'types',
      title: directoryCopy.types.tab,
      emptyText: 'Типы заявок пока не настроены.',
      getAll: ticketTypesApi.getManaged,
      create: ticketTypesApi.create,
      update: ticketTypesApi.update,
      delete: ticketTypesApi.delete,
    },
    {
      key: 'subtypes',
      title: directoryCopy.subtypes.tab,
      emptyText: 'Подтипы заявок пока не настроены.',
      getAll: ticketSubtypesApi.getManaged,
      create: ticketSubtypesApi.create,
      update: ticketSubtypesApi.update,
      delete: ticketSubtypesApi.delete,
    },
    {
      key: 'entities',
      title: directoryCopy.entities.tab,
      emptyText: 'Сущности обращений пока не настроены.',
      getAll: ticketEntitiesApi.getManaged,
      create: ticketEntitiesApi.create,
      update: ticketEntitiesApi.update,
      delete: ticketEntitiesApi.delete,
    },
    {
      key: 'teams',
      title: directoryCopy.teams.tab,
      emptyText: 'Команды исполнителей пока не настроены.',
      getAll: serviceDeskTeamsApi.getManaged,
      create: serviceDeskTeamsApi.create,
      update: serviceDeskTeamsApi.update,
      delete: serviceDeskTeamsApi.delete,
    },
  ], []);

  const [activeKey, setActiveKey] = useState<AdminSectionKey>('productSettings');
  const [itemsByKey, setItemsByKey] = useState<Record<DirectoryKey, DirectoryItem[]>>({
    folders: [],
    types: [],
    subtypes: [],
    entities: [],
    teams: [],
  });
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DirectoryItem | null>(null);
  const [teamSettingsOpen, setTeamSettingsOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [relationId, setRelationId] = useState('');
  const [folderIdsDraft, setFolderIdsDraft] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('');
  const [memberIsLead, setMemberIsLead] = useState(false);
  const [memberSaving, setMemberSaving] = useState(false);
  const isProductSettingsTab = activeKey === 'productSettings';
  const isAutomationTab = activeKey === 'automation';
  const isEmailOutboxTab = activeKey === 'emailOutbox';
  const isFreshdeskImportTab = activeKey === 'freshdeskImport';
  const isSpecialTab = isProductSettingsTab || isAutomationTab || isEmailOutboxTab || isFreshdeskImportTab;
  const activeDirectoryKey: DirectoryKey = isSpecialTab ? 'folders' : activeKey;
  const activeConfig = configs.find((config) => config.key === activeDirectoryKey) || configs[0];
  const activeItems = isSpecialTab ? [] : itemsByKey[activeDirectoryKey];
  const folders = itemsByKey.folders as ServiceDeskFolder[];
  const types = itemsByKey.types as ServiceDeskTicketType[];
  const teams = itemsByKey.teams as ServiceDeskTeam[];
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || null;
  const tabs = useMemo(
    () => [
      { key: 'productSettings', label: 'Компания и портал' },
      ...configs.map((config) => ({ key: config.key, label: config.title })),
      { key: 'automation', label: 'Автоматизация' },
      { key: 'emailOutbox', label: 'Почта' },
      { key: 'freshdeskImport', label: 'Импорт Freshdesk' },
    ],
    [configs]
  );

  const loadDirectory = useCallback(async (key: DirectoryKey) => {
    const config = configs.find((entry) => entry.key === key);
    if (!config) {
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');
    try {
      const data = await config.getAll();
      setItemsByKey((current) => ({ ...current, [key]: data }));
    } catch (loadError) {
      setItemsByKey((current) => ({ ...current, [key]: [] }));
      setError(getApiErrorMessage(loadError, 'Не удалось загрузить настройки.'));
    } finally {
      setLoading(false);
    }
  }, [configs]);

  const refreshTeams = useCallback(async (preferredTeamId?: string) => {
    const data = await serviceDeskTeamsApi.getManaged();
    setItemsByKey((current) => ({ ...current, teams: data }));

    const nextTeamId = preferredTeamId || selectedTeamId;
    if (nextTeamId && data.some((team) => team.id === nextTeamId)) {
      setSelectedTeamId(nextTeamId);
    } else if (data[0]) {
      setSelectedTeamId(data[0].id);
    } else {
      setSelectedTeamId('');
    }
  }, [selectedTeamId]);

  const loadSupportingData = useCallback(async () => {
    const [foldersResult, typesResult, usersResult] = await Promise.allSettled([
      serviceDeskFoldersApi.getManaged(),
      ticketTypesApi.getManaged(),
      usersApi.getAll(),
    ]);

    if (foldersResult.status === 'fulfilled') {
      setItemsByKey((current) => ({ ...current, folders: foldersResult.value }));
    }
    if (typesResult.status === 'fulfilled') {
      setItemsByKey((current) => ({ ...current, types: typesResult.value }));
    }
    if (usersResult.status === 'fulfilled') {
      setUsers(usersResult.value);
    }
  }, []);

  useEffect(() => {
    if (!isSpecialTab) {
      void loadDirectory(activeDirectoryKey);
    }
  }, [activeDirectoryKey, isSpecialTab, loadDirectory]);

  useEffect(() => {
    loadSupportingData().catch(() => undefined);
  }, [loadSupportingData]);

  useEffect(() => {
    if (!selectedTeamId && teams[0]) {
      setSelectedTeamId(teams[0].id);
    }
  }, [selectedTeamId, teams]);

  const resetDraft = () => {
    setEditingItem(null);
    setName('');
    setDescription('');
    setRelationId('');
    setFolderIdsDraft([]);
    setCode('');
    setIsActive(true);
  };

  const openCreateModal = () => {
    resetDraft();
    setModalOpen(true);
  };

  const openEditModal = (item: DirectoryItem) => {
    setEditingItem(item);
    setName(item.name);
    setDescription(item.description || '');
    setIsActive(item.isActive !== false);
    setRelationId(
      activeKey === 'types'
        ? ((item as ServiceDeskTicketType).folderId || '')
        : activeKey === 'subtypes'
          ? ((item as ServiceDeskTicketSubtype).typeId || '')
          : ''
    );
    setFolderIdsDraft(activeKey === 'teams' ? getTeamFolderIds(item as ServiceDeskTeam) : []);
    setCode(activeKey === 'entities' ? ((item as ServiceDeskEntity).code || '') : '');
    setModalOpen(true);
  };

  const openTeamSettings = (team: ServiceDeskTeam) => {
    setSelectedTeamId(team.id);
    setMemberUserId('');
    setMemberRole('');
    setMemberIsLead(false);
    setTeamSettingsOpen(true);
  };

  const closeModal = () => {
    if (saving) {
      return;
    }

    setModalOpen(false);
    resetDraft();
  };

  const saveItem = async () => {
    if (!name.trim()) {
      setError('Введите название элемента настройки.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload: ServiceDeskDictionaryInput = {
        name: name.trim(),
        description: description.trim() || null,
        isActive,
      };

      if (activeKey === 'types') {
        payload.folderId = relationId || null;
      }
      if (activeKey === 'subtypes') {
        payload.typeId = relationId || null;
      }
      if (activeKey === 'entities') {
        payload.code = code.trim() || null;
      }
      if (activeKey === 'teams') {
        payload.folderIds = folderIdsDraft;
        payload.folderId = folderIdsDraft[0] || null;
      }

      if (editingItem) {
        await activeConfig.update(editingItem.id, payload);
        setNotice('Настройка обновлена.');
      } else {
        await activeConfig.create(payload);
        setNotice('Настройка создана.');
      }

      setModalOpen(false);
      resetDraft();
      await loadDirectory(activeDirectoryKey);
      if (activeDirectoryKey === 'teams') {
        await refreshTeams();
      }
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, 'Не удалось сохранить настройку.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item: DirectoryItem) => {
    const counts = 'counts' in item && item.counts
      ? Object.entries(item.counts)
          .filter(([, value]) => Number(value) > 0)
          .map(([key, value]) => `${key}: ${value}`)
      : [];
    const hasRelations = counts.length > 0;
    const supportsSafeDetach = activeDirectoryKey !== 'teams';
    const confirmed = window.confirm([
      `Удалить «${item.name}» из настроек?`,
      hasRelations ? `Связи: ${counts.join(', ')}.` : '',
      hasRelations && supportsSafeDetach
        ? 'Заявки и история сохранятся, а связанные поля будут очищены. Для типа также удалятся его подтипы.'
        : '',
      'Действие нельзя отменить.',
    ].filter(Boolean).join(' '));
    if (!confirmed) {
      return;
    }

    setError('');
    setNotice('');
    try {
      await activeConfig.delete(item.id, {
        detach: hasRelations && supportsSafeDetach,
      });
      setNotice('Настройка удалена.');
      await loadDirectory(activeDirectoryKey);
      if (activeDirectoryKey === 'teams') {
        await refreshTeams();
      }
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, 'Не удалось удалить настройку.'));
    }
  };

  const saveTeamFolderAccess = async () => {
    if (!selectedTeam) {
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      await serviceDeskTeamsApi.update(selectedTeam.id, {
        folderIds: folderIdsDraft,
        folderId: folderIdsDraft[0] || null,
      });
      await refreshTeams(selectedTeam.id);
      setNotice('Доступ команды к папкам обновлён.');
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, 'Не удалось обновить доступ команды к папкам.'));
    } finally {
      setSaving(false);
    }
  };

  const addTeamMember = async () => {
    if (!selectedTeam || !memberUserId) {
      setError('Выберите пользователя для добавления в команду.');
      return;
    }

    const payload: ServiceDeskTeamMemberInput = {
      userId: memberUserId,
      role: memberRole.trim() || null,
      isLead: memberIsLead,
    };

    setMemberSaving(true);
    setError('');
    setNotice('');
    try {
      await serviceDeskTeamsApi.createMember(selectedTeam.id, payload);
      setMemberUserId('');
      setMemberRole('');
      setMemberIsLead(false);
      await refreshTeams(selectedTeam.id);
      setNotice('Участник команды добавлен.');
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, 'Не удалось добавить участника команды.'));
    } finally {
      setMemberSaving(false);
    }
  };

  const saveMember = async (member: ServiceDeskTeamMember) => {
    setMemberSaving(true);
    setError('');
    setNotice('');
    try {
      await serviceDeskTeamsApi.updateMember(member.id, {
        role: member.role || null,
        isLead: member.isLead,
      });
      await refreshTeams(selectedTeam?.id);
      setNotice('Параметры участника обновлены.');
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, 'Не удалось обновить участника команды.'));
    } finally {
      setMemberSaving(false);
    }
  };

  const deleteMember = async (member: ServiceDeskTeamMember) => {
    const confirmed = window.confirm(`Удалить ${member.user?.name || member.userId} из команды?`);
    if (!confirmed) {
      return;
    }

    setMemberSaving(true);
    setError('');
    setNotice('');
    try {
      await serviceDeskTeamsApi.deleteMember(member.id);
      await refreshTeams(selectedTeam?.id);
      setNotice('Участник команды удалён.');
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, 'Не удалось удалить участника команды.'));
    } finally {
      setMemberSaving(false);
    }
  };

  const availableUsersForSelectedTeam = useMemo(() => {
    const existingUserIds = new Set(selectedTeam?.members?.map((member) => member.userId) || []);
    return users.filter((user) => user.isActive !== false && TEAM_MEMBER_ROLES.has(user.role) && !existingUserIds.has(user.id));
  }, [selectedTeam?.members, users]);

  useEffect(() => {
    if (selectedTeam) {
      setFolderIdsDraft(getTeamFolderIds(selectedTeam));
    }
  }, [selectedTeam]);

  return (
    <div className="space-y-5" data-testid="service-desk-admin-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Настройки</h1>
          <p className="page-subtitle mt-1">Маршрутизация заявок, команды исполнителей, автоматизация, почта и перенос данных</p>
        </div>
        {!isSpecialTab && (
          <button type="button" className="btn btn-primary inline-flex items-center gap-2" onClick={openCreateModal} data-testid="admin-directory-add">
            <Plus size={16} />
            Добавить
          </button>
        )}
      </div>

      <Tabs
        value={activeKey}
        onChange={(value) => setActiveKey(value as AdminSectionKey)}
        tabs={tabs}
      />

      {notice && (
        <div className="rounded-[12px] border border-[#b8e4c6] bg-[#eef9f2] px-4 py-3 text-sm text-[#1f7a42]">
          {notice}
        </div>
      )}

      {error && (
        <div className="rounded-[12px] border border-[#f3c4c4] bg-[#fff4f4] px-4 py-3 text-sm text-[#b23b3b]">
          {error}
        </div>
      )}

      {isProductSettingsTab ? (
        <ProductSettingsAdminSection />
      ) : isAutomationTab ? (
        <AutomationRulesAdminSection />
      ) : isEmailOutboxTab ? (
        <EmailOutboxAdminSection />
      ) : isFreshdeskImportTab ? (
        <FreshdeskImportAdminSection />
      ) : (
        <>
          <div className="flex justify-end">
            <button type="button" className="btn inline-flex items-center gap-2" onClick={() => void loadDirectory(activeDirectoryKey)} disabled={loading}>
              <RotateCcw size={15} />
              Обновить
            </button>
          </div>

          {loading ? (
            <DataState variant="loading" message="Загружаем настройки..." />
          ) : activeItems.length === 0 ? (
            <DataState variant="empty" message={activeConfig.emptyText} />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {activeItems.map((item) => (
                <div key={item.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-[#1f1f1f]">{item.name}</h2>
                        <span className="chip">{item.isActive === false ? 'Отключено' : 'Активно'}</span>
                      </div>
                      <p className="mt-2 text-sm text-[#606060]">{item.description || 'Описание не указано'}</p>
                      <p className="mt-3 text-xs text-[#8a8a8a]">{getItemExtra(item, activeDirectoryKey, types, folders)}</p>

                      {activeKey === 'teams' && (
                        <div className="mt-3 space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {((item as ServiceDeskTeam).folders || []).length > 0 ? (
                              (item as ServiceDeskTeam).folders?.map((folder) => (
                                <span key={folder.id} className="chip">{folder.name}</span>
                              ))
                            ) : (
                              <span className="text-xs text-[#8a8a8a]">Нет доступных папок</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(item as ServiceDeskTeam).members?.slice(0, 3).map((member) => (
                              <span key={member.id} className="chip">
                                {member.user?.name || member.userId}
                              </span>
                            ))}
                            {((item as ServiceDeskTeam).members?.length || 0) > 3 && (
                              <span className="chip">+ещё {(item as ServiceDeskTeam).members!.length - 3}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 gap-2">
                      {activeKey === 'teams' && (
                        <button type="button" className="btn h-10 w-10 p-0" onClick={() => openTeamSettings(item as ServiceDeskTeam)} title="Доступы и участники" aria-label={`Настроить доступы команды ${item.name}`}>
                          <Settings2 size={15} className="mx-auto" />
                        </button>
                      )}
                      <button type="button" className="btn h-10 w-10 p-0" onClick={() => openEditModal(item)} title="Редактировать" aria-label={`Редактировать ${item.name}`}>
                        <Pencil size={15} className="mx-auto" />
                      </button>
                      <button type="button" className="btn h-10 w-10 p-0 border-[#efc1c1] text-[#b23b3b]" onClick={() => void deleteItem(item)} title="Удалить" aria-label={`Удалить ${item.name}`}>
                        <Trash2 size={15} className="mx-auto" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingItem ? `${directoryCopy[activeDirectoryKey].editTitle}: ${editingItem.name}` : directoryCopy[activeDirectoryKey].createTitle}
        testId="admin-directory-modal"
      >
        <div className="space-y-3">
          <p className="rounded-[10px] border border-[#e3e3e3] bg-[#fafafa] px-3 py-2 text-sm leading-5 text-[#666]">
            {directoryCopy[activeDirectoryKey].hint}
          </p>
          <div>
            <label className="mb-1 block text-sm text-[#5f5f5f]">Название *</label>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} disabled={saving} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-[#5f5f5f]">Описание</label>
            <textarea className="input min-h-[88px]" value={description} onChange={(event) => setDescription(event.target.value)} disabled={saving} />
          </div>

          {activeKey === 'types' && (
            <div>
              <label className="mb-1 block text-sm text-[#5f5f5f]">Папка</label>
              <select className="input" value={relationId} onChange={(event) => setRelationId(event.target.value)} disabled={saving}>
                <option value="">Не привязано</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                ))}
              </select>
            </div>
          )}

          {activeKey === 'subtypes' && (
            <div>
              <label className="mb-1 block text-sm text-[#5f5f5f]">Тип заявки</label>
              <select className="input" value={relationId} onChange={(event) => setRelationId(event.target.value)} disabled={saving}>
                <option value="">Не привязано</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </div>
          )}

          {activeKey === 'entities' && (
            <div>
              <label className="mb-1 block text-sm text-[#5f5f5f]">Технический код</label>
              <input className="input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Например, INCIDENT" disabled={saving} />
              <p className="mt-1 text-xs text-[#8a8a8a]">Используется в автоматизации и интеграциях. Пользователи видят название категории.</p>
            </div>
          )}

          {activeKey === 'teams' && (
            <div>
              <label className="mb-1 block text-sm text-[#5f5f5f]">Папки команды</label>
              <div className="grid gap-2 rounded-[10px] border border-[#e3e3e3] bg-[#fcfcfc] p-3 sm:grid-cols-2">
                {folders.length > 0 ? folders.map((folder) => (
                  <label key={folder.id} className="flex min-w-0 items-start gap-2 rounded-[8px] bg-white px-3 py-2 text-sm text-[#3f3f3f]">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={folderIdsDraft.includes(folder.id)}
                      onChange={(event) => setFolderIdsDraft((current) => event.target.checked
                        ? [...current, folder.id]
                        : current.filter((folderId) => folderId !== folder.id))}
                      disabled={saving}
                    />
                    <span className="break-words">{folder.name}</span>
                  </label>
                )) : <p className="text-sm text-[#8a8a8a]">Сначала создайте хотя бы одну папку.</p>}
              </div>
              <p className="mt-1 text-xs text-[#8a8a8a]">Команда видит очередь по всем выбранным папкам.</p>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-[#4a4a4a]">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} disabled={saving} />
            Активен
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn" onClick={closeModal} disabled={saving}>Отмена</button>
            <button type="button" className="btn btn-primary" onClick={saveItem} disabled={saving || !name.trim()}>
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={teamSettingsOpen} onClose={() => !memberSaving && !saving && setTeamSettingsOpen(false)} title="Доступ команды и участники">
        {!selectedTeam ? (
          <DataState variant="empty" message="Выберите команду для настройки." />
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-[#5f5f5f]">Команда</label>
              <select className="input" value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)} disabled={saving || memberSaving}>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>

            <div className="rounded-[12px] border border-[#e3e3e3] bg-[#fcfcfc] p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-[#1f1f1f]">Доступ к папкам</p>
                <p className="mt-1 text-xs text-[#8a8a8a]">Эти папки формируют очередь команды и область видимости заявок для её участников.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2" data-testid="admin-team-folder-access">
                {folders.length > 0 ? folders.map((folder) => (
                  <label key={folder.id} className="flex min-w-0 items-start gap-2 rounded-[9px] border border-[#e6e6e6] bg-white px-3 py-2 text-sm text-[#3f3f3f]">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={folderIdsDraft.includes(folder.id)}
                      onChange={(event) => setFolderIdsDraft((current) => event.target.checked
                        ? [...current, folder.id]
                        : current.filter((folderId) => folderId !== folder.id))}
                      disabled={saving}
                    />
                    <span className="break-words">{folder.name}</span>
                  </label>
                )) : <p className="text-sm text-[#8a8a8a]">Нет доступных папок.</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {folderIdsDraft.length > 0 ? folderIdsDraft.map((folderId) => (
                  <span key={folderId} className="chip">{getRelationName(folders, folderId)}</span>
                )) : (
                  <span className="text-xs text-[#8a8a8a]">Папки пока не выбраны.</span>
                )}
              </div>
              <div className="flex justify-end">
                <button type="button" className="btn btn-primary" onClick={saveTeamFolderAccess} disabled={saving}>
                  {saving ? 'Сохраняем...' : 'Сохранить доступ'}
                </button>
              </div>
            </div>

            <div className="rounded-[12px] border border-[#e3e3e3] bg-white p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-[#1f1f1f]">Участники команды</p>
                <p className="mt-1 text-xs text-[#8a8a8a]">Пользователи команды получают доступ к её очереди и связанным папкам.</p>
              </div>

              {selectedTeam.members && selectedTeam.members.length > 0 ? (
                <div className="space-y-2">
                  {selectedTeam.members.map((member) => (
                    <div key={member.id} className="rounded-[10px] border border-[#ececec] px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-[#1f1f1f]">{member.user?.name || member.userId}</p>
                          <p className="text-xs text-[#8a8a8a]">{member.user?.email || getRoleLabel(member.user?.role || '')}</p>
                        </div>
                        <button type="button" className="btn h-10 w-10 p-0 border-[#efc1c1] text-[#b23b3b]" onClick={() => deleteMember(member)} title="Удалить участника">
                          <X size={15} className="mx-auto" />
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr,auto,auto]">
                        <input
                          className="input"
                          value={member.role || ''}
                          onChange={(event) => {
                            setItemsByKey((current) => ({
                              ...current,
                              teams: teams.map((team) => team.id !== selectedTeam.id
                                ? team
                                : {
                                    ...team,
                                    members: team.members?.map((teamMember) => teamMember.id === member.id
                                      ? { ...teamMember, role: event.target.value }
                                      : teamMember)
                                  })
                            }));
                          }}
                          disabled={memberSaving}
                          placeholder="Роль в команде"
                        />
                        <label className="flex items-center gap-2 text-sm text-[#4a4a4a]">
                          <input
                            type="checkbox"
                            checked={member.isLead}
                            onChange={(event) => {
                              setItemsByKey((current) => ({
                                ...current,
                                teams: teams.map((team) => team.id !== selectedTeam.id
                                  ? team
                                  : {
                                      ...team,
                                      members: team.members?.map((teamMember) => teamMember.id === member.id
                                        ? { ...teamMember, isLead: event.target.checked }
                                        : teamMember)
                                    })
                              }));
                            }}
                            disabled={memberSaving}
                          />
                          Тимлид
                        </label>
                        <button type="button" className="btn" onClick={() => saveMember(member)} disabled={memberSaving}>
                          Сохранить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <DataState variant="empty" message="В этой команде пока нет участников." />
              )}

              <div className="rounded-[10px] border border-dashed border-[#dddddd] bg-[#fcfcfc] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <UserPlus size={16} className="text-[#5f5f5f]" />
                  <p className="text-sm font-semibold text-[#1f1f1f]">Добавить участника</p>
                </div>
                <select className="input" value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)} disabled={memberSaving}>
                  <option value="">Выберите пользователя</option>
                  {availableUsersForSelectedTeam.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} · {getRoleLabel(user.role)}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-5 text-[#8a8a8a]">В команду можно добавить только активного исполнителя или администратора. Заявщики не получают доступ к рабочим очередям.</p>
                <input
                  className="input"
                  value={memberRole}
                  onChange={(event) => setMemberRole(event.target.value)}
                  placeholder="Роль в команде"
                  disabled={memberSaving}
                />
                <label className="flex items-center gap-2 text-sm text-[#4a4a4a]">
                  <input type="checkbox" checked={memberIsLead} onChange={(event) => setMemberIsLead(event.target.checked)} disabled={memberSaving} />
                  Сделать тимлидом
                </label>
                <div className="flex justify-end">
                  <button type="button" className="btn btn-primary" onClick={addTeamMember} disabled={memberSaving || !memberUserId}>
                    {memberSaving ? 'Сохраняем...' : 'Добавить'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
