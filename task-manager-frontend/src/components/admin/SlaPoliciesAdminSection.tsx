import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Play, Plus, RotateCcw, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { slaPoliciesApi, serviceDeskFoldersApi, ticketSubtypesApi, ticketTypesApi } from '../../api';
import { Card } from '../ui/Card';
import { DataState } from '../ui/DataState';
import { Modal } from '../ui/Modal';
import { SlaStatusPill } from '../ui/SlaBadge';
import type {
  CreateSlaPolicyInput,
  ServiceDeskFolder,
  ServiceDeskTicketSubtype,
  ServiceDeskTicketType,
  SlaPolicy,
  SlaPolicyTestResult,
  TaskPriority,
  UpdateSlaPolicyInput,
} from '../../types';
import { formatDateTime, priorityLabels } from '../../utils';

interface SlaPolicyFormState {
  name: string;
  description: string;
  isActive: boolean;
  sortOrder: string;
  folderId: string;
  typeId: string;
  subtypeId: string;
  priority: '' | TaskPriority;
  firstResponseMinutes: string;
  resolutionMinutes: string;
}

const emptyFormState = (): SlaPolicyFormState => ({
  name: '',
  description: '',
  isActive: true,
  sortOrder: '0',
  folderId: '',
  typeId: '',
  subtypeId: '',
  priority: '',
  firstResponseMinutes: '',
  resolutionMinutes: '',
});

const getApiErrorMessage = (error: unknown, fallback: string) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 403) {
    return 'Недостаточно прав для управления SLA. Нужна роль администратора.';
  }

  const response = (error as { response?: { data?: { error?: string; message?: string } } })?.response;
  return response?.data?.error || response?.data?.message || fallback;
};

const getDictionaryName = <T extends { id: string; name: string }>(items: T[], id?: string | null, fallback = 'Любое значение') => {
  if (!id) {
    return fallback;
  }

  return items.find((item) => item.id === id)?.name || id;
};

const toNullableString = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toNullableInteger = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? Number.parseInt(trimmed, 10) : null;
};

const mapPolicyToFormState = (policy: SlaPolicy): SlaPolicyFormState => ({
  name: policy.name,
  description: policy.description || '',
  isActive: policy.isActive,
  sortOrder: String(policy.sortOrder),
  folderId: policy.folderId || '',
  typeId: policy.typeId || '',
  subtypeId: policy.subtypeId || '',
  priority: policy.priority || '',
  firstResponseMinutes: policy.firstResponseMinutes ? String(policy.firstResponseMinutes) : '',
  resolutionMinutes: policy.resolutionMinutes ? String(policy.resolutionMinutes) : '',
});

const buildPolicyPayload = (
  form: SlaPolicyFormState
): CreateSlaPolicyInput | UpdateSlaPolicyInput => ({
  name: form.name.trim(),
  description: toNullableString(form.description),
  isActive: form.isActive,
  sortOrder: Number.parseInt(form.sortOrder, 10),
  folderId: toNullableString(form.folderId),
  typeId: toNullableString(form.typeId),
  subtypeId: toNullableString(form.subtypeId),
  priority: form.priority || null,
  firstResponseMinutes: toNullableInteger(form.firstResponseMinutes),
  resolutionMinutes: toNullableInteger(form.resolutionMinutes),
});

const hasAnyDeadline = (form: SlaPolicyFormState) =>
  Boolean(form.firstResponseMinutes.trim() || form.resolutionMinutes.trim());

const getFilteredTypes = (
  types: ServiceDeskTicketType[],
  folderId: string,
  selectedTypeId: string
) => types.filter((type) => {
  if (type.id === selectedTypeId) {
    return true;
  }

  return !folderId || !type.folderId || type.folderId === folderId;
});

const getFilteredSubtypes = (
  subtypes: ServiceDeskTicketSubtype[],
  typeId: string,
  selectedSubtypeId: string
) => subtypes.filter((subtype) => {
  if (subtype.id === selectedSubtypeId) {
    return true;
  }

  return !typeId || !subtype.typeId || subtype.typeId === typeId;
});

const describePolicyMatch = (
  policy: SlaPolicy,
  dictionaries: {
    folders: ServiceDeskFolder[];
    types: ServiceDeskTicketType[];
    subtypes: ServiceDeskTicketSubtype[];
  }
) => {
  const parts = [
    `папка: ${getDictionaryName(dictionaries.folders, policy.folderId)}`,
    `тип: ${getDictionaryName(dictionaries.types, policy.typeId)}`,
    `подтип: ${getDictionaryName(dictionaries.subtypes, policy.subtypeId)}`,
    `приоритет: ${policy.priority ? priorityLabels[policy.priority] : 'Любой'}`,
  ];

  return parts;
};

