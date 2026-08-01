import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react';
import { automationRulesApi, automationRunsApi, serviceDeskFoldersApi, ticketEntitiesApi, ticketSubtypesApi, ticketTypesApi, usersApi } from '../../api';
import { DataState } from '../ui/DataState';
import { Modal } from '../ui/Modal';
import { Card } from '../ui/Card';
import { formatDateTime, getRoleLabel, priorityLabels } from '../../utils';
import type {
  AutomationRule,
  AutomationRuleActions,
  AutomationRuleChannel,
  AutomationRuleConditions,
  AutomationRuleTestResult,
  AutomationRuleTriggerType,
  AutomationRun,
  CreateAutomationRuleInput,
  ServiceDeskEntity,
  ServiceDeskFolder,
  ServiceDeskTicketSubtype,
  ServiceDeskTicketType,
  TaskPriority,
  TeamUser,
  UpdateAutomationRuleInput,
} from '../../types';

type NullableString = string | null | undefined;

interface AutomationRuleFormState {
  name: string;
  description: string;
  isActive: boolean;
  sortOrder: string;
  triggerType: AutomationRuleTriggerType;
  conditions: {
    channel: '' | AutomationRuleChannel;
    folderId: string;
    entityId: string;
    typeId: string;
    subtypeId: string;
    priority: '' | TaskPriority;
    requesterEmailContains: string;
    titleContains: string;
  };
  actions: {
    setFolderId: string;
    setEntityId: string;
    setTypeId: string;
    setSubtypeId: string;
    setPriority: '' | TaskPriority;
    replaceAssignees: boolean;
    setAssigneeIds: string[];
  };
}

const triggerLabels: Record<AutomationRuleTriggerType, string> = {
  TASK_CREATED: 'После создания заявки',
  EMAIL_TICKET_CREATED: 'После создания email-заявки',
};

const channelLabels: Record<AutomationRuleChannel, string> = {
  WEB: 'Веб-портал',
  EMAIL: 'Email',
};

const runStatusLabels: Record<AutomationRun['status'], string> = {
  SUCCESS: 'Успешно',
  ERROR: 'Ошибка',
};

const emptyFormState = (): AutomationRuleFormState => ({
  name: '',
  description: '',
  isActive: true,
  sortOrder: '0',
  triggerType: 'TASK_CREATED',
  conditions: {
    channel: '',
    folderId: '',
    entityId: '',
    typeId: '',
    subtypeId: '',
    priority: '',
    requesterEmailContains: '',
    titleContains: '',
  },
  actions: {
    setFolderId: '',
    setEntityId: '',
    setTypeId: '',
    setSubtypeId: '',
    setPriority: '',
    replaceAssignees: false,
    setAssigneeIds: [],
  },
});

const getApiErrorMessage = (error: unknown, fallback: string) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 403) {
    return 'Недостаточно прав для управления автоматизацией. Нужна роль администратора.';
  }

  const response = (error as { response?: { data?: { error?: string; message?: string } } })?.response;
  return response?.data?.error || response?.data?.message || fallback;
};

const getDictionaryName = <T extends { id: string; name: string }>(items: T[], id: NullableString, fallback = 'Не указано') => {
  if (!id) {
    return fallback;
  }

  return items.find((item) => item.id === id)?.name || id;
};

const getUserName = (users: TeamUser[], userId: string) =>
  users.find((user) => user.id === userId)?.name || userId;

const toNullableString = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toOptionalString = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const toOptionalEnum = <T extends string>(value: '' | T) => (
  value || undefined
);

const mapRuleToFormState = (rule: AutomationRule): AutomationRuleFormState => ({
  name: rule.name,
  description: rule.description || '',
  isActive: rule.isActive,
  sortOrder: String(rule.sortOrder),
  triggerType: rule.triggerType,
  conditions: {
    channel: rule.conditions.channel || '',
    folderId: rule.conditions.folderId || '',
    entityId: rule.conditions.entityId || '',
    typeId: rule.conditions.typeId || '',
    subtypeId: rule.conditions.subtypeId || '',
    priority: rule.conditions.priority || '',
    requesterEmailContains: rule.conditions.requesterEmailContains || '',
    titleContains: rule.conditions.titleContains || '',
  },
  actions: {
    setFolderId: rule.actions.setFolderId || '',
    setEntityId: rule.actions.setEntityId || '',
    setTypeId: rule.actions.setTypeId || '',
    setSubtypeId: rule.actions.setSubtypeId || '',
    setPriority: rule.actions.setPriority || '',
    replaceAssignees: Object.prototype.hasOwnProperty.call(rule.actions, 'setAssigneeIds'),
    setAssigneeIds: rule.actions.setAssigneeIds ? [...rule.actions.setAssigneeIds] : [],
  },
});

