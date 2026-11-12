/**
 * Типы перевода и сохранения прогресса (resume).
 */

import type { JsonValue } from './json';
import type { TranslateTarget } from './template';

/** Статус жизненного цикла задачи перевода. */
export type JobStatus = 'idle' | 'running' | 'done' | 'error';

/** Опции функции translateStrings(). */
export interface TranslateOptions {
  batchSize?: number;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
  onBatch?: (done: number, total: number) => void;
  onError?: (source: string, error: Error) => void;
}

/** Ответ эндпоинта запуска перевода. */
export interface TranslationStartInfo {
  jobId: string;
  sessionId: string;
  resumed: boolean;
  total: number;
}

/** Живой статус задачи, возвращаемый эндпоинтом статуса. */
export interface TranslationJob {
  status: JobStatus;
  doneCount: number;
  totalCount: number;
  message: string;
  sessionId?: string;
  translatedJson?: JsonValue;
  translatedFileName?: string;
  error?: string;
}

/** Сохранённый прогресс одного запуска перевода (для восстановления). */
export interface TranslationSession {
  sessionId: string;
  createdAt: string;
  updatedAt?: string;
  targetLanguage: string;
  translateTargets: TranslateTarget[];
  sourceText: string;
  listField: string | null;
  metaName: string;
  strings: string[];
  translated: Record<string, string>;
  batchSize: number;
  translatedJson: JsonValue | null;
  translatedFileName: string | null;
  outputFileName?: string;
  status: JobStatus;
  lastError?: string;
}
