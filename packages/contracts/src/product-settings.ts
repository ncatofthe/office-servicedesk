import type { TaskPriority } from './enums.js';

export interface ProductSettingsFolderDto {
  id: string;
  name: string;
}

export type ProductFeatureKey =
  | 'dashboard'
  | 'tickets'
  | 'ticketCreation'
  | 'queue'
  | 'knowledge'
  | 'cannedReplies'
  | 'chats'
  | 'team'
  | 'reports'
  | 'notifications'
  | 'automation'
  | 'email'
  | 'taskAttachments'
  | 'freshdeskImport';

export type ProductFeaturesDto = Record<ProductFeatureKey, boolean>;

export interface ProductSettingsDto {
  portalName: string;
  companyName: string;
  welcomeMessage: string | null;
  locale: string;
  timezone: string;
  defaultPriority: TaskPriority;
  defaultFolderId: string | null;
  defaultFolder: ProductSettingsFolderDto | null;
  features: ProductFeaturesDto;
}

export interface ProductSettingsAdminDto extends ProductSettingsDto {
  id: 'default';
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProductSettingsRequest {
  portalName?: string;
  companyName?: string;
  welcomeMessage?: string | null;
  locale?: string;
  timezone?: string;
  defaultPriority?: TaskPriority;
  defaultFolderId?: string | null;
  features?: Partial<ProductFeaturesDto>;
}