const buildRulePayload = (
  form: AutomationRuleFormState
): CreateAutomationRuleInput | UpdateAutomationRuleInput => ({
  name: form.name.trim(),
  description: toNullableString(form.description),
  isActive: form.isActive,
  sortOrder: Number.parseInt(form.sortOrder, 10),
  triggerType: form.triggerType,
  conditions: {
    channel: form.conditions.channel || undefined,
    folderId: toOptionalString(form.conditions.folderId),
    entityId: toOptionalString(form.conditions.entityId),
    typeId: toOptionalString(form.conditions.typeId),
    subtypeId: toOptionalString(form.conditions.subtypeId),
    priority: toOptionalEnum(form.conditions.priority),
    requesterEmailContains: toOptionalString(form.conditions.requesterEmailContains),
    titleContains: toOptionalString(form.conditions.titleContains),
  },
  actions: {
    setFolderId: toOptionalString(form.actions.setFolderId),
    setEntityId: toOptionalString(form.actions.setEntityId),
    setTypeId: toOptionalString(form.actions.setTypeId),
    setSubtypeId: toOptionalString(form.actions.setSubtypeId),
    setPriority: toOptionalEnum(form.actions.setPriority),
    setAssigneeIds: form.actions.replaceAssignees ? form.actions.setAssigneeIds : undefined,
  },
});

const hasAnyConfiguredAction = (actions: AutomationRuleFormState['actions']) =>
  Boolean(
    actions.setFolderId
    || actions.setEntityId
    || actions.setTypeId
    || actions.setSubtypeId
    || actions.setPriority
    || actions.replaceAssignees
  );

const getFilteredTypes = (
  types: ServiceDeskTicketType[],
  folderId: string,
  entityId: string,
  selectedTypeId: string
) => types.filter((type) => {
  if (type.id === selectedTypeId) {
    return true;
  }

  const matchesFolder = !folderId || !type.folderId || type.folderId === folderId;
  const matchesEntity = !entityId || !type.entityId || type.entityId === entityId;

  return matchesFolder && matchesEntity;
});

const getFilteredSubtypes = (
  subtypes: ServiceDeskTicketSubtype[],
  folderId: string,
  typeId: string,
  selectedSubtypeId: string
) => subtypes.filter((subtype) => {
  if (subtype.id === selectedSubtypeId) {
    return true;
  }

  const matchesFolder = !folderId || !subtype.folderId || subtype.folderId === folderId;
  const matchesType = !typeId || subtype.typeId === typeId;

  return matchesFolder && matchesType;
});

const describeConditions = (
  conditions: AutomationRuleConditions,
  dictionaries: {
    folders: ServiceDeskFolder[];
    entities: ServiceDeskEntity[];
    types: ServiceDeskTicketType[];
    subtypes: ServiceDeskTicketSubtype[];
  }
) => {
  const parts: string[] = [];

  if (conditions.channel) {
    parts.push(`канал: ${channelLabels[conditions.channel]}`);
  }
  if (conditions.folderId) {
    parts.push(`папка: ${getDictionaryName(dictionaries.folders, conditions.folderId)}`);
  }
  if (conditions.entityId) {
    parts.push(`категория: ${getDictionaryName(dictionaries.entities, conditions.entityId)}`);
  }
  if (conditions.typeId) {
    parts.push(`тип: ${getDictionaryName(dictionaries.types, conditions.typeId)}`);
  }
  if (conditions.subtypeId) {
    parts.push(`подтип: ${getDictionaryName(dictionaries.subtypes, conditions.subtypeId)}`);
  }
  if (conditions.priority) {
    parts.push(`приоритет: ${priorityLabels[conditions.priority]}`);
  }
  if (conditions.requesterEmailContains) {
    parts.push(`email содержит: ${conditions.requesterEmailContains}`);
  }
  if (conditions.titleContains) {
    parts.push(`тема содержит: ${conditions.titleContains}`);
  }

  if (parts.length === 0) {
    return ['Без ограничений: правило проверяется на каждом событии этого триггера.'];
  }

  return parts;
};

