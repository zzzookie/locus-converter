/**
 * Контракты HTTP-API (запросы и ответы) между сервером и веб-интерфейсом.
 */

import type { FieldSchema, JsonValue, Point } from './json';
import type { Template } from './template';
import type { TranslationSession } from './translation';

export interface AnalyzeRequest {
  text: string;
}

export interface AnalyzeResponse {
  pointCount: number;
  listField: string | null;
  latField: string | null;
  lonField: string | null;
  schema: FieldSchema[];
  points: Point[];
  template: Template;
}

export interface LoadInputRequest {
  name: string;
}

export interface LoadInputResponse {
  text: string;
  name: string;
}

export interface LoadOutputRequest {
  name: string;
}

export interface PreviewRequest {
  point: Point;
  template: Template;
}

export interface PreviewResponse {
  name: string;
  html: string;
}

export interface TranslateStartRequest {
  text: string;
  template: Template;
  targetLanguage?: string;
  metaName?: string;
  fileName?: string;
}

export interface ResumeCheckRequest {
  text: string;
  template: Template;
  targetLanguage?: string;
}

export interface ResumeCheckResponse {
  resumeAvailable: boolean;
  partial?: boolean;
  done?: number;
  total?: number;
  translatedJson?: JsonValue;
  translatedFileName?: string;
}

export interface ConvertRequest {
  points: Point[];
  template: Template;
  format: 'gpx' | 'kml';
  metaName?: string;
  metaDesc?: string;
  creator?: string;
  fileName?: string;
}

export interface CheckOutputRequest {
  kind: 'export' | 'translated';
  metaName?: string;
  fileName?: string;
  format?: 'gpx' | 'kml';
  targetLanguage?: string;
}

export interface CheckOutputResponse {
  file: string;
  exists: boolean;
}

export interface ConvertResponse {
  file: string;
  downloadUrl: string;
  size: number;
  pointsWritten: number;
}

export interface SaveTemplateRequest {
  template: Template;
  id?: string;
}

export interface SaveTemplateResponse {
  id: string;
}

export interface InputFileInfo {
  name: string;
  size: number;
}

/** Папка данных, к которой применяется действие над файлом. */
export type DataFileKind = 'input' | 'output';

export interface RenameFileRequest {
  kind: DataFileKind;
  name: string;
  newName: string;
}

export interface DeleteFileRequest {
  kind: DataFileKind;
  name: string;
}

export interface FileActionResponse {
  file: string;
}

export interface TemplateListItem {
  id: string;
  name: string;
  mtime: number;
}

export interface SessionResumeInfo {
  session: TranslationSession;
  done: number;
  total: number;
}
