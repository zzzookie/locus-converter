import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

/** Копирует текст в буфер обмена (с запасным способом для http и старых браузеров). */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // переходим к запасному способу ниже
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busyLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Подтверждение опасного действия (например, удаления файла). */
export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element {
  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{props.title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{props.message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose} disabled={props.busy}>
          Отмена
        </Button>
        <Button color="error" variant="contained" onClick={props.onConfirm} disabled={props.busy}>
          {props.busy ? props.busyLabel ?? 'Удаление…' : props.confirmLabel ?? 'Удалить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface RenameDialogProps {
  open: boolean;
  initialName: string;
  busy?: boolean;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

/** Переименование файла: расширение сохраняется автоматически. */
export function RenameDialog(props: RenameDialogProps): JSX.Element {
  const [name, setName] = useState(props.initialName);

  useEffect(() => {
    if (props.open) setName(props.initialName);
  }, [props.open, props.initialName]);

  const submit = (): void => {
    const next = name.trim();
    if (next === '' || next === props.initialName) return;
    props.onSubmit(next);
  };

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Переименовать файл</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          size="small"
          fullWidth
          label="Новое имя"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
          helperText="Расширение сохранится автоматически."
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose} disabled={props.busy}>
          Отмена
        </Button>
        <Button variant="contained" onClick={submit} disabled={props.busy || name.trim() === ''}>
          {props.busy ? 'Переименование…' : 'Переименовать'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface ShareDialogProps {
  open: boolean;
  fileName: string;
  url: string;
  loadContent?: () => Promise<string>;
  onNotify: (message: string, kind?: 'info' | 'error') => void;
  onClose: () => void;
}

/** «Поделиться»: ссылка на скачивание с этого сервера + копия содержимого. */
export function ShareDialog(props: ShareDialogProps): JSX.Element {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!props.open) return undefined;
    setContent(null);
    if (props.loadContent === undefined) return undefined;

    let cancelled = false;
    setLoading(true);
    props
      .loadContent()
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch(() => {
        if (!cancelled) setContent(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.open]);

  const copyLink = async (): Promise<void> => {
    const copied = await copyToClipboard(props.url);
    props.onNotify(copied ? 'Ссылка скопирована в буфер обмена.' : 'Не удалось скопировать ссылку.', copied ? 'info' : 'error');
  };

  const copyContent = async (): Promise<void> => {
    if (content === null) return;
    const copied = await copyToClipboard(content);
    props.onNotify(copied ? 'Содержимое скопировано в буфер обмена.' : 'Не удалось скопировать содержимое.', copied ? 'info' : 'error');
  };

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Поделиться файлом</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {props.fileName}
          </Typography>
          <TextField
            size="small"
            fullWidth
            label="Ссылка на скачивание"
            value={props.url}
            InputProps={{ readOnly: true }}
            onFocus={(event) => event.target.select()}
          />
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button size="small" variant="contained" onClick={() => void copyLink()}>
              Копировать ссылку
            </Button>
            <Button size="small" variant="outlined" href={props.url} target="_blank" rel="noopener noreferrer">
              Скачать
            </Button>
            {props.loadContent !== undefined && (
              <Button size="small" variant="outlined" disabled={loading || content === null} onClick={() => void copyContent()}>
                {loading ? 'Загрузка…' : 'Копировать содержимое'}
              </Button>
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Ссылка работает, пока запущен сервер. В локальной сети замените localhost на IP этого компьютера.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
}

