import { useState } from 'react';
import styled from 'styled-components';
import { IconButton, MenuItem, Popover, Stack, TextField, Tooltip, Typography } from '@mui/material';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CodeIcon from '@mui/icons-material/Code';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import TranslateIcon from '@mui/icons-material/Translate';
import type { FieldSchema, FieldWrap, TemplateBlock } from '@core';
import { buildFieldOptions, getBlockFormatting } from '@/template';
import { PlaceholderInput } from '@/components/PlaceholderInput';
import { FIELD_WRAP_OPTIONS, LIST_ITEM_FORMAT_OPTIONS } from '@/constants';

interface BlockCardProps {
  block: TemplateBlock;
  schema: FieldSchema[];
  usedFields: string[];
  isFirst: boolean;
  isLast: boolean;
  isDragging: boolean;
  onChange: (blockId: string, patch: Partial<TemplateBlock>) => void;
  onMove: (blockId: string, direction: -1 | 1) => void;
  onRemove: (blockId: string) => void;
  onDragStart: (blockId: string) => void;
  onDragOver: (blockId: string, position: 'before' | 'after') => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

const KIND_LABELS: Record<TemplateBlock['kind'], string> = {
  field: 'Поле',
  image: 'Картинка',
  list: 'Список',
  links: 'Ссылки',
  literal: 'Текст',
  separator: 'Разделитель',
};

const Row = styled.div<{ $dragging: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.palette.divider};
  background: ${({ theme, $dragging }) => ($dragging ? theme.palette.action.selected : theme.palette.background.paper)};
  opacity: ${({ $dragging }) => ($dragging ? 0.45 : 1)};
  transition: background 0.15s ease;
  overflow: hidden;
`;

const Handle = styled.span`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 28px;
  cursor: grab;
  user-select: none;
  color: ${({ theme }) => theme.palette.text.secondary};

  &:active {
    cursor: grabbing;
  }
`;

const KindBadge = styled.span`
  flex: 0 0 auto;
  font-size: 10px;
  line-height: 1;
  padding: 3px 5px;
  border-radius: 5px;
  color: ${({ theme }) => theme.palette.text.secondary};
  background: ${({ theme }) => theme.palette.action.hover};
  white-space: nowrap;
`;

const Actions = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
`;

const SquareButton = styled(IconButton)`
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
  flex: 0 0 auto;
`;

/** Пустое место под кнопку разметки — чтобы все карточки были выровнены. */
const ToggleSlot = styled.span`
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
`;

function settingsSummary(block: TemplateBlock): { active: boolean; tooltip: string } {
  if (block.kind === 'field' || block.kind === 'image') {
    return block.label ? { active: true, tooltip: `Подпись: ${block.label}` } : { active: false, tooltip: 'Подпись' };
  }
  if (block.kind === 'list') {
    return block.subfield ? { active: true, tooltip: `Подполе: ${block.subfield}` } : { active: false, tooltip: 'Подполе' };
  }
  if (block.kind === 'links') {
    const nameField = block.nameField ?? 'name';
    const urlField = block.urlField ?? 'url';
    return { active: nameField !== 'name' || urlField !== 'url', tooltip: `Название: ${nameField}, URL: ${urlField}` };
  }
  if (block.kind === 'separator') {
    const fields = block.conditionFields ?? [];
    return fields.length
      ? { active: true, tooltip: `Показывать, если заполнено: ${fields.join(', ')}` }
      : { active: false, tooltip: 'Показывать всегда' };
  }
  return { active: false, tooltip: 'Дополнительно' };
}

export function BlockCard(props: BlockCardProps): JSX.Element {
  const { block, schema } = props;
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);

  const options = buildFieldOptions(schema, new Set(props.usedFields), block.field ?? '');
  const allOptions = buildFieldOptions(schema);
  const hasSettings =
    block.kind === 'field' || block.kind === 'image' || block.kind === 'list' || block.kind === 'links' || block.kind === 'separator';
  const supportsTranslate = block.kind === 'field' || block.kind === 'list' || block.kind === 'links';
  const summary = settingsSummary(block);
  const formatting = getBlockFormatting(block);
  const markupSupported = block.kind === 'field' || block.kind === 'literal';

  const markupToggle = (
    <Tooltip
      title={
        formatting.markup
          ? 'Разметка Markdown/HTML включена — нажмите, чтобы выводить текст как есть'
          : 'Текст выводится как есть — нажмите, чтобы включить Markdown/HTML'
      }
    >
      <SquareButton
        aria-label="разметка"
        onClick={() => props.onChange(block.id, { wrap: formatting.wrap, markup: !formatting.markup })}
        sx={{
          color: formatting.markup ? 'primary.main' : 'text.disabled',
          bgcolor: formatting.markup ? 'action.selected' : 'transparent',
        }}
      >
        <CodeIcon fontSize="small" />
      </SquareButton>
    </Tooltip>
  );

