import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import styled from 'styled-components';
import {
  Alert,
  Button,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import ShareIcon from '@mui/icons-material/Share';
import type { FieldSchema, InputFileInfo, LoadInputResponse } from '@core';
import { api } from '@/api';
import { ConfirmDialog, RenameDialog, ShareDialog } from '@/components/FileDialogs';

interface JsonInputPanelProps {
  schema: FieldSchema[];
  onLoadData: (text: string, sourceName: string) => Promise<void>;
  onError: (message: string) => void;
  onNotify?: (message: string, kind?: 'info' | 'error') => void;
  outputsRefreshToken?: number;
}

type SourceTab = 'paste' | 'file' | 'folder' | 'outputs';

/** Файл, над которым выполняется действие. */
type FileTarget = { kind: 'input' | 'output'; name: string };

const Hint = styled(Typography)`
  color: ${({ theme }) => theme.palette.text.secondary};
  font-size: 12px;
  margin: 4px 0;
`;

const FieldsWrap = styled.div`
  max-height: 200px;
  overflow: auto;
  margin-top: 6px;
`;

const FieldRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 2px;
  border-bottom: 1px dashed ${({ theme }) => theme.palette.divider};
  font-size: 12px;
`;

const FieldPath = styled.span`
  font-family: Consolas, monospace;
  color: ${({ theme }) => theme.palette.secondary.main};
`;

const FieldType = styled.span`
  color: ${({ theme }) => theme.palette.text.secondary};
`;

const FieldSample = styled.span`
  color: ${({ theme }) => theme.palette.text.secondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  text-align: right;
`;

const NullBadge = styled.span`
  flex: 0 0 auto;
  font-size: 10px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  color: ${({ theme }) => theme.palette.warning.main};
  background: ${({ theme }) => theme.palette.action.hover};
  white-space: nowrap;
`;

const FileRow = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
`;

const RowAction = styled(IconButton)`
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 6px;
  flex: 0 0 auto;
`;

interface FileListItemProps {
  file: InputFileInfo;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onShare: () => void;
}

/** Строка файла: открыть, переименовать, поделиться, удалить. */
function FileListItem(props: FileListItemProps): JSX.Element {
  return (
    <FileRow>
      <ListItemButton onClick={props.onOpen} sx={{ flex: 1, minWidth: 0, py: 0.25, px: 0.5 }}>
        <ListItemText
          primary={props.file.name}
          secondary={`${props.file.size} б`}
          primaryTypographyProps={{ fontSize: 13, noWrap: true }}
          secondaryTypographyProps={{ fontSize: 11 }}
        />
      </ListItemButton>
      <RowAction title="Переименовать" onClick={props.onRename}>
        <EditIcon sx={{ fontSize: 16 }} />
      </RowAction>
      <RowAction title="Поделиться" onClick={props.onShare}>
        <ShareIcon sx={{ fontSize: 16 }} />
      </RowAction>
      <RowAction title="Удалить" onClick={props.onDelete} sx={{ color: 'error.main' }}>
        <DeleteOutlineIcon sx={{ fontSize: 16 }} />
      </RowAction>
    </FileRow>
  );
}

export function JsonInputPanel(props: JsonInputPanelProps): JSX.Element {
  const [tab, setTab] = useState<SourceTab>('paste');
  const [text, setText] = useState('');
  const [folderFiles, setFolderFiles] = useState<InputFileInfo[]>([]);
  const [outputFiles, setOutputFiles] = useState<InputFileInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileTarget | null>(null);
  const [shareTarget, setShareTarget] = useState<FileTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshFolder = async (): Promise<void> => {
    try {
      const response = await api<{ files: InputFileInfo[] }>('/api/inputs');
      setFolderFiles(response.files);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  };

  const refreshOutputs = async (): Promise<void> => {
    try {
      const response = await api<{ files: InputFileInfo[] }>('/api/outputs');
      setOutputFiles(response.files);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  };

  const refreshFiles = async (): Promise<void> => {
    await Promise.all([refreshFolder(), refreshOutputs()]);
  };

  const handleRename = async (newName: string): Promise<void> => {
    if (renameTarget === null) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ file: string }>('/api/files/rename', {
        kind: renameTarget.kind,
        name: renameTarget.name,
        newName,
      });
      await refreshFiles();
      props.onNotify?.(`Переименовано: ${renameTarget.name} → ${response.file}`, 'info');
      setRenameTarget(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (deleteTarget === null) return;
    setBusy(true);
    setError(null);
    try {
      await api<{ file: string }>('/api/files/delete', {
        kind: deleteTarget.kind,
        name: deleteTarget.name,
      });
      await refreshFiles();
      props.onNotify?.(`Удалено: ${deleteTarget.name}`, 'info');
      setDeleteTarget(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(false);
    }
  };

  const shareUrl = (target: FileTarget): string =>
    `${window.location.origin}/api/download${target.kind === 'input' ? '-input' : ''}/${encodeURIComponent(target.name)}`;

  const loadFileContent =
    (target: FileTarget): (() => Promise<string>) =>
    () =>
      api<LoadInputResponse>(target.kind === 'input' ? '/api/load-input' : '/api/load-output', {
        name: target.name,
      }).then(response => response.text);

  useEffect(() => {
    void refreshFolder();
    void refreshOutputs();
    const timer = window.setInterval(() => {
      void refreshFolder();
      void refreshOutputs();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [props.outputsRefreshToken]);

  const loadText = async (value: string, sourceName: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await props.onLoadData(value, sourceName);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      props.onError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = (): void => {
    if (!text.trim()) {
      setError('Вставьте JSON текст.');
      return;
    }
    void loadText(text, 'data.json');
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    await loadText(await file.text(), file.name);
  };

  const handleFolderSelect = async (name: string): Promise<void> => {
    const response = await api<LoadInputResponse>('/api/load-input', { name });
    setText(response.text);
    await loadText(response.text, response.name);
    setTab('paste');
  };

  const handleOutputSelect = async (name: string): Promise<void> => {
    const response = await api<LoadInputResponse>('/api/load-output', { name });
    setText(response.text);
    await loadText(response.text, response.name);
    setTab('paste');
  };

  return (
    <div>
      <Tabs
        value={tab}
        onChange={(_event, value: SourceTab) => setTab(value)}
        variant="fullWidth"
        sx={{
          minHeight: 32,
          mb: 0.75,
          '& .MuiTab-root': {
            minHeight: 32,
            minWidth: 0,
            py: 0.25,
            px: 0.5,
            fontSize: 11.5,
            lineHeight: 1.2,
            textTransform: 'none',
          },
        }}
      >
        <Tab label="Вставить" value="paste" />
        <Tab label="Файл" value="file" />
        <Tab label="Папка" value="folder" />
        <Tab label="Переводы" value="outputs" />
      </Tabs>

      {tab === 'paste' && (
        <div>
          <TextField
            multiline
            minRows={4}
            maxRows={10}
            size="small"
            fullWidth
            value={text}
            onChange={event => setText(event.target.value)}
            placeholder="Вставьте JSON: массив объектов с полями name, lat, lon, description…"
            inputProps={{ style: { fontFamily: 'Consolas, monospace', fontSize: 12 } }}
          />
          <Button
            variant="contained"
            size="small"
            fullWidth
            sx={{ mt: 0.75 }}
            onClick={handlePaste}
            disabled={loading}
          >
            {loading ? 'Загрузка…' : 'Загрузить JSON'}
          </Button>
        </div>
      )}

      {tab === 'file' && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={event => void handleFileChange(event)}
          />
          <Button
            variant="outlined"
            fullWidth
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
          >
            Выбрать файл .json
          </Button>
          <Hint>Выберите файл JSON на диске.</Hint>
        </div>
      )}

      {tab === 'folder' && (
        <div>
          <Hint>Положите файлы .json в папку data/input рядом с приложением.</Hint>
          <Button size="small" onClick={() => void refreshFolder()}>
            Обновить список
          </Button>
          <List dense sx={{ mt: 0.5, maxHeight: 180, overflow: 'auto', p: 0 }}>
            {folderFiles.length === 0 && <Hint>Папка пуста</Hint>}
            {folderFiles.map(file => (
              <FileListItem
                key={file.name}
                file={file}
                onOpen={() => void handleFolderSelect(file.name)}
                onRename={() => setRenameTarget({ kind: 'input', name: file.name })}
                onShare={() => setShareTarget({ kind: 'input', name: file.name })}
                onDelete={() => setDeleteTarget({ kind: 'input', name: file.name })}
              />
            ))}
          </List>
        </div>
      )}

      {tab === 'outputs' && (
        <div>
          <Hint>
            Готовые переводы из папки data/output. Нажмите файл, чтобы загрузить его в интерфейс.
          </Hint>
          <Button size="small" onClick={() => void refreshOutputs()}>
            Обновить список
          </Button>
          <List dense sx={{ mt: 0.5, maxHeight: 180, overflow: 'auto', p: 0 }}>
            {outputFiles.length === 0 && <Hint>Переводов пока нет</Hint>}
            {outputFiles.map(file => (
              <FileListItem
                key={file.name}
                file={file}
                onOpen={() => void handleOutputSelect(file.name)}
                onRename={() => setRenameTarget({ kind: 'output', name: file.name })}
                onShare={() => setShareTarget({ kind: 'output', name: file.name })}
                onDelete={() => setDeleteTarget({ kind: 'output', name: file.name })}
              />
            ))}
          </List>
        </div>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {props.schema.length > 0 && (
        <>
          <Hint sx={{ mt: 1, mb: 0.5 }}>Поля JSON (по всему файлу):</Hint>
          <FieldsWrap>
            {props.schema.map(field => {
              const nullCount = field.nullCount ?? 0;
              const presentCount = field.presentCount ?? 0;
              const total = nullCount + presentCount;
              return (
                <FieldRow key={field.path}>
                  <FieldPath>{field.path}</FieldPath>
                  {nullCount > 0 && (
                    <NullBadge title={`Пусто (null/undefined) в ${nullCount} из ${total} точек`}>
                      {presentCount === 0 ? 'всегда null' : `null ${nullCount}/${total}`}
                    </NullBadge>
                  )}
                  <FieldType>
                    {field.type}
                    {field.itemType ? '/' + field.itemType : ''}
                  </FieldType>
                  <FieldSample>{field.sample}</FieldSample>
                </FieldRow>
              );
            })}
          </FieldsWrap>
        </>
      )}

      <RenameDialog
        open={renameTarget !== null}
        initialName={renameTarget?.name ?? ''}
        busy={busy}
        onSubmit={name => void handleRename(name)}
        onClose={() => setRenameTarget(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Удалить файл?"
        message={`Файл «${deleteTarget?.name ?? ''}» будет удалён без возможности отмены.`}
        busy={busy}
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteTarget(null)}
      />

      <ShareDialog
        open={shareTarget !== null}
        fileName={shareTarget?.name ?? ''}
        url={shareTarget === null ? '' : shareUrl(shareTarget)}
        loadContent={shareTarget === null ? undefined : loadFileContent(shareTarget)}
        onNotify={(message, kind) => props.onNotify?.(message, kind)}
        onClose={() => setShareTarget(null)}
      />
    </div>
  );
}