const describeActions = (
  actions: Partial<AutomationRuleActions>,
  dictionaries: {
    folders: ServiceDeskFolder[];
    entities: ServiceDeskEntity[];
    types: ServiceDeskTicketType[];
    subtypes: ServiceDeskTicketSubtype[];
    users: TeamUser[];
  }
) => {
  const parts: string[] = [];

  if (actions.setFolderId) {
    parts.push(`перенести в папку «${getDictionaryName(dictionaries.folders, actions.setFolderId)}»`);
  }
  if (actions.setEntityId) {
    parts.push(`поставить категорию «${getDictionaryName(dictionaries.entities, actions.setEntityId)}»`);
  }
  if (actions.setTypeId) {
    parts.push(`поставить тип «${getDictionaryName(dictionaries.types, actions.setTypeId)}»`);
  }
  if (actions.setSubtypeId) {
    parts.push(`поставить подтип «${getDictionaryName(dictionaries.subtypes, actions.setSubtypeId)}»`);
  }
  if (actions.setPriority) {
    parts.push(`сменить приоритет на «${priorityLabels[actions.setPriority]}»`);
  }
  if (Object.prototype.hasOwnProperty.call(actions, 'setAssigneeIds')) {
    const assigneeIds = actions.setAssigneeIds || [];
    parts.push(
      assigneeIds.length > 0
        ? `заменить исполнителей: ${assigneeIds.map((id) => getUserName(dictionaries.users, id)).join(', ')}`
        : 'очистить список исполнителей'
    );
  }

  return parts.length > 0 ? parts : ['Изменений нет.'];
};

