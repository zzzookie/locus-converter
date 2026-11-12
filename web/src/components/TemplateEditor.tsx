import { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { FieldSchema, Template, TemplateBlock, TemplateListItem } from '@core';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import ImageIcon from '@mui/icons-material/Image';
import LinkIcon from '@mui/icons-material/Link';
import NotesIcon from '@mui/icons-material/Notes';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import { api } from '@/api';
import { addBlock, buildFieldOptions, moveBlock, moveBlockToIndex, removeBlock, updateBlock } from '@/template';
import { BLOCK_KIND_OPTIONS } from '@/constants';
import { BlockCard } from '@/components/BlockCard';
import { PlaceholderInput } from '@/components/PlaceholderInput';

interface TemplateEditorProps {
  schema: FieldSchema[];
  template: Template | null;
  onChange: (template: Template) => void;
  onNotify: (message: string, kind: 'info' | 'error') => void;
  disabled: boolean;
}

const Hint = styled(Typography)`
  color: ${({ theme }) => theme.palette.text.secondary};
  font-size: 12px;
`;

/** Маленькие иконки для кнопок добавления блоков. */
const BLOCK_ICONS: Record<TemplateBlock['kind'], JSX.Element> = {
  field: <NotesIcon sx={{ fontSize: 16 }} />,
  image: <ImageIcon sx={{ fontSize: 16 }} />,
  list: <FormatListBulletedIcon sx={{ fontSize: 16 }} />,
  links: <LinkIcon sx={{ fontSize: 16 }} />,
  literal: <TextFieldsIcon sx={{ fontSize: 16 }} />,
  separator: <HorizontalRuleIcon sx={{ fontSize: 16 }} />,
};

const Toolbar = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 10px;
`;

function selectField(
  value: string,
  label: string,
  schema: FieldSchema[],
  onChange: (value: string) => void,
  withEmpty: boolean
): JSX.Element {
  const options = buildFieldOptions(schema);
  const isKnown = options.some((option) => option.value === value);
  return (
    <TextField select size="small" label={label} value={value} onChange={(event) => onChange(event.target.value)} fullWidth>
      {withEmpty && <MenuItem value="">— нет —</MenuItem>}
      {value !== '' && !isKnown && <MenuItem value={value}>{value} (нет в схеме)</MenuItem>}
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

const BlockRow = styled.div`
  position: relative;
`;

const DropIndicator = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 2px;
  background: ${({ theme }) => theme.palette.primary.main};
  box-shadow: 0 0 6px ${({ theme }) => theme.palette.primary.main};
  pointer-events: none;
  z-index: 5;
`;

export function TemplateEditor(props: TemplateEditorProps): JSX.Element {
  const { schema, template, disabled } = props;
  const [savedTemplates, setSavedTemplates] = useState<TemplateListItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const refreshTemplates = async (): Promise<void> => {
    const response = await api<{ templates: TemplateListItem[] }>('/api/templates');
    setSavedTemplates(response.templates);
  };

  useEffect(() => {
    void refreshTemplates();
  }, []);

  if (template === null) {
    return <Hint>Загрузите JSON, чтобы построить шаблон.</Hint>;
  }

  const patchBlock = (blockId: string, patch: Partial<TemplateBlock>): void => {
    props.onChange(updateBlock(template, blockId, patch));
  };

  const handleNameFieldChange = (value: string): void => {
    const previousField = template.name.field;
    const nameTemplate =
      template.name.template === '' || template.name.template === `{{${previousField}}}` ? `{{${value}}}` : template.name.template;
    props.onChange({ ...template, name: { ...template.name, field: value, template: nameTemplate } });
  };

  const handleSaveTemplate = async (): Promise<void> => {
    try {
      const response = await api<{ id: string }>('/api/templates/save', { template });
      await refreshTemplates();
      props.onNotify('Шаблон сохранён: ' + response.id, 'info');
    } catch (error) {
      props.onNotify(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const handleLoadTemplate = async (): Promise<void> => {
    if (!selectedTemplateId) return;
    try {
      const response = await api<{ template: Template }>('/api/templates/' + encodeURIComponent(selectedTemplateId));
      props.onChange(response.template);
      props.onNotify('Шаблон загружен: ' + selectedTemplateId, 'info');
    } catch (error) {
      props.onNotify(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const nameConfig = (
    <Stack spacing={1} sx={{ mb: 2 }}>
      <PlaceholderInput
        label="Название точки (шаблон)"
        value={template.name.template}
        onChange={(value) => props.onChange({ ...template, name: { ...template.name, template: value } })}
        schema={schema}
        allowFormatting={false}
        helperText="Пишите {{поле}} — подсказка появится автоматически"
      />
      <Stack direction="row" spacing={1} alignItems="center">
        <Stack sx={{ flex: 1 }}>{selectField(template.name.field, 'Поле названия', schema, handleNameFieldChange, true)}</Stack>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={template.name.translate}
              onChange={(event) => props.onChange({ ...template, name: { ...template.name, translate: event.target.checked } })}
            />
          }
          label="переводить"
        />
      </Stack>
    </Stack>
  );

  const blockToolbar = (
    <Toolbar>
      <Hint sx={{ m: 0 }}>Добавить блок:</Hint>
      {BLOCK_KIND_OPTIONS.map((option) => (
        <Button
          key={option.value}
          size="small"
          variant="outlined"
          startIcon={BLOCK_ICONS[option.value]}
          disabled={disabled}
          onClick={() => props.onChange(addBlock(template, option.value, schema))}
          sx={{ '& .MuiButton-startIcon': { mr: 0.5 } }}
        >
          {option.label}
        </Button>
      ))}
    </Toolbar>
  );

  const usedFieldsForBlock = (blockId: string): string[] =>
    template.blocks
      .filter((other) => other.id !== blockId)
      .map((other) => other.field)
      .filter((field): field is string => Boolean(field));

  const handleDragOver = (blockId: string, position: 'before' | 'after'): void => {
    if (draggingId === null) return;
    const index = template.blocks.findIndex((block) => block.id === blockId);
    if (index < 0) return;
    setDropIndex(position === 'before' ? index : index + 1);
  };

  const handleDrop = (): void => {
    if (draggingId !== null && dropIndex !== null) {
      props.onChange(moveBlockToIndex(template, draggingId, dropIndex));
    }
    setDraggingId(null);
    setDropIndex(null);
  };

  const blocksList = (
    <Stack spacing={0.75}>
      {template.blocks.map((block, index) => (
        <BlockRow key={block.id}>
          {draggingId !== null && dropIndex === index && <DropIndicator style={{ top: -4 }} />}
          <BlockCard
            block={block}
            schema={schema}
            usedFields={usedFieldsForBlock(block.id)}
            isFirst={index === 0}
            isLast={index === template.blocks.length - 1}
            isDragging={draggingId === block.id}
            onChange={patchBlock}
            onMove={(blockId, direction) => props.onChange(moveBlock(template, blockId, direction))}
            onRemove={(blockId) => props.onChange(removeBlock(template, blockId))}
            onDragStart={(blockId) => {
              setDraggingId(blockId);
              setDropIndex(null);
            }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={() => {
              setDraggingId(null);
              setDropIndex(null);
            }}
          />
          {draggingId !== null && dropIndex === template.blocks.length && index === template.blocks.length - 1 && (
            <DropIndicator style={{ bottom: -4 }} />
          )}
        </BlockRow>
      ))}
      {template.blocks.length === 0 && <Hint>Нет блоков — добавьте блок выше.</Hint>}
    </Stack>
  );

  const advancedSection = (
    <Accordion sx={{ mt: 1, mb: 1 }} disableGutters>
      <AccordionSummary>Дополнительно: координаты, ссылка точки, иконка</AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1}>
            {selectField(template.latField, 'Поле широты', schema, (value) => props.onChange({ ...template, latField: value }), false)}
            {selectField(template.lonField, 'Поле долготы', schema, (value) => props.onChange({ ...template, lonField: value }), false)}
          </Stack>
          <Stack direction="row" spacing={1}>
            {selectField(template.urlField, 'URL (GPX url)', schema, (value) => props.onChange({ ...template, urlField: value }), true)}
            {selectField(template.urlNameField, 'Название ссылки', schema, (value) => props.onChange({ ...template, urlNameField: value }), true)}
          </Stack>
          <Hint>
            Пусто — ссылка берётся из первого URL блока «Ссылки», а название — из названия точки. В GPX это теги
            {' <url> '}и{' <urlname>.'}
          </Hint>
          {selectField(template.iconField, 'Иконка (GPX sym)', schema, (value) => props.onChange({ ...template, iconField: value }), true)}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );

  const saveLoadRow = (
    <Stack direction="row" spacing={1} alignItems="center">
      <Button size="small" variant="outlined" onClick={() => void handleSaveTemplate()}>
        Сохранить шаблон
      </Button>
      <TextField
        select
        size="small"
        label="Сохранённые шаблоны"
        value={selectedTemplateId}
        onChange={(event) => setSelectedTemplateId(event.target.value)}
        sx={{ flex: 1 }}
      >
        <MenuItem value="">— выбрать —</MenuItem>
        {savedTemplates.map((item) => (
          <MenuItem key={item.id} value={item.id}>
            {item.id}
          </MenuItem>
        ))}
      </TextField>
      <Button size="small" variant="outlined" disabled={!selectedTemplateId} onClick={() => void handleLoadTemplate()}>
        Загрузить
      </Button>
    </Stack>
  );

  return (
    <div>
      {nameConfig}
      {blockToolbar}
      {blocksList}
      {advancedSection}
      {saveLoadRow}
    </div>
  );
}
