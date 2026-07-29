import type { ProductUserRole, UserRole } from './enums.js';

export interface DepartmentSummaryDto {
  id?: string | null;
  name: string;
  code?: string | null;
  headUserId?: string | null;
  isActive?: boolean;
}

export interface UserDepartmentMembershipDto {
  id?: string | null;
  userId?: string;
  departmentId?: string | null;
  isPrimary: boolean;
  department: DepartmentSummaryDto;
}

export interface AuthUserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  position?: string | null;
  department?: string | null;
  departmentMemberships?: UserDepartmentMembershipDto[];
  primaryDepartment?: DepartmentSummaryDto | null;
}

export interface CurrentUserDto extends AuthUserDto {
  /**
   * Temporary/unstable: backend stores this as Prisma Json and currently
   * returns it from /auth/me without a dedicated serializer.
   */
  skills?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequestDto {
  email: string;
  password: string;
}

/**
 * Public self-registration payload for POST /api/auth/register.
 */
export interface RegisterRequestDto {
  name: string;
  email: string;
  password: string;
  position?: string;
  department?: string;
}

/**
 * Admin-only payload for POST /api/auth/register/admin.
 * Keeps the managed-user creation flow explicit without changing the
 * existing public registration contract.
 */
export interface AdminRegisterRequestDto extends RegisterRequestDto {
  role?: ProductUserRole;
  skills?: string[];
}

export interface LoginResponseDto {
  message: string;
  token: string;
  user: AuthUserDto;
}

export interface RegisterResponseDto {
  message: string;
  user: AuthUserDto;
}

export interface GetMeResponseDto {
  user: CurrentUserDto;
}
