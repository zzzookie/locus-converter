import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Alert, AppBar, Paper, Snackbar, Toolbar } from '@mui/material';
import type {
  AnalyzeResponse,
  CheckOutputResponse,
  ConvertResponse,
  FieldSchema,
  JsonValue,
  Point,
  PreviewResponse,
  ResumeCheckResponse,
  Template,
  TranslationJob,
  TranslationStartInfo,
} from '@core';
import { api } from '@/api';
import { type ExportFormat } from '@/constants';
import { TopBar } from '@/components/TopBar';
import { JsonInputPanel } from '@/components/JsonInputPanel';
import { TemplateEditor } from '@/components/TemplateEditor';
import { PhonePreview } from '@/components/PhonePreview';
import { ProgressPanel } from '@/components/ProgressPanel';
import { ConflictDialog, type ConflictInfo } from '@/components/ConflictDialog';

export interface DownloadInfo {
  url: string;
  file: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractPoints(document: JsonValue, listField: string | null): Point[] {
  if (Array.isArray(document)) return document as Point[];
  if (listField !== null && typeof document === 'object' && document !== null && !Array.isArray(document)) {
    const wrapped = (document as Record<string, JsonValue>)[listField];
    return Array.isArray(wrapped) ? (wrapped as Point[]) : [];
  }
  if (typeof document === 'object' && document !== null && !Array.isArray(document)) return [document as Point];
  return [];
}

const Layout = styled.div`
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr) 400px;
  gap: 16px;
  padding: 16px 20px;

  @media (max-width: 1320px) {
    grid-template-columns: 1fr;
  }
`;

const Column = styled(Paper)`
  padding: 16px;
`;

const SectionTitle = styled.h2`
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.palette.text.secondary};
`;

export function App(): JSX.Element {
  const [points, setPoints] = useState<Point[]>([]);
  const [schema, setSchema] = useState<FieldSchema[]>([]);
  const [template, setTemplate] = useState<Template | null>(null);
  const [listField, setListField] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [pointIndex, setPointIndex] = useState(0);

  const [preview, setPreview] = useState<PreviewResponse>({ name: '', html: '' });
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressText, setProgressText] = useState('—');
  const [download, setDownload] = useState<DownloadInfo | null>(null);
  const [notice, setNotice] = useState<{ kind: 'info' | 'error'; message: string } | null>(null);
  const [resumeInfo, setResumeInfo] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [preTranslating, setPreTranslating] = useState(false);
  const [savedJsonFile, setSavedJsonFile] = useState<string | null>(null);
  const [outputsRefreshToken, setOutputsRefreshToken] = useState(0);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);

  const [fileName, setFileName] = useState('');
  const [language, setLanguage] = useState('ru');
  const [format, setFormat] = useState<ExportFormat>('gpx');
  const [doTranslate, setDoTranslate] = useState(true);

  const notify = (message: string, kind: 'info' | 'error' = 'info'): void => setNotice({ kind, message });

  const loadData = async (text: string, name: string): Promise<void> => {
    const response = await api<AnalyzeResponse>('/api/analyze', { text });

    setOriginalText(text);
    setSourceName(name || 'data');
    setPoints(response.points);
    setListField(response.listField);
    setSchema(response.schema);
    setTemplate(response.template);
    setPointIndex(0);
    setPreview({ name: '', html: '' });
    setDownload(null);
    setSavedJsonFile(null);
    setDoTranslate(true);

    const baseName = (name || 'data').replace(/\.json$/i, '');
    setFileName(`${baseName} (${response.template.targetLanguage})`);
    setLanguage(response.template.targetLanguage);

    void checkResume(response.template, text);
  };

  const checkResume = async (currentTemplate: Template, text: string): Promise<void> => {
    try {
      const response = await api<ResumeCheckResponse>('/api/translate/resume-check', {
        text,
        template: currentTemplate,
        targetLanguage: currentTemplate.targetLanguage,
      });
      if (response.resumeAvailable && response.translatedJson) {
        setResumeInfo('Найден готовый перевод — будет использован повторно без вызова API.');
      } else if (response.resumeAvailable && response.partial) {
        setResumeInfo(
          `Найден незавершённый перевод: ${response.done ?? 0}/${response.total ?? 0} строк. Конвертация продолжится с этого места.`
        );
      } else {
        setResumeInfo(null);
      }
    } catch {
      setResumeInfo(null);
    }
  };

  useEffect(() => {
    if (points.length === 0 || template === null) return;
    const timer = window.setTimeout(() => {
      const point = points[Math.min(pointIndex, points.length - 1)];
      api<PreviewResponse>('/api/preview', { point, template })
        .then(setPreview)
        .catch((error: unknown) =>
          setPreview({
            name: '',
            html: `<span style="color:#c0392b">Ошибка: ${escapeHtml(error instanceof Error ? error.message : String(error))}</span>`,
          })
        );
    }, 180);
    return () => window.clearTimeout(timer);
  }, [points, template, pointIndex]);



  const pollJob = (jobId: string): Promise<TranslationJob> => {
    return new Promise((resolve, reject) => {
      const timer = window.setInterval(async () => {
        try {
          const job = await api<TranslationJob>('/api/translate/status?jobId=' + encodeURIComponent(jobId));
          setProgressPercent(job.totalCount > 0 ? Math.round((job.doneCount / job.totalCount) * 100) : 0);
          setProgressText(`${job.message} — ${job.doneCount}/${job.totalCount} строк`);

          if (job.status === 'done') {
            window.clearInterval(timer);
            resolve(job);
          } else if (job.status === 'error') {
            window.clearInterval(timer);
            reject(new Error(job.error || 'Ошибка перевода'));
          }
        } catch (error) {
          window.clearInterval(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }, 400);
    });
  };

  const applyTranslatedDocument = async (document: JsonValue): Promise<void> => {
    const text = JSON.stringify(document, null, 2);
    const response = await api<AnalyzeResponse>('/api/analyze', { text });

    // Исходный текст НЕ меняем: предперевод всегда идёт от исходного JSON,
    // поэтому поля без отметки «переводить» остаются в оригинале.
    setPoints(response.points);
    setListField(response.listField);
    setSchema(response.schema);
    setPointIndex(0);
    setPreview({ name: '', html: '' });
    setDoTranslate(false);
  };

  const runPreTranslate = async (baseName: string, explicitFileName?: string): Promise<void> => {
    if (template === null) return;

    setPreTranslating(true);
    setProgressPercent(0);
    setSavedJsonFile(null);

    try {
      setProgressText('Перевод и сохранение JSON…');
      const start = await api<TranslationStartInfo>('/api/translate/start', {
        text: originalText,
        template,
        targetLanguage: language,
        metaName: baseName,
        fileName: explicitFileName,
      });
      if (start.resumed) setProgressText('Восстановление сохранённого прогресса…');

      const job = await pollJob(start.jobId);
      if (job.translatedJson && job.translatedFileName) {
        await applyTranslatedDocument(job.translatedJson);
        setSavedJsonFile(job.translatedFileName);
        setOutputsRefreshToken((value) => value + 1);
        setProgressPercent(100);
        setProgressText(`Перевод сохранён: ${job.translatedFileName}`);
        notify(`Переведённый JSON сохранён в data/output/${job.translatedFileName}`);
      } else {
        setProgressPercent(100);
        setProgressText('Перевод завершён');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProgressText('Ошибка: ' + message);
      notify(message, 'error');
    } finally {
      setPreTranslating(false);
    }
  };

  const handlePreTranslate = async (): Promise<void> => {
    if (template === null) return;
    const base = sourceName.replace(/\.json$/i, '') || 'translated';
    try {
      const check = await api<CheckOutputResponse>('/api/check-output', { kind: 'translated', metaName: base, targetLanguage: language });
      if (check.exists) {
        setConflict({ kind: 'translated', file: check.file, metaName: base });
        return;
      }
      await runPreTranslate(base);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const runConvert = async (metaName: string, explicitFileName?: string): Promise<void> => {
    if (template === null) return;
    const translationBaseName = sourceName.replace(/\.json$/i, '') || 'translated';
    let workingPoints = points;

    setConverting(true);
    setProgressPercent(0);
    setDownload(null);

    try {
      if (doTranslate) {
        setProgressText('Старт перевода…');
        const start = await api<TranslationStartInfo>('/api/translate/start', {
          text: originalText,
          template,
          targetLanguage: language,
          metaName: translationBaseName,
        });
        if (start.resumed) setProgressText('Восстановление сохранённого прогресса…');

        const job = await pollJob(start.jobId);
        if (job.translatedJson) {
          workingPoints = extractPoints(job.translatedJson, listField);
          setPoints(workingPoints);
        }
      }

      setProgressPercent(90);
      setProgressText(`Генерация ${format.toUpperCase()}…`);
      const conversion = await api<ConvertResponse>('/api/convert', {
        points: workingPoints,
        template,
        format,
        metaName,
        fileName: explicitFileName,
      });

      setProgressPercent(100);
      setProgressText(`Готово: ${conversion.pointsWritten} точек, ${conversion.size} байт`);
      setDownload({ url: conversion.downloadUrl, file: conversion.file });
      notify(`Файл сохранён в data/output/${conversion.file}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProgressText('Ошибка: ' + message);
      notify(message, 'error');
    } finally {
      setConverting(false);
    }
  };

  const handleConvert = async (): Promise<void> => {
    if (template === null) return;
    const metaName = fileName || sourceName.replace(/\.json$/i, '') || 'points';
    try {
      const check = await api<CheckOutputResponse>('/api/check-output', { kind: 'export', metaName, format });
      if (check.exists) {
        setConflict({ kind: 'export', file: check.file, metaName });
        return;
      }
      await runConvert(metaName);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const handleConflictReplace = (): void => {
    const current = conflict;
    if (!current) return;
    setConflict(null);
    if (current.kind === 'export') void runConvert(current.metaName);
    else void runPreTranslate(current.metaName);
  };

  const handleConflictSaveAs = async (newFileName: string): Promise<void> => {
    const current = conflict;
    if (!current) return;
    try {
      const check = await api<CheckOutputResponse>('/api/check-output', {
        kind: current.kind,
        fileName: newFileName,
        format,
        targetLanguage: language,
      });
      if (check.exists) {
        setConflict({ ...current, file: check.file });
        notify('Это имя тоже занято — выберите другое.', 'error');
        return;
      }
      setConflict(null);
      if (current.kind === 'export') void runConvert(current.metaName, newFileName);
      else void runPreTranslate(current.metaName, newFileName);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const handleTemplateChange = (nextTemplate: Template): void => {
    setTemplate(nextTemplate);
    if (nextTemplate.targetLanguage !== language) setLanguage(nextTemplate.targetLanguage);
  };

  return (
    <>
      <AppBar position="static" elevation={0} color="default" sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ py: 1.25, minHeight: 68 }}>
          <TopBar
            language={language}
            format={format}
            fileName={fileName}
            converting={converting}
            canConvert={template !== null && points.length > 0}
            onLanguageChange={(value) => {
              setLanguage(value);
              if (template) setTemplate({ ...template, targetLanguage: value });
            }}
            onFormatChange={setFormat}
            onFileNameChange={setFileName}
            onConvert={() => void handleConvert()}
          />
        </Toolbar>
      </AppBar>

      <Layout>
        <Column>
          <SectionTitle>1. Источник JSON</SectionTitle>
          <JsonInputPanel
            schema={schema}
            onLoadData={loadData}
            onError={(message) => notify(message, 'error')}
            onNotify={(message, kind) => notify(message, kind ?? 'info')}
            outputsRefreshToken={outputsRefreshToken}
          />
        </Column>

        <Column>
          <SectionTitle>2. Шаблон точки</SectionTitle>
          <TemplateEditor
            schema={schema}
            template={template}
            onChange={handleTemplateChange}
            onNotify={notify}
            disabled={points.length === 0}
          />
        </Column>

        <Column>
          <SectionTitle>3. Предпросмотр в Locus</SectionTitle>
          <PhonePreview points={points} pointIndex={pointIndex} onPointChange={setPointIndex} previewName={preview.name} previewHtml={preview.html} />
          <ProgressPanel
            percent={progressPercent}
            text={progressText}
            download={download}
            doTranslate={doTranslate}
            resumeInfo={resumeInfo}
            onDoTranslateChange={setDoTranslate}
            preTranslating={preTranslating}
            savedJsonFile={savedJsonFile}
            canPreTranslate={template !== null && points.length > 0 && !converting}
            onPreTranslate={() => void handlePreTranslate()}
          />
        </Column>
      </Layout>

      <Snackbar
        open={notice !== null}
        autoHideDuration={6000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {notice ? (
          <Alert severity={notice.kind} onClose={() => setNotice(null)}>
            {notice.message}
          </Alert>
        ) : undefined}
      </Snackbar>

      <ConflictDialog
        conflict={conflict}
        onReplace={handleConflictReplace}
        onSaveAs={(newFileName) => void handleConflictSaveAs(newFileName)}
        onCancel={() => setConflict(null)}
      />
    </>
  );
}