const describePolicyDeadlines = (policy: SlaPolicy) => {
  const parts: string[] = [];

  if (policy.firstResponseMinutes) {
    parts.push(`первый ответ: ${policy.firstResponseMinutes} мин`);
  }
  if (policy.resolutionMinutes) {
    parts.push(`решение: ${policy.resolutionMinutes} мин`);
  }

  return parts.length > 0 ? parts : ['SLA-сроки не заданы'];
};

export const SlaPoliciesAdminSection: React.FC = () => {
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState<SlaPolicy | null>(null);
  const [folders, setFolders] = useState<ServiceDeskFolder[]>([]);
  const [types, setTypes] = useState<ServiceDeskTicketType[]>([]);
  const [subtypes, setSubtypes] = useState<ServiceDeskTicketSubtype[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingSupporting, setLoadingSupporting] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState('');
  const [form, setForm] = useState<SlaPolicyFormState>(emptyFormState);
  const [saving, setSaving] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState('');
  const [testTaskId, setTestTaskId] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<SlaPolicyTestResult | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadPolicies = useCallback(async (preferredPolicyId?: string) => {
    setLoadingPolicies(true);
    try {
      const nextPolicies = await slaPoliciesApi.getAll();
      setPolicies(nextPolicies);

      const candidateId = preferredPolicyId || selectedPolicyId;
      const nextSelectedId = candidateId && nextPolicies.some((policy) => policy.id === candidateId)
        ? candidateId
        : nextPolicies[0]?.id || '';

      setSelectedPolicyId(nextSelectedId);
      setSelectedPolicy(nextPolicies.find((policy) => policy.id === nextSelectedId) || null);
    } catch (loadError) {
      setPolicies([]);
      setSelectedPolicyId('');
      setSelectedPolicy(null);
      setError(getApiErrorMessage(loadError, 'Не удалось загрузить SLA policies.'));
    } finally {
      setLoadingPolicies(false);
    }
  }, [selectedPolicyId]);

  const loadSupportingData = useCallback(async () => {
    setLoadingSupporting(true);
    try {
      const [foldersData, typesData, subtypesData] = await Promise.all([
        serviceDeskFoldersApi.getManaged(),
        ticketTypesApi.getManaged(),
        ticketSubtypesApi.getManaged(),
      ]);

      setFolders(foldersData);
      setTypes(typesData);
      setSubtypes(subtypesData);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'Не удалось загрузить справочники для SLA.'));
    } finally {
      setLoadingSupporting(false);
    }
  }, []);

  const loadPolicyDetail = useCallback(async (policyId: string) => {
    if (!policyId) {
      setSelectedPolicy(null);
      return;
    }

    setLoadingDetail(true);
    try {
      const policy = await slaPoliciesApi.getById(policyId);
      setSelectedPolicy(policy);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'Не удалось загрузить карточку SLA policy.'));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadPolicies();
    void loadSupportingData();
  }, [loadPolicies, loadSupportingData]);

  useEffect(() => {
    if (selectedPolicyId) {
      void loadPolicyDetail(selectedPolicyId);
      setTestResult(null);
    } else {
      setSelectedPolicy(null);
      setTestResult(null);
    }
  }, [loadPolicyDetail, selectedPolicyId]);

  const openCreateModal = () => {
    setEditingPolicyId('');
    setForm(emptyFormState());
    setModalOpen(true);
  };

  const openEditModal = (policy: SlaPolicy) => {
    setEditingPolicyId(policy.id);
    setForm(mapPolicyToFormState(policy));
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) {
      return;
    }

    setModalOpen(false);
    setEditingPolicyId('');
    setForm(emptyFormState());
  };

  const savePolicy = async () => {
    if (!form.name.trim()) {
      setError('Укажите название SLA policy.');
      return;
    }

    if (!Number.isInteger(Number.parseInt(form.sortOrder, 10))) {
      setError('sortOrder должен быть целым числом.');
      return;
    }

    if (!hasAnyDeadline(form)) {
      setError('Укажите хотя бы один SLA-срок: первый ответ или решение.');
      return;
    }

    if (form.firstResponseMinutes.trim() && Number.parseInt(form.firstResponseMinutes, 10) <= 0) {
      setError('Срок первого ответа должен быть больше нуля.');
      return;
    }

    if (form.resolutionMinutes.trim() && Number.parseInt(form.resolutionMinutes, 10) <= 0) {
      setError('Срок решения должен быть больше нуля.');
      return;
    }

    const payload = buildPolicyPayload(form);

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const savedPolicy = editingPolicyId
        ? await slaPoliciesApi.update(editingPolicyId, payload)
        : await slaPoliciesApi.create(payload as CreateSlaPolicyInput);

      setSelectedPolicy(savedPolicy);
      setSelectedPolicyId(savedPolicy.id);
      setModalOpen(false);
      setEditingPolicyId('');
      setForm(emptyFormState());
      await loadPolicies(savedPolicy.id);
      setNotice(editingPolicyId ? 'SLA policy обновлена.' : 'SLA policy создана.');
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, 'Не удалось сохранить SLA policy.'));
    } finally {
      setSaving(false);
    }
  };

  const deletePolicy = async (policy: SlaPolicy) => {
    const confirmed = window.confirm(`Удалить SLA policy «${policy.name}»?`);
    if (!confirmed) {
      return;
    }

    setActionInProgressId(policy.id);
    setError('');
    setNotice('');
    try {
      await slaPoliciesApi.delete(policy.id);
      if (selectedPolicyId === policy.id) {
        setSelectedPolicyId('');
        setSelectedPolicy(null);
      }
      await loadPolicies();
      setNotice('SLA policy удалена.');
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, 'Не удалось удалить SLA policy.'));
    } finally {
      setActionInProgressId('');
    }
  };

  const togglePolicy = async (policy: SlaPolicy) => {
    setActionInProgressId(policy.id);
    setError('');
    setNotice('');
    try {
      const updatedPolicy = await slaPoliciesApi.update(policy.id, { isActive: !policy.isActive });
      setSelectedPolicy((current) => current?.id === updatedPolicy.id ? updatedPolicy : current);
      await loadPolicies(updatedPolicy.id);
      setNotice(updatedPolicy.isActive ? 'SLA policy включена.' : 'SLA policy отключена.');
    } catch (toggleError) {
      setError(getApiErrorMessage(toggleError, 'Не удалось изменить состояние SLA policy.'));
    } finally {
      setActionInProgressId('');
    }
  };

  const runDryTest = async () => {
    if (!selectedPolicy) {
      setError('Сначала выберите SLA policy для проверки.');
      return;
    }

    if (!testTaskId.trim()) {
      setError('Укажите taskId для dry-run проверки.');
      return;
    }

    setTestLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await slaPoliciesApi.test(selectedPolicy.id, { taskId: testTaskId.trim() });
      setTestResult(result);
      setNotice('Dry-run SLA выполнен.');
    } catch (testError) {
      setTestResult(null);
      setError(getApiErrorMessage(testError, 'Не удалось выполнить dry-run SLA.'));
    } finally {
      setTestLoading(false);
    }
  };

  const typeOptions = getFilteredTypes(types, form.folderId, form.typeId);
  const subtypeOptions = getFilteredSubtypes(subtypes, form.typeId, form.subtypeId);

  return (
    <div className="space-y-5" data-testid="sla-policies-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#1f1f1f]">SLA policies</h2>
          <p className="mt-1 text-sm text-[#727272]">
            Политики SLA определяют сроки первого ответа и решения по папке, типу, подтипу и приоритету заявки.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn inline-flex items-center gap-2"
            onClick={() => void loadPolicies(selectedPolicyId || undefined)}
            disabled={loadingPolicies}
          >
            <RotateCcw size={15} />
            Обновить
          </button>
          <button
            type="button"
            className="btn btn-primary inline-flex items-center gap-2"
            onClick={openCreateModal}
            data-testid="sla-policy-create"
          >
            <Plus size={15} />
            Новая SLA policy
          </button>
        </div>
      </div>

      <div className="rounded-[12px] border border-[#e5e5e5] bg-[#fcfcfc] px-4 py-3 text-sm text-[#5f5f5f]">
        Пустые поля `папка`, `тип`, `подтип` и `приоритет` означают, что policy подходит для любого значения. Если срок не указан, этот SLA-таймер не считается.
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="space-y-4">
          <Card padding="sm" className="space-y-3">
            <div className="text-sm font-semibold text-[#1f1f1f]">Список SLA policies</div>
            <p className="text-sm text-[#727272]">
              Backend выбирает первую подходящую policy по `sortOrder ASC`. Поэтому порядок здесь важен.
            </p>
          </Card>

          {loadingPolicies || loadingSupporting ? (
            <DataState variant="loading" message="Загружаем SLA policies и справочники..." />
          ) : policies.length === 0 ? (
            <DataState variant="empty" message="SLA policies пока нет. Создайте первую policy для контроля сроков." />
          ) : (
            <div className="space-y-3">
              {policies.map((policy) => (
                <Card
                  key={policy.id}
                  padding="sm"
                  className={`cursor-pointer border transition-all ${policy.id === selectedPolicyId ? 'border-[#2f2f2f] shadow-[0_14px_30px_rgba(0,0,0,0.10)]' : ''}`}
                  onClick={() => setSelectedPolicyId(policy.id)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-[#1f1f1f]">{policy.name}</h3>
                        <span className="chip">Порядок: {policy.sortOrder}</span>
                        <span className={`chip ${policy.isActive ? 'border-[#d2e7d8] bg-[#eef8f1] text-[#1f7a42]' : 'border-[#e7d7d7] bg-[#faf0f0] text-[#9d5151]'}`}>
                          {policy.isActive ? 'Включено' : 'Выключено'}
                        </span>
                      </div>
                      <p className="text-sm text-[#616161]">{policy.description || 'Без описания.'}</p>
                      <div className="space-y-2 text-sm text-[#4c4c4c]">
                        <div>
                          <span className="font-medium text-[#1f1f1f]">Для каких заявок:</span>{' '}
                          {describePolicyMatch(policy, { folders, types, subtypes }).join(' · ')}
                        </div>
                        <div>
                          <span className="font-medium text-[#1f1f1f]">Какие сроки:</span>{' '}
                          {describePolicyDeadlines(policy).join(' · ')}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn inline-flex items-center gap-2"
                        onClick={(event) => {
                          event.stopPropagation();
                          void togglePolicy(policy);
                        }}
                        disabled={actionInProgressId === policy.id}
                      >
                        {policy.isActive ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                        {policy.isActive ? 'Выключить' : 'Включить'}
                      </button>
                      <button
                        type="button"
                        className="btn inline-flex items-center gap-2"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditModal(selectedPolicy?.id === policy.id ? selectedPolicy : policy);
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
                          void deletePolicy(policy);
                        }}
                        disabled={actionInProgressId === policy.id}
                      >
                        <Trash2 size={15} />
                        Удалить
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card className="space-y-3" padding="sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#1f1f1f]">Выбранная SLA policy</div>
                <p className="mt-1 text-sm text-[#727272]">
                  Здесь можно быстро проверить, к каким заявкам policy подходит и что она выставит в dry-run.
                </p>
              </div>
              {loadingDetail && <span className="chip">Обновляем…</span>}
            </div>

            {!selectedPolicy ? (
              <DataState variant="empty" message="Выберите SLA policy слева, чтобы проверить её на существующей заявке." />
            ) : (
              <div className="space-y-3">
                <div className="rounded-[12px] border border-[#e6e6e6] bg-[#fcfcfc] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-[#1f1f1f]">{selectedPolicy.name}</h3>
                    <span className={`chip ${selectedPolicy.isActive ? 'border-[#d2e7d8] bg-[#eef8f1] text-[#1f7a42]' : 'border-[#e7d7d7] bg-[#faf0f0] text-[#9d5151]'}`}>
                      {selectedPolicy.isActive ? 'Включено' : 'Выключено'}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-[#4c4c4c]">
                    <div>
                      <span className="font-medium text-[#1f1f1f]">Матчинг:</span>{' '}
                      {describePolicyMatch(selectedPolicy, { folders, types, subtypes }).join(' · ')}
                    </div>
                    <div>
                      <span className="font-medium text-[#1f1f1f]">Сроки:</span>{' '}
                      {describePolicyDeadlines(selectedPolicy).join(' · ')}
                    </div>
                  </div>
                </div>

                <div className="rounded-[12px] border border-[#e6e6e6] bg-white p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#1f1f1f]">
                    <Play size={15} />
                    Проверить SLA policy
                  </div>
                  <p className="text-sm text-[#727272]">
                    Dry-run ничего не меняет в backend. Он только показывает, совпадёт ли policy и какие SLA даты и статусы получатся.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      className="input"
                      placeholder="taskId для проверки"
                      value={testTaskId}
                      onChange={(event) => setTestTaskId(event.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-primary inline-flex items-center justify-center gap-2 sm:min-w-[180px]"
                      onClick={() => void runDryTest()}
                      disabled={testLoading}
                      data-testid="sla-policy-test-run"
                    >
                      <Play size={15} />
                      {testLoading ? 'Проверяем...' : 'Проверить SLA'}
                    </button>
                  </div>

                  {testResult && (
                    <div className="rounded-[12px] border border-[#e6e6e6] bg-[#fcfcfc] p-4 space-y-3" data-testid="sla-policy-test-result">
                      <div className="flex flex-wrap gap-2">
                        <span className={`chip ${testResult.matched ? 'border-[#d2e7d8] bg-[#eef8f1] text-[#1f7a42]' : 'border-[#e7d7d7] bg-[#faf0f0] text-[#9d5151]'}`}>
                          Совпадение: {testResult.matched ? 'да' : 'нет'}
                        </span>
                        {testResult.policy?.name && (
                          <span className="chip">Policy: {testResult.policy.name}</span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-[10px] border border-[#ececec] bg-white px-3 py-3">
                          <div className="text-xs text-[#8a8a8a]">Срок первого ответа</div>
                          <div className="mt-1 text-sm font-medium text-[#1f1f1f]">
                            {testResult.resultingDueDates.firstResponseDueAt ? formatDateTime(testResult.resultingDueDates.firstResponseDueAt) : 'Не задано'}
                          </div>
                          <div className="mt-2">
                            <SlaStatusPill label="Статус" status={testResult.resultingStatuses.firstResponseStatus} />
                          </div>
                        </div>

                        <div className="rounded-[10px] border border-[#ececec] bg-white px-3 py-3">
                          <div className="text-xs text-[#8a8a8a]">Срок решения</div>
                          <div className="mt-1 text-sm font-medium text-[#1f1f1f]">
                            {testResult.resultingDueDates.resolutionDueAt ? formatDateTime(testResult.resultingDueDates.resolutionDueAt) : 'Не задано'}
                          </div>
                          <div className="mt-2">
                            <SlaStatusPill label="Статус" status={testResult.resultingStatuses.resolutionStatus} />
                          </div>
                        </div>
                      </div>
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
        title={editingPolicyId ? 'Редактировать SLA policy' : 'Новая SLA policy'}
        testId="sla-policy-modal"
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
              <label className="mb-1 block text-sm text-[#5f5f5f]">Порядок sortOrder</label>
              <input
                className="input"
                type="number"
                value={form.sortOrder}
                onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
                disabled={saving}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-[#4a4a4a]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                disabled={saving}
              />
              Policy включена
            </label>
          </div>

          <div className="rounded-[12px] border border-[#e6e6e6] bg-[#fcfcfc] p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-[#1f1f1f]">Когда policy подходит</h3>
              <p className="mt-1 text-xs text-[#8a8a8a]">Пустые поля означают wildcard: policy не ограничивается этим признаком.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Папка</label>
                <select
                  className="input"
                  value={form.folderId}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    folderId: event.target.value,
                  }))}
                  disabled={saving}
                >
                  <option value="">Любая папка</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Приоритет</label>
                <select
                  className="input"
                  value={form.priority}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    priority: event.target.value as '' | TaskPriority,
                  }))}
                  disabled={saving}
                >
                  <option value="">Любой приоритет</option>
                  {Object.entries(priorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Тип</label>
                <select
                  className="input"
                  value={form.typeId}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    typeId: event.target.value,
                    subtypeId: current.subtypeId && !subtypeOptions.some((subtype) => subtype.id === current.subtypeId)
                      ? ''
                      : current.subtypeId,
                  }))}
                  disabled={saving}
                >
                  <option value="">Любой тип</option>
                  {typeOptions.map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Подтип</label>
                <select
                  className="input"
                  value={form.subtypeId}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    subtypeId: event.target.value,
                  }))}
                  disabled={saving}
                >
                  <option value="">Любой подтип</option>
                  {subtypeOptions.map((subtype) => (
                    <option key={subtype.id} value={subtype.id}>{subtype.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-[12px] border border-[#e6e6e6] bg-white p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-[#1f1f1f]">Какие SLA-сроки задать</h3>
              <p className="mt-1 text-xs text-[#8a8a8a]">Можно указать только первый ответ, только решение или оба срока сразу.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Первый ответ, минут</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  placeholder="Например, 30"
                  value={form.firstResponseMinutes}
                  onChange={(event) => setForm((current) => ({ ...current, firstResponseMinutes: event.target.value }))}
                  disabled={saving}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Решение, минут</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  placeholder="Например, 240"
                  value={form.resolutionMinutes}
                  onChange={(event) => setForm((current) => ({ ...current, resolutionMinutes: event.target.value }))}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={closeModal} disabled={saving}>Отмена</button>
            <button type="button" className="btn btn-primary" onClick={() => void savePolicy()} disabled={saving}>
              {saving ? 'Сохраняем...' : 'Сохранить policy'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
