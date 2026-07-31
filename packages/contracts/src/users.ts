import type { AuthUserDto, CurrentUserDto } from './auth.js';
import type { ProductUserRole } from './enums.js';

export type UserProfileDto = CurrentUserDto;

export interface TeamUserDto extends CurrentUserDto {
  doneTasks: number;
  inProgressTasks: number;
  totalHours: number;
}

export interface UpdateUserProfileRequestDto {
  name?: string;
  avatar?: string | null;
  email?: string;
  password?: string;
  position?: string | null;
  department?: string | null;
  skills?: CurrentUserDto['skills'];
}

export interface UpdateUserRoleRequestDto {
  role: ProductUserRole;
}

export interface UpdateUserProfileResponseDto {
  message: string;
  user: AuthUserDto;
}

export interface UpdateUserRoleResponseDto {
  message: string;
  user: AuthUserDto & Pick<CurrentUserDto, 'createdAt' | 'updatedAt'>;
}

export interface UpdateUserAccessStatusRequestDto {
  isActive: boolean;
}

export interface UpdateUserAccessStatusResponseDto {
  message: string;
  user: CurrentUserDto;
}

export interface AdminResetUserPasswordRequestDto {
  password: string;
}

export interface AdminResetUserPasswordResponseDto {
  message: string;
  user: CurrentUserDto;
}