export const AutomationRulesAdminSection: React.FC = () => {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [selectedRule, setSelectedRule] = useState<AutomationRule | null>(null);
  const [folders, setFolders] = useState<ServiceDeskFolder[]>([]);
  const [entities, setEntities] = useState<ServiceDeskEntity[]>([]);
  const [types, setTypes] = useState<ServiceDeskTicketType[]>([]);
  const [subtypes, setSubtypes] = useState<ServiceDeskTicketSubtype[]>([]);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingSupporting, setLoadingSupporting] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState('');
  const [form, setForm] = useState<AutomationRuleFormState>(emptyFormState);
  const [saving, setSaving] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState('');
  const [testTaskId, setTestTaskId] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<AutomationRuleTestResult | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runTaskFilter, setRunTaskFilter] = useState('');
  const [runRuleFilter, setRunRuleFilter] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadRules = useCallback(async (preferredRuleId?: string) => {
    setLoadingRules(true);
    try {
      const nextRules = await automationRulesApi.getAll();
      setRules(nextRules);

      const candidateId = preferredRuleId || selectedRuleId;
      const nextSelectedId = candidateId && nextRules.some((rule) => rule.id === candidateId)
        ? candidateId
        : nextRules[0]?.id || '';

      setSelectedRuleId(nextSelectedId);
      setSelectedRule(nextRules.find((rule) => rule.id === nextSelectedId) || null);
    } catch (loadError) {
      setRules([]);
      setSelectedRuleId('');
      setSelectedRule(null);
      setError(getApiErrorMessage(loadError, 'Не удалось загрузить правила автоматизации.'));
    } finally {
      setLoadingRules(false);
    }
  }, [selectedRuleId]);

  const loadSupportingData = useCallback(async () => {
    setLoadingSupporting(true);
    try {
      const [foldersData, entitiesData, typesData, subtypesData, usersData] = await Promise.all([
        serviceDeskFoldersApi.getManaged(),
        ticketEntitiesApi.getManaged(),
        ticketTypesApi.getManaged(),
        ticketSubtypesApi.getManaged(),
        usersApi.getAll(),
      ]);

      setFolders(foldersData);
      setEntities(entitiesData);
      setTypes(typesData);
      setSubtypes(subtypesData);
      setUsers(usersData);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'Не удалось загрузить справочники для automation rules.'));
    } finally {
      setLoadingSupporting(false);
    }
  }, []);

  const loadRuleDetail = useCallback(async (ruleId: string) => {
    if (!ruleId) {
      setSelectedRule(null);
      return;
    }

    setLoadingDetail(true);
    try {
      const rule = await automationRulesApi.getById(ruleId);
      setSelectedRule(rule);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'Не удалось загрузить карточку правила.'));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const effectiveRuleId = runRuleFilter.trim() || selectedRuleId;
      const data = await automationRunsApi.getAll({
        taskId: runTaskFilter.trim() || undefined,
        ruleId: effectiveRuleId || undefined,
      });
      setRuns(data);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'Не удалось загрузить журнал запусков.'));
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }, [runRuleFilter, runTaskFilter, selectedRuleId]);

  useEffect(() => {
    void loadRules();
    void loadSupportingData();
  }, [loadRules, loadSupportingData]);

  useEffect(() => {
    if (selectedRuleId) {
      void loadRuleDetail(selectedRuleId);
      void loadRuns();
      setTestResult(null);
    } else {
      setSelectedRule(null);
      setRuns([]);
      setTestResult(null);
    }
  }, [loadRuleDetail, loadRuns, selectedRuleId]);

  const openCreateModal = () => {
    setEditingRuleId('');
    setForm(emptyFormState());
    setModalOpen(true);
  };

  const openEditModal = (rule: AutomationRule) => {
    setEditingRuleId(rule.id);
    setForm(mapRuleToFormState(rule));
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) {
      return;
    }

    setModalOpen(false);
    setEditingRuleId('');
    setForm(emptyFormState());
  };

  const saveRule = async () => {
    if (!form.name.trim()) {
      setError('Укажите название правила.');
      return;
    }

    if (!Number.isInteger(Number.parseInt(form.sortOrder, 10))) {
      setError('Порядок выполнения должен быть целым числом.');
      return;
    }

    if (!hasAnyConfiguredAction(form.actions)) {
      setError('Укажите хотя бы одно действие в блоке «Что изменится».');
      return;
    }

    const payload = buildRulePayload(form);

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const savedRule = editingRuleId
        ? await automationRulesApi.update(editingRuleId, payload)
        : await automationRulesApi.create(payload as CreateAutomationRuleInput);

      setSelectedRule(savedRule);
      setSelectedRuleId(savedRule.id);
      setModalOpen(false);
      setEditingRuleId('');
      setForm(emptyFormState());
      await loadRules(savedRule.id);
      setNotice(editingRuleId ? 'Правило обновлено.' : 'Правило создано.');
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, 'Не удалось сохранить правило.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (rule: AutomationRule) => {
    const confirmed = window.confirm(`Удалить правило «${rule.name}»?`);
    if (!confirmed) {
      return;
    }

    setActionInProgressId(rule.id);
    setError('');
    setNotice('');
    try {
      await automationRulesApi.delete(rule.id);
      if (selectedRuleId === rule.id) {
        setSelectedRuleId('');
        setSelectedRule(null);
      }
      await loadRules();
      setNotice('Правило удалено.');
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, 'Не удалось удалить правило.'));
    } finally {
      setActionInProgressId('');
    }
  };

  const toggleRule = async (rule: AutomationRule) => {
    setActionInProgressId(rule.id);
    setError('');
    setNotice('');
    try {
      const updatedRule = await automationRulesApi.update(rule.id, { isActive: !rule.isActive });
      setSelectedRule((current) => current?.id === updatedRule.id ? updatedRule : current);
      await loadRules(updatedRule.id);
      setNotice(updatedRule.isActive ? 'Правило включено.' : 'Правило отключено.');
    } catch (toggleError) {
      setError(getApiErrorMessage(toggleError, 'Не удалось изменить состояние правила.'));
    } finally {
      setActionInProgressId('');
    }
  };

  const runDryTest = async () => {
    if (!selectedRule) {
      setError('Сначала выберите правило для проверки.');
      return;
    }

    if (!testTaskId.trim()) {
      setError('Укажите служебный ID заявки для проверки.');
      return;
    }

    setTestLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await automationRulesApi.test(selectedRule.id, { taskId: testTaskId.trim() });
      setTestResult(result);
      setNotice(result.success ? 'Безопасная проверка выполнена.' : 'Проверка завершилась с ошибкой сервера.');
    } catch (testError) {
      setTestResult(null);
      setError(getApiErrorMessage(testError, 'Не удалось выполнить безопасную проверку.'));
    } finally {
      setTestLoading(false);
    }
  };

  const effectiveRunRuleFilter = runRuleFilter.trim() || selectedRuleId;
  const conditionTypeOptions = getFilteredTypes(
    types,
    form.conditions.folderId,
    form.conditions.entityId,
    form.conditions.typeId
  );
  const conditionSubtypeOptions = getFilteredSubtypes(
    subtypes,
    form.conditions.folderId,
    form.conditions.typeId,
    form.conditions.subtypeId
  );
  const actionTypeOptions = getFilteredTypes(
    types,
    form.actions.setFolderId,
    form.actions.setEntityId,
    form.actions.setTypeId
  );
  const actionSubtypeOptions = getFilteredSubtypes(
    subtypes,
    form.actions.setFolderId,
    form.actions.setTypeId,
    form.actions.setSubtypeId
  );

  return (
    <div className="space-y-5" data-testid="automation-rules-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#1f1f1f]">Автоматизация</h2>
          <p className="mt-1 text-sm text-[#727272]">
            Правила срабатывают после создания заявки и помогают автоматически расставлять папку, тип, приоритет и исполнителей.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn inline-flex items-center gap-2"
            onClick={() => {
              void loadRules(selectedRuleId || undefined);
              void loadRuns();
            }}
            disabled={loadingRules || runsLoading}
          >
            <RotateCcw size={15} />
            Обновить
          </button>
          <button
            type="button"
            className="btn btn-primary inline-flex items-center gap-2"
            onClick={openCreateModal}
            data-testid="automation-rule-create"
          >
            <Plus size={15} />
            Новое правило
          </button>
        </div>
      </div>

      <div className="rounded-[12px] border border-[#e5e5e5] bg-[#fcfcfc] px-4 py-3 text-sm text-[#5f5f5f]">
        Пустое значение в блоке условий означает «не ограничивать». Пустое значение в действиях означает «не менять».
        Для исполнителей это видно отдельно: если включить замену исполнителей и оставить список пустым, правило очистит текущих исполнителей.
      </div>

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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <div className="space-y-4">
          <Card padding="sm" className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#1f1f1f]">
              <Sparkles size={16} />
              Список правил
            </div>
            <p className="text-sm text-[#727272]">
              Правила выполняются по возрастанию указанного порядка. Каждое следующее правило видит уже обновлённую заявку.
            </p>
          </Card>

          {loadingRules || loadingSupporting ? (
            <DataState variant="loading" message="Загружаем правила и справочники автоматизации..." />
          ) : rules.length === 0 ? (
            <DataState variant="empty" message="Правил пока нет. Создайте первое правило для автоматизации маршрутизации." />
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => {
                const isSelected = rule.id === selectedRuleId;
                const conditionsText = describeConditions(rule.conditions, { folders, entities, types, subtypes });
                const actionsText = describeActions(rule.actions, { folders, entities, types, subtypes, users });

                return (
                  <Card
                    key={rule.id}
                    padding="sm"
                    className={`cursor-pointer border transition-all ${isSelected ? 'border-[#2f2f2f] shadow-[0_14px_30px_rgba(0,0,0,0.10)]' : ''}`}
                    onClick={() => setSelectedRuleId(rule.id)}
                    data-testid={`automation-rule-card-${rule.id}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-[#1f1f1f]">{rule.name}</h3>
                          <span className="chip">Порядок: {rule.sortOrder}</span>
                          <span className="chip">{triggerLabels[rule.triggerType]}</span>
                          <span className={`chip ${rule.isActive ? 'border-[#d2e7d8] bg-[#eef8f1] text-[#1f7a42]' : 'border-[#e7d7d7] bg-[#faf0f0] text-[#9d5151]'}`}>
                            {rule.isActive ? 'Включено' : 'Выключено'}
                          </span>
                        </div>
                        <p className="text-sm text-[#616161]">{rule.description || 'Без описания.'}</p>
                        <div className="space-y-2 text-sm text-[#4c4c4c]">
                          <div>
                            <span className="font-medium text-[#1f1f1f]">Если совпало:</span>{' '}
                            {conditionsText.join(' · ')}
                          </div>
                          <div>
                            <span className="font-medium text-[#1f1f1f]">Что изменится:</span>{' '}
                            {actionsText.join(' · ')}
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn inline-flex items-center gap-2"
                          onClick={(event) => {
                            event.stopPropagation();
                            void toggleRule(rule);
                          }}
                          disabled={actionInProgressId === rule.id}
                        >
                          {rule.isActive ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                          {rule.isActive ? 'Выключить' : 'Включить'}
                        </button>
                        <button
                          type="button"
                          className="btn inline-flex items-center gap-2"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditModal(selectedRule?.id === rule.id ? selectedRule : rule);
                          }}
                        >
                          <Pencil size={15} />
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="btn inline-flex items-center gap-2 border-[#efc1c1] text-[#b23b3b]"
                          onClick={(event) => {
                            event.stopPropagation();
                            void deleteRule(rule);
                          }}
                          disabled={actionInProgressId === rule.id}
                        >
                          <Trash2 size={15} />
                          Удалить
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card className="space-y-3" padding="sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#1f1f1f]">Выбранное правило</div>
                <p className="mt-1 text-sm text-[#727272]">
                  Безопасная проверка и журнал срабатываний работают по выбранному правилу.
                </p>
              </div>
              {loadingDetail && <span className="chip">Обновляем…</span>}
            </div>

            {!selectedRule ? (
              <DataState variant="empty" message="Выберите правило слева, чтобы проверить его и посмотреть последние запуски." />
            ) : (
              <div className="space-y-3">
                <div className="rounded-[12px] border border-[#e6e6e6] bg-[#fcfcfc] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-[#1f1f1f]">{selectedRule.name}</h3>
                    <span className="chip">{triggerLabels[selectedRule.triggerType]}</span>
                    <span className={`chip ${selectedRule.isActive ? 'border-[#d2e7d8] bg-[#eef8f1] text-[#1f7a42]' : 'border-[#e7d7d7] bg-[#faf0f0] text-[#9d5151]'}`}>
                      {selectedRule.isActive ? 'Включено' : 'Выключено'}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-[#4c4c4c]">
                    <div>
                      <span className="font-medium text-[#1f1f1f]">Условия:</span>{' '}
                      {describeConditions(selectedRule.conditions, { folders, entities, types, subtypes }).join(' · ')}
                    </div>
                    <div>
                      <span className="font-medium text-[#1f1f1f]">Действия:</span>{' '}
                      {describeActions(selectedRule.actions, { folders, entities, types, subtypes, users }).join(' · ')}
                    </div>
                  </div>
                </div>

                <div className="rounded-[12px] border border-[#e6e6e6] bg-white p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#1f1f1f]">
                    <Play size={15} />
                    Проверить правило
                  </div>
                  <p className="text-sm text-[#727272]">
                    Безопасная проверка ничего не меняет. Она только показывает, совпадут ли условия и какие действия были бы применены.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      className="input"
                      placeholder="Служебный ID заявки, например cm..."
                      value={testTaskId}
                      onChange={(event) => setTestTaskId(event.target.value)}
                      data-testid="automation-rule-test-task-id"
                    />
                    <button
                      type="button"
                      className="btn btn-primary inline-flex items-center justify-center gap-2 sm:min-w-[180px]"
                      onClick={() => void runDryTest()}
                      disabled={testLoading}
                      data-testid="automation-rule-test-run"
                    >
                      <Play size={15} />
                      {testLoading ? 'Проверяем...' : 'Проверить правило'}
                    </button>
                  </div>

                  {testResult && (
                    <div className="rounded-[12px] border border-[#e6e6e6] bg-[#fcfcfc] p-4 space-y-3" data-testid="automation-rule-test-result">
                      <div className="flex flex-wrap gap-2">
                        <span className={`chip ${testResult.matched ? 'border-[#d2e7d8] bg-[#eef8f1] text-[#1f7a42]' : ''}`}>
                          Совпадение: {testResult.matched ? 'да' : 'нет'}
                        </span>
                        <span className={`chip ${testResult.success ? 'border-[#d2e7d8] bg-[#eef8f1] text-[#1f7a42]' : 'border-[#e7d7d7] bg-[#faf0f0] text-[#9d5151]'}`}>
                          Результат: {testResult.success ? 'успешно' : 'ошибка'}
                        </span>
                      </div>

                      {testResult.errorMessage && (
                        <div className="rounded-[10px] border border-[#f0d4d4] bg-[#fff4f4] px-3 py-2 text-sm text-[#a94747]">
                          {testResult.errorMessage}
                        </div>
                      )}

                      <div className="space-y-2 text-sm text-[#4c4c4c]">
                        <div className="font-medium text-[#1f1f1f]">Какие действия были бы применены</div>
                        <div>
                          {describeActions(testResult.appliedActions, { folders, entities, types, subtypes, users }).join(' · ')}
                        </div>
                      </div>

                      <div className="space-y-2 text-sm text-[#4c4c4c]">
                        <div className="font-medium text-[#1f1f1f]">Как будет выглядеть заявка после правила</div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div className="rounded-[10px] border border-[#ececec] bg-white px-3 py-2">
                            <div className="text-xs text-[#8a8a8a]">Служебный ID заявки</div>
                            <div>{testResult.resultingTask.id}</div>
                          </div>
                          <div className="rounded-[10px] border border-[#ececec] bg-white px-3 py-2">
                            <div className="text-xs text-[#8a8a8a]">Приоритет</div>
                            <div>{priorityLabels[testResult.resultingTask.priority]}</div>
                          </div>
                          <div className="rounded-[10px] border border-[#ececec] bg-white px-3 py-2">
                            <div className="text-xs text-[#8a8a8a]">Папка</div>
                            <div>{getDictionaryName(folders, testResult.resultingTask.folderId)}</div>
                          </div>
                          <div className="rounded-[10px] border border-[#ececec] bg-white px-3 py-2">
                            <div className="text-xs text-[#8a8a8a]">Категория</div>
                            <div>{getDictionaryName(entities, testResult.resultingTask.entityId)}</div>
                          </div>
                          <div className="rounded-[10px] border border-[#ececec] bg-white px-3 py-2">
                            <div className="text-xs text-[#8a8a8a]">Тип</div>
                            <div>{getDictionaryName(types, testResult.resultingTask.typeId)}</div>
                          </div>
                          <div className="rounded-[10px] border border-[#ececec] bg-white px-3 py-2">
                            <div className="text-xs text-[#8a8a8a]">Подтип</div>
                            <div>{getDictionaryName(subtypes, testResult.resultingTask.subtypeId)}</div>
                          </div>
                          <div className="rounded-[10px] border border-[#ececec] bg-white px-3 py-2 sm:col-span-2">
                            <div className="text-xs text-[#8a8a8a]">Исполнители</div>
                            <div>
                              {testResult.resultingTask.assigneeIds.length > 0
                                ? testResult.resultingTask.assigneeIds.map((id) => getUserName(users, id)).join(', ')
                                : 'Не назначены'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-[12px] border border-[#e6e6e6] bg-white p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#1f1f1f]">
                    <CheckCircle2 size={15} />
                    Журнал срабатываний
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm text-[#5f5f5f]">Служебный ID заявки</label>
                      <input
                        className="input"
                        placeholder="Например, cm..."
                        value={runTaskFilter}
                        onChange={(event) => setRunTaskFilter(event.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-[#5f5f5f]">Служебный ID правила</label>
                      <input
                        className="input"
                        placeholder={selectedRuleId ? `Выбрано: ${selectedRuleId}` : 'Введите ID правила'}
                        value={runRuleFilter}
                        onChange={(event) => setRunRuleFilter(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void loadRuns()}
                      disabled={runsLoading}
                    >
                      {runsLoading ? 'Загружаем...' : 'Показать запуски'}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setRunTaskFilter('');
                        setRunRuleFilter('');
                      }}
                    >
                      Сбросить фильтры
                    </button>
                    {effectiveRunRuleFilter && !runRuleFilter.trim() && (
                      <span className="chip">Показаны запуски выбранного правила</span>
                    )}
                  </div>

                  {runsLoading ? (
                    <DataState variant="loading" message="Загружаем журнал запусков..." />
                  ) : runs.length === 0 ? (
                    <DataState variant="empty" message="Подходящих запусков пока нет." />
                  ) : (
                    <div className="space-y-2" data-testid="automation-runs-list">
                      {runs.map((run) => (
                        <div key={run.id} className="rounded-[10px] border border-[#ececec] bg-[#fcfcfc] px-3 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-medium text-[#1f1f1f]">{run.ruleName}</div>
                              <div className="mt-1 text-xs text-[#8a8a8a]">
                                ID заявки: {run.taskId} · {triggerLabels[run.triggerType]} · {formatDateTime(run.createdAt)}
                              </div>
                            </div>
                            <span className={`chip ${run.status === 'SUCCESS' ? 'border-[#d2e7d8] bg-[#eef8f1] text-[#1f7a42]' : 'border-[#e7d7d7] bg-[#faf0f0] text-[#9d5151]'}`}>
                              {runStatusLabels[run.status]}
                            </span>
                          </div>

                          {run.errorMessage && (
                            <div className="mt-3 rounded-[10px] border border-[#f0d4d4] bg-[#fff4f4] px-3 py-2 text-sm text-[#a94747]">
                              <div className="mb-1 flex items-center gap-2 font-medium">
                                <ShieldAlert size={15} />
                                Ошибка выполнения
                              </div>
                              {run.errorMessage}
                            </div>
                          )}

                          <div className="mt-3 text-sm text-[#4c4c4c]">
                            <span className="font-medium text-[#1f1f1f]">Применённые действия:</span>{' '}
                            {describeActions(run.appliedActions, { folders, entities, types, subtypes, users }).join(' · ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingRuleId ? 'Редактировать правило' : 'Новое правило автоматизации'}
        testId="automation-rule-modal"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-[#5f5f5f]">Название *</label>
              <input
                className="input"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                disabled={saving}
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-[#5f5f5f]">Описание</label>
              <textarea
                className="input min-h-[88px]"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                disabled={saving}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#5f5f5f]">Триггер</label>
              <select
                className="input"
                value={form.triggerType}
                onChange={(event) => setForm((current) => ({ ...current, triggerType: event.target.value as AutomationRuleTriggerType }))}
                disabled={saving}
              >
                {Object.entries(triggerLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#5f5f5f]">Порядок выполнения</label>
              <input
                className="input"
                type="number"
                value={form.sortOrder}
                onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
                disabled={saving}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-[#4a4a4a] md:col-span-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                disabled={saving}
              />
              Правило включено
            </label>
          </div>

          <div className="rounded-[12px] border border-[#e6e6e6] bg-[#fcfcfc] p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-[#1f1f1f]">Когда срабатывать</h3>
              <p className="mt-1 text-xs text-[#8a8a8a]">Пустые поля означают, что правило не ограничивается этим признаком.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Канал</label>
                <select
                  className="input"
                  value={form.conditions.channel}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    conditions: { ...current.conditions, channel: event.target.value as AutomationRuleFormState['conditions']['channel'] },
                  }))}
                  disabled={saving}
                >
                  <option value="">Не ограничивать</option>
                  {Object.entries(channelLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Приоритет</label>
                <select
                  className="input"
                  value={form.conditions.priority}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    conditions: { ...current.conditions, priority: event.target.value as AutomationRuleFormState['conditions']['priority'] },
                  }))}
                  disabled={saving}
                >
                  <option value="">Не ограничивать</option>
                  {Object.entries(priorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Папка</label>
                <select
                  className="input"
                  value={form.conditions.folderId}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    conditions: { ...current.conditions, folderId: event.target.value },
                  }))}
                  disabled={saving}
                >
                  <option value="">Не ограничивать</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Категория обращения</label>
                <select
                  className="input"
                  value={form.conditions.entityId}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    conditions: { ...current.conditions, entityId: event.target.value },
                  }))}
                  disabled={saving}
                >
                  <option value="">Не ограничивать</option>
                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>{entity.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Тип заявки</label>
                <select
                  className="input"
                  value={form.conditions.typeId}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    conditions: {
                      ...current.conditions,
                      typeId: event.target.value,
                      subtypeId: current.conditions.subtypeId && !conditionSubtypeOptions.some((subtype) => subtype.id === current.conditions.subtypeId)
                        ? ''
                        : current.conditions.subtypeId,
                    },
                  }))}
                  disabled={saving}
                >
                  <option value="">Не ограничивать</option>
                  {conditionTypeOptions.map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Подтип заявки</label>
                <select
                  className="input"
                  value={form.conditions.subtypeId}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    conditions: { ...current.conditions, subtypeId: event.target.value },
                  }))}
                  disabled={saving}
                >
                  <option value="">Не ограничивать</option>
                  {conditionSubtypeOptions.map((subtype) => (
                    <option key={subtype.id} value={subtype.id}>{subtype.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Email содержит</label>
                <input
                  className="input"
                  value={form.conditions.requesterEmailContains}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    conditions: { ...current.conditions, requesterEmailContains: event.target.value },
                  }))}
                  placeholder="Например, @company.ru"
                  disabled={saving}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Заголовок содержит</label>
                <input
                  className="input"
                  value={form.conditions.titleContains}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    conditions: { ...current.conditions, titleContains: event.target.value },
                  }))}
                  placeholder="Например, vpn"
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          <div className="rounded-[12px] border border-[#e6e6e6] bg-white p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-[#1f1f1f]">Что изменить, если правило совпало</h3>
              <p className="mt-1 text-xs text-[#8a8a8a]">Пустые поля ничего не меняют. Для исполнителей есть отдельный переключатель.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Новая папка</label>
                <select
                  className="input"
                  value={form.actions.setFolderId}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    actions: { ...current.actions, setFolderId: event.target.value },
                  }))}
                  disabled={saving}
                >
                  <option value="">Не менять</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Новая категория</label>
                <select
                  className="input"
                  value={form.actions.setEntityId}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    actions: { ...current.actions, setEntityId: event.target.value },
                  }))}
                  disabled={saving}
                >
                  <option value="">Не менять</option>
                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>{entity.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Новый тип</label>
                <select
                  className="input"
                  value={form.actions.setTypeId}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    actions: {
                      ...current.actions,
                      setTypeId: event.target.value,
                      setSubtypeId: current.actions.setSubtypeId && !actionSubtypeOptions.some((subtype) => subtype.id === current.actions.setSubtypeId)
                        ? ''
                        : current.actions.setSubtypeId,
                    },
                  }))}
                  disabled={saving}
                >
                  <option value="">Не менять</option>
                  {actionTypeOptions.map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Новый подтип</label>
                <select
                  className="input"
                  value={form.actions.setSubtypeId}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    actions: { ...current.actions, setSubtypeId: event.target.value },
                  }))}
                  disabled={saving}
                >
                  <option value="">Не менять</option>
                  {actionSubtypeOptions.map((subtype) => (
                    <option key={subtype.id} value={subtype.id}>{subtype.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Новый приоритет</label>
                <select
                  className="input"
                  value={form.actions.setPriority}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    actions: { ...current.actions, setPriority: event.target.value as AutomationRuleFormState['actions']['setPriority'] },
                  }))}
                  disabled={saving}
                >
                  <option value="">Не менять</option>
                  {Object.entries(priorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="flex items-center gap-2 text-sm text-[#4a4a4a]">
                  <input
                    type="checkbox"
                    checked={form.actions.replaceAssignees}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      actions: {
                        ...current.actions,
                        replaceAssignees: event.target.checked,
                        setAssigneeIds: event.target.checked ? current.actions.setAssigneeIds : [],
                      },
                    }))}
                    disabled={saving}
                  />
                  Заменить исполнителей
                </label>
                {form.actions.replaceAssignees && (
                  <>
                    <select
                      className="input h-28"
                      multiple
                      value={form.actions.setAssigneeIds}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        actions: {
                          ...current.actions,
                          setAssigneeIds: Array.from(event.target.selectedOptions).map((option) => option.value),
                        },
                      }))}
                      disabled={saving}
                    >
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} · {getRoleLabel(user.role)}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-[#8a8a8a]">
                      Если оставить список пустым, правило очистит текущих исполнителей.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={closeModal} disabled={saving}>Отмена</button>
            <button type="button" className="btn btn-primary" onClick={() => void saveRule()} disabled={saving}>
              {saving ? 'Сохраняем...' : 'Сохранить правило'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