  const fieldSelect = (
    <TextField
      select
      size="small"
      value={block.field ?? ''}
      onChange={(event) => props.onChange(block.id, { field: event.target.value })}
      sx={{ flex: 1, minWidth: 0 }}
    >
      {!(block.field && options.some((option) => option.value === block.field)) && (
        <MenuItem value={block.field ?? ''}>{block.field ? `${block.field} (нет в схеме)` : '— выберите поле —'}</MenuItem>
      )}
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value} sx={{ color: option.used ? 'text.disabled' : 'text.primary' }}>
          {option.label}
          {option.used ? '  ·  уже в шаблоне' : ''}
        </MenuItem>
      ))}
    </TextField>
  );

  let content: JSX.Element;
  if (block.kind === 'separator') {
    const conditions = block.conditionFields ?? [];
    content = (
      <Typography variant="caption" sx={{ flex: 1, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {conditions.length ? `если заполнено: ${conditions.join(', ')}` : 'линия-разделитель'}
      </Typography>
    );
  } else if (block.kind === 'literal') {
    content = (
      <PlaceholderInput
        value={block.text ?? ''}
        onChange={(value) => props.onChange(block.id, { text: value })}
        schema={schema}
        multiline
        placeholder="Текст с {{поле}}; Enter — перенос строки"
      />
    );
  } else {
    const formatSelect =
      block.kind === 'list' ? (
        <TextField
          select
          size="small"
          value={block.itemFormat ?? 'plain'}
          onChange={(event) => props.onChange(block.id, { itemFormat: event.target.value as TemplateBlock['itemFormat'] })}
          sx={{ width: 108, flex: '0 0 auto' }}
        >
          {LIST_ITEM_FORMAT_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      ) : block.kind === 'field' ? (
        <TextField
          select
          size="small"
          value={formatting.wrap}
          onChange={(event) => props.onChange(block.id, { wrap: event.target.value as FieldWrap, markup: formatting.markup })}
          sx={{ width: 118, flex: '0 0 auto' }}
        >
          {FIELD_WRAP_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      ) : null;

    content = (
      <>
        {fieldSelect}
        {formatSelect}
      </>
    );
  }


  return (
    <Row
      data-block-row
      $dragging={props.isDragging}
      onDragOver={(event) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        props.onDragOver(block.id, event.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
      }}
      onDrop={(event) => {
        event.preventDefault();
        props.onDrop();
      }}
    >
      <Handle
        draggable
        title="Перетащите, чтобы изменить порядок"
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          const row = event.currentTarget.closest('[data-block-row]');
          if (row) event.dataTransfer.setDragImage(row, 12, 12);
          props.onDragStart(block.id);
        }}
        onDragEnd={() => props.onDragEnd()}
      >
        <DragIndicatorIcon fontSize="small" />
      </Handle>

      <KindBadge>{KIND_LABELS[block.kind]}</KindBadge>
      {content}

      {markupSupported ? markupToggle : <ToggleSlot aria-hidden data-markup-slot />}

      {supportsTranslate && (
        <Tooltip title={block.translate ? 'Поле переводится — нажмите, чтобы отключить' : 'Поле не переводится — нажмите, чтобы включить'}>
          <SquareButton
            aria-label="переводить"
            onClick={() => props.onChange(block.id, { translate: !block.translate })}
            sx={{
              color: block.translate ? 'primary.main' : 'text.disabled',
              bgcolor: block.translate ? 'action.selected' : 'transparent',
            }}
          >
            <TranslateIcon fontSize="small" />
          </SquareButton>
        </Tooltip>
      )}

      {hasSettings && (
        <Tooltip title={summary.tooltip}>
          <SquareButton
            aria-label="дополнительно"
            onClick={(event) => setSettingsAnchor(event.currentTarget)}
            sx={{ color: summary.active ? 'primary.main' : 'text.disabled' }}
          >
            <EditIcon fontSize="small" />
          </SquareButton>
        </Tooltip>
      )}

      <Actions>
        <SquareButton disabled={props.isFirst} title="Вверх" onClick={() => props.onMove(block.id, -1)}>
          <ArrowUpwardIcon fontSize="small" />
        </SquareButton>
        <SquareButton disabled={props.isLast} title="Вниз" onClick={() => props.onMove(block.id, 1)}>
          <ArrowDownwardIcon fontSize="small" />
        </SquareButton>
        <SquareButton title="Удалить" onClick={() => props.onRemove(block.id)} sx={{ color: 'error.main' }}>
          <DeleteOutlineIcon fontSize="small" />
        </SquareButton>
      </Actions>

      <Popover
        open={Boolean(settingsAnchor)}
        anchorEl={settingsAnchor}
        onClose={() => setSettingsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Stack spacing={1} sx={{ p: 1.5, width: 240 }}>
          {(block.kind === 'field' || block.kind === 'image') && (
            <TextField size="small" label="Подпись" value={block.label ?? ''} onChange={(event) => props.onChange(block.id, { label: event.target.value })} />
          )}
          {block.kind === 'list' && (
            <TextField size="small" label="Подполе (массив объектов)" value={block.subfield ?? ''} onChange={(event) => props.onChange(block.id, { subfield: event.target.value })} />
          )}
          {block.kind === 'links' && (
            <>
              <TextField size="small" label="Поле названия" value={block.nameField ?? 'name'} onChange={(event) => props.onChange(block.id, { nameField: event.target.value })} />
              <TextField size="small" label="Поле URL" value={block.urlField ?? 'url'} onChange={(event) => props.onChange(block.id, { urlField: event.target.value })} />
            </>
          )}
          {block.kind === 'separator' && (
            <TextField
              select
              size="small"
              label="Показывать, если заполнено"
              SelectProps={{ multiple: true }}
              value={block.conditionFields ?? []}
              onChange={(event) => props.onChange(block.id, { conditionFields: event.target.value as unknown as string[] })}
              helperText="Разделитель появится, если хотя бы одно из этих полей не пустое"
              fullWidth
            >
              {allOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Stack>
      </Popover>
    </Row>
  );
}

