import type { TaskPriority } from './enums.js';

export interface ProductSettingsFolderDto {
  id: string;
  name: string;
}

export interface ProductSettingsDto {
  portalName: string;
  companyName: string;
  welcomeMessage: string | null;
  locale: string;
  timezone: string;
  defaultPriority: TaskPriority;
  defaultFolderId: string | null;
  defaultFolder: ProductSettingsFolderDto | null;
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
}
