import type { ExternalSystem, ImportRunStatus } from './enums.js';

export interface FreshdeskImportRunDto {
  id: string;
  source: ExternalSystem;
  status: ImportRunStatus;
  dryRun: boolean;
  fileName: string | null;
  summary: Record<string, unknown> | null;
  errors: unknown[] | null;
  createdById: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface FreshdeskSourceHealthDto {
  configured: boolean;
  domain: string | null;
  maskedDomain: string | null;
  downloadAttachmentsEnabled: boolean;
  configurationError?: string | null;
}

export interface FreshdeskPullDryRunRequestDto {
  updatedSince?: string;
  maxTickets?: number;
  downloadAttachments?: boolean;
}

export type FreshdeskPullRequestDto = FreshdeskPullDryRunRequestDto;

export interface FreshdeskImportResultDto {
  run: FreshdeskImportRunDto;
  summary: Record<string, unknown>;
  errors: unknown[];
}
