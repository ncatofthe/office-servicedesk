import type {
  AutomationRuleChannel,
  AutomationRuleTriggerType,
  AutomationRunStatus,
  TaskPriority,
} from './enums.js';

export interface AutomationRuleConditionsDto {
  channel?: AutomationRuleChannel;
  folderId?: string;
  entityId?: string;
  typeId?: string;
  subtypeId?: string;
  priority?: TaskPriority;
  requesterEmailContains?: string;
  titleContains?: string;
}

export interface AutomationRuleActionsDto {
  setFolderId?: string;
  setEntityId?: string;
  setTypeId?: string;
  setSubtypeId?: string;
  setPriority?: TaskPriority;
  setAssigneeIds?: string[];
}

export interface AutomationRuleDto {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  sortOrder: number;
  triggerType: AutomationRuleTriggerType;
  conditions: AutomationRuleConditionsDto;
  actions: AutomationRuleActionsDto;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAutomationRuleRequestDto {
  name: string;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  triggerType: AutomationRuleTriggerType;
  conditions?: AutomationRuleConditionsDto;
  actions: AutomationRuleActionsDto;
}

export interface UpdateAutomationRuleRequestDto {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  triggerType?: AutomationRuleTriggerType;
  conditions?: AutomationRuleConditionsDto;
  actions?: AutomationRuleActionsDto;
}

export interface AutomationRunDto {
  id: string;
  ruleId: string;
  ruleName: string;
  taskId: string;
  triggerType: AutomationRuleTriggerType;
  status: AutomationRunStatus;
  success: boolean;
  appliedActions: Partial<AutomationRuleActionsDto>;
  errorMessage?: string | null;
  createdAt: string;
}

export interface AutomationRunsListQueryDto {
  taskId?: string;
  ruleId?: string;
}

export interface TestAutomationRuleRequestDto {
  taskId: string;
}

export interface AutomationRuleTestTaskStateDto {
  id: string;
  title: string;
  priority: TaskPriority;
  folderId?: string | null;
  entityId?: string | null;
  typeId?: string | null;
  subtypeId?: string | null;
  assigneeIds: string[];
}

export interface AutomationRuleTestResultDto {
  dryRun: true;
  ruleId: string;
  taskId: string;
  matched: boolean;
  success: boolean;
  appliedActions: Partial<AutomationRuleActionsDto>;
  errorMessage?: string | null;
  resultingTask: AutomationRuleTestTaskStateDto;
}
