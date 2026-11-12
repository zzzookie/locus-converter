import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from '@mui/material';

export interface ConflictInfo {
  kind: 'export' | 'translated';
  file: string;
  metaName: string;
}

interface ConflictDialogProps {
  conflict: ConflictInfo | null;
  onReplace: () => void;
  onSaveAs: (newFileName: string) => void;
  onCancel: () => void;
}

export function ConflictDialog(props: ConflictDialogProps): JSX.Element {
  const [name, setName] = useState('');

  useEffect(() => {
    if (props.conflict) setName(props.conflict.file);
  }, [props.conflict]);

  return (
    <Dialog open={props.conflict !== null} onClose={props.onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Файл уже существует</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {props.conflict?.kind === 'translated' ? 'Файл перевода' : 'Файл'}{' '}
          <b>{props.conflict?.file}</b> уже есть в папке <code>data/output</code>. Замените его или
          сохраните под другим именем.
        </DialogContentText>
        <TextField
          label="Имя файла"
          value={name}
          onChange={event => setName(event.target.value)}
          size="small"
          fullWidth
          helperText="Измените имя, чтобы не перезаписывать существующий файл"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onCancel}>Отмена</Button>
        <Button onClick={props.onReplace} color="warning">
          Заменить
        </Button>
        <Button
          variant="contained"
          disabled={!name.trim() || name.trim() === props.conflict?.file}
          onClick={() => props.onSaveAs(name.trim())}
        >
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  );
}
