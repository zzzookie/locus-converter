import styled from 'styled-components';
import { Button, MenuItem, TextField } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { EXPORT_FORMATS, LANGUAGE_OPTIONS, type ExportFormat } from '@/constants';

interface TopBarProps {
  language: string;
  format: ExportFormat;
  fileName: string;
  converting: boolean;
  canConvert: boolean;
  onLanguageChange: (value: string) => void;
  onFormatChange: (value: ExportFormat) => void;
  onFileNameChange: (value: string) => void;
  onConvert: () => void;
}

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  flex: 1;
`;

const Brand = styled.div`
  display: flex;
  flex-direction: column;
  margin-right: 12px;
`;

const BrandTitle = styled.span`
  font-weight: 700;
  font-size: 17px;
  letter-spacing: 0.2px;
`;

const BrandSubtitle = styled.span`
  font-size: 11px;
  line-height: 1.5;
  color: ${({ theme }) => theme.palette.text.secondary};
`;

export function TopBar(props: TopBarProps): JSX.Element {
  return (
    <Bar>
      <Brand>
        <BrandTitle>Locus Converter</BrandTitle>
        <BrandSubtitle>JSON → GPX / KML для Locus Map</BrandSubtitle>
      </Brand>

      <TextField
        select
        size="small"
        label="Язык"
        value={props.language}
        onChange={(event) => props.onLanguageChange(event.target.value)}
        sx={{ minWidth: 150 }}
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        select
        size="small"
        label="Формат"
        value={props.format}
        onChange={(event) => props.onFormatChange(event.target.value as ExportFormat)}
        sx={{ minWidth: 100 }}
      >
        {EXPORT_FORMATS.map((value) => (
          <MenuItem key={value} value={value}>
            {value.toUpperCase()}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        size="small"
        label="Название файла"
        value={props.fileName}
        onChange={(event) => props.onFileNameChange(event.target.value)}
        sx={{ flex: 1, minWidth: 180 }}
      />

      <Button
        variant="contained"
        color="primary"
        startIcon={<PlayArrowIcon />}
        disabled={!props.canConvert || props.converting}
        onClick={props.onConvert}
      >
        {props.converting ? 'Конвертация…' : 'Конвертировать'}
      </Button>
    </Bar>
  );
}
