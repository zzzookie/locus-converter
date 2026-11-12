import { Button, Checkbox, FormControlLabel, LinearProgress, Link, Stack, Typography } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import TranslateIcon from '@mui/icons-material/Translate';
import styled from 'styled-components';

interface ProgressPanelProps {
  percent: number;
  text: string;
  download: { url: string; file: string } | null;
  doTranslate: boolean;
  resumeInfo: string | null;
  onDoTranslateChange: (value: boolean) => void;
  preTranslating: boolean;
  savedJsonFile: string | null;
  canPreTranslate: boolean;
  onPreTranslate: () => void;
}

const Wrap = styled.div`
  margin-top: 12px;
`;

const ProgressText = styled(Typography)`
  color: ${({ theme }) => theme.palette.text.secondary};
  font-size: 12px;
  margin: 8px 0;
`;

const ResumeInfo = styled(Typography)`
  color: ${({ theme }) => theme.palette.info.main};
  font-size: 12px;
  margin: 0 0 8px;
`;

const SavedRow = styled(Typography)`
  color: ${({ theme }) => theme.palette.success.main};
  font-size: 12px;
  margin: 8px 0;
  word-break: break-all;
`;

export function ProgressPanel(props: ProgressPanelProps): JSX.Element {
  return (
    <Wrap>
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
        <FormControlLabel
          control={
            <Checkbox size="small" checked={props.doTranslate} onChange={(event) => props.onDoTranslateChange(event.target.checked)} />
          }
          label="переводить поля"
        />
        <Button
          size="small"
          variant="outlined"
          startIcon={<TranslateIcon />}
          disabled={!props.canPreTranslate || props.preTranslating}
          onClick={props.onPreTranslate}
        >
          {props.preTranslating ? 'Перевод…' : 'Перевести и сохранить JSON'}
        </Button>
      </Stack>

      {props.resumeInfo && <ResumeInfo>{props.resumeInfo}</ResumeInfo>}

      {props.savedJsonFile && (
        <SavedRow>
          Перевод сохранён: data/output/{props.savedJsonFile} —{' '}
          <Link
            href={'/api/download/' + encodeURIComponent(props.savedJsonFile)}
            download
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
          >
            <DownloadIcon sx={{ fontSize: 16 }} /> скачать
          </Link>
        </SavedRow>
      )}

      <LinearProgress variant="determinate" value={Math.min(100, props.percent)} sx={{ height: 10, borderRadius: 5 }} />
      <ProgressText>{props.text}</ProgressText>

      {props.download && (
        <Link
          href={props.download.url}
          download
          underline="none"
          sx={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
        >
          <DownloadIcon sx={{ fontSize: 18 }} /> Скачать {props.download.file}
        </Link>
      )}
    </Wrap>
  );
}

