import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import styled from 'styled-components';
import { IconButton, MenuItem, MenuList, Paper, Popper, Stack } from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import type { FieldSchema } from '@core';
import {
  applyFormatting,
  applySuggestion,
  findActiveToken,
  isKnownField,
  normalizePlaceholders,
  parsePlaceholders,
  type PlaceholderToken,
} from '@/placeholders';

interface PlaceholderInputProps {
  value: string;
  onChange: (value: string) => void;
  schema: FieldSchema[];
  label?: string;
  placeholder?: string;
  helperText?: string;
  disabled?: boolean;
  /** Показывать панель B/I у чипов (для названия точки не нужно — там plain-текст). */
  allowFormatting?: boolean;
  /** Многострочный режим: Enter вставляет перенос строки (блок «Текст»). */
  multiline?: boolean;
}

/** Сколько подсказок показывать одновременно. */
const MAX_SUGGESTIONS = 8;

const Label = styled.span`
  font-size: 11px;
  line-height: 1;
  color: ${({ theme }) => theme.palette.text.secondary};
`;

const Helper = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.palette.text.secondary};
`;

/**
 * Редактор шаблона: `{{поле}}` показывается чипом прямо в тексте
 * (оранжевый — поле есть в JSON, красный — ошибка).
 */
const Editor = styled.div<{ $multiline: boolean }>`
  min-height: 32px;
  max-height: ${({ $multiline }) => ($multiline ? '168px' : 'none')};
  overflow-y: ${({ $multiline }) => ($multiline ? 'auto' : 'visible')};
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.palette.divider};
  background: #232a34;
  color: ${({ theme }) => theme.palette.text.primary};
  font-size: 13px;
  line-height: 20px;
  white-space: pre-wrap;
  word-break: break-word;
  outline: none;
  cursor: text;

  &[data-disabled='true'] {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &[data-focused='true'] {
    border-color: ${({ theme }) => theme.palette.primary.main};
  }

  &:empty::before {
    content: attr(data-placeholder);
    color: ${({ theme }) => theme.palette.text.disabled};
    pointer-events: none;
  }

  .placeholder-chip {
    display: inline-block;
    margin: 0 1px;
    padding: 0 5px;
    border-radius: 4px;
    border: 1px solid transparent;
    font-family: Consolas, monospace;
    font-size: 11.5px;
    line-height: 18px;
    white-space: nowrap;
    user-select: all;
    cursor: default;
  }

  .placeholder-chip.is-valid {
    border-color: ${({ theme }) => theme.palette.warning.main};
    color: ${({ theme }) => theme.palette.warning.dark};
    background: rgba(255, 152, 0, 0.12);
  }

  .placeholder-chip.is-invalid {
    border-color: ${({ theme }) => theme.palette.error.main};
    color: ${({ theme }) => theme.palette.error.main};
    background: rgba(244, 67, 54, 0.12);
  }

  .placeholder-chip.is-bold {
    font-weight: 700;
  }

  .placeholder-chip.is-italic {
    font-style: italic;
  }

  .placeholder-chip[data-selected='true'] {
    outline: 2px solid ${({ theme }) => theme.palette.primary.main};
    outline-offset: 1px;
  }
`;

function fieldLabel(field: FieldSchema): string {
  return field.itemType ? `${field.path} (${field.type}/${field.itemType})` : `${field.path} (${field.type})`;
}

/** Модельный текст узла: обычный текст как есть, чип — как `{{**name**}}`, `<br>` — как перенос. */
function nodeText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
  if (node instanceof HTMLElement) {
    if (node.dataset.token !== undefined) return node.dataset.raw ?? '';
    if (node.tagName === 'BR') return '\n';
  }

  let text = '';
  node.childNodes.forEach((child, index) => {
    const isBlock = child instanceof HTMLElement && /^(DIV|P|LI)$/.test(child.tagName);
    if (isBlock && index > 0) text += '\n';
    text += nodeText(child);
  });
  return text;
}

/** Позиция курсора в модельном тексте (0 — начало). */
function caretOffset(root: HTMLElement): number | null {
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  let total = 0;
  let found = false;
  const walk = (node: Node): void => {
    if (found) return;
    if (node === range.startContainer) {
      found = true;
      if (node.nodeType === Node.TEXT_NODE) {
        total += range.startOffset;
      } else {
        for (let index = 0; index < range.startOffset && index < node.childNodes.length; index += 1) {
          total += nodeText(node.childNodes[index]).length;
        }
      }
      return;
    }
    if (node.nodeType === Node.TEXT_NODE || (node instanceof HTMLElement && node.dataset.token !== undefined)) {
      total += nodeText(node).length;
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(root);
  return found ? total : null;
}

/** Ставит курсор по позиции в модельном тексте. */
function setCaretAt(root: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (selection === null) return;

  const range = document.createRange();
  let remaining = Math.max(0, offset);
  let placed = false;

  const walk = (node: Node): void => {
    if (placed) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.nodeValue?.length ?? 0;
      if (remaining <= length) {
        range.setStart(node, remaining);
        placed = true;
        return;
      }
      remaining -= length;
      return;
    }
    if (node instanceof HTMLElement && node.dataset.token !== undefined) {
      const length = (node.dataset.raw ?? '').length;
      if (remaining <= 0) {
        range.setStartBefore(node);
        placed = true;
        return;
      }
      if (remaining < length) {
        range.setStartAfter(node);
        placed = true;
        return;
      }
      remaining -= length;
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(root);

  if (placed) range.collapse(true);
  else {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Вставляет простой текст в позицию курсора внутри редактора. */
function insertTextAtCaret(text: string): void {
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Вставляет текст штатной командой браузера (сохраняет undo). */
function insertWithCommand(command: string, text?: string): boolean {
  try {
    if (typeof document.execCommand !== 'function') return false;
    return text === undefined ? document.execCommand(command) : document.execCommand(command, false, text);
  } catch {
    return false;
  }
}

/** Создаёт DOM-чип для плейсхолдера (с учётом начертания). */
function createChip(token: PlaceholderToken, schema: FieldSchema[]): HTMLElement {
  const valid = isKnownField(schema, token.name);
  const chip = document.createElement('span');
  chip.dataset.token = token.name;
  chip.dataset.raw = token.raw;
  chip.contentEditable = 'false';

  const classes = ['placeholder-chip', valid ? 'is-valid' : 'is-invalid'];
  if (token.bold) classes.push('is-bold');
  if (token.italic) classes.push('is-italic');
  chip.className = classes.join(' ');

  const format = [token.bold ? 'жирный' : '', token.italic ? 'курсив' : ''].filter(Boolean).join(' + ');
  chip.title = `${valid ? 'Поле есть в JSON' : 'Такого поля нет в JSON'}${format === '' ? '' : ' · ' + format}`;
  chip.textContent = token.name === '' ? 'пустое поле' : token.name;
  return chip;
}

/** Перерисовывает содержимое редактора: текст + чипы вместо `{{поле}}`. */
function renderChips(root: HTMLElement, value: string, schema: FieldSchema[], selected: number | null = null): void {
  root.textContent = '';
  let index = 0;
  let chipIndex = 0;
  for (const token of parsePlaceholders(value)) {
    if (!token.closed) continue;
    if (token.start > index) root.appendChild(document.createTextNode(value.slice(index, token.start)));
    const chip = createChip(token, schema);
    if (selected !== null && selected === chipIndex) chip.dataset.selected = 'true';
    root.appendChild(chip);
    chipIndex += 1;
    index = token.end;
  }
  if (index < value.length) root.appendChild(document.createTextNode(value.slice(index)));
}

/** Подсвечивает чип с указанным индексом (или снимает подсветку). */
function markSelection(root: HTMLElement, selected: number | null): void {
  Array.from(root.querySelectorAll<HTMLElement>('[data-token]')).forEach((chip, index) => {
    if (selected === index) chip.dataset.selected = 'true';
    else delete chip.dataset.selected;
  });
}

/** Модельные строки чипов, которые сейчас в DOM. */
function chipRaws(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-token]')).map((chip) => chip.dataset.raw ?? '');
}

/** Модельные строки закрытых плейсхолдеров в тексте. */
function closedRaws(value: string): string[] {
  return parsePlaceholders(value)
    .filter((token) => token.closed)
    .map((token) => token.raw);
}

export function PlaceholderInput(props: PlaceholderInputProps): JSX.Element {
  const { value, schema } = props;
  const formattingEnabled = props.allowFormatting !== false;
  const multiline = props.multiline === true;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastSchema = useRef<FieldSchema[]>(schema);
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const active = useMemo(() => findActiveToken(text, caret), [text, caret]);

  const suggestions = useMemo(() => {
    if (active === null) return [];
    const query = active.query.trim().toLowerCase();
    const startsWith: FieldSchema[] = [];
    const contains: FieldSchema[] = [];
    for (const field of schema) {
      const path = field.path.toLowerCase();
      if (query === '' || path.startsWith(query)) startsWith.push(field);
      else if (path.includes(query)) contains.push(field);
    }
    return [...startsWith, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [active, schema]);

  const open = active !== null && !dismissed && suggestions.length > 0;

  // DOM — источник правды во время ввода; синхронизируем только при внешних изменениях.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const schemaChanged = lastSchema.current !== schema;
    if (nodeText(root) === value && !schemaChanged) return;

    const offset = document.activeElement === root ? caretOffset(root) : null;
    renderChips(root, value, schema);
    lastSchema.current = schema;
    setText(value);
    if (offset !== null) setCaretAt(root, offset);
  }, [value, schema]);

  const syncCaret = (): void => {
    const root = rootRef.current;
    if (root === null) return;
    setCaret(caretOffset(root) ?? 0);
  };

  const handleInput = (): void => {
    const root = rootRef.current;
    if (root === null) return;
    const raw = nodeText(root);
    const rawOffset = caretOffset(root) ?? raw.length;
    const normalized = normalizePlaceholders(raw);
    const offset = normalizePlaceholders(raw.slice(0, rawOffset)).length;

    setDismissed(false);
    setHighlighted(0);
    setSelectedIndex(null);
    setCaret(offset);
    setText(normalized);
    props.onChange(normalized);

    const tokensNow = closedRaws(normalized);
    const chipsNow = chipRaws(root);
    const tokensDiffer = tokensNow.length !== chipsNow.length || tokensNow.some((raw, index) => raw !== chipsNow[index]);
    if (normalized !== raw || tokensDiffer) {
      renderChips(root, normalized, schema);
      setCaretAt(root, offset);
    }
  };

  const accept = (field: FieldSchema): void => {
    const root = rootRef.current;
    if (root === null || active === null) return;
    const current = normalizePlaceholders(nodeText(root));
    const next = applySuggestion(current, active, field.path);
    props.onChange(next.value);
    renderChips(root, next.value, schema);
    setText(next.value);
    setCaret(next.caret);
    setDismissed(false);
    setHighlighted(0);
    root.focus();
    setCaretAt(root, next.caret);
  };

  /** Индекс чипа, рядом с которым стоит курсор. */
  const chipIndexAtCaret = (): number | null => {
    const tokens = parsePlaceholders(text).filter((token) => token.closed);
    const index = tokens.findIndex((token) => token.start === caret || token.end === caret);
    return index < 0 ? null : index;
  };

  /** Переключает жирный/курсив у выбранного чипа (или у чипа рядом с курсором). */
  const toggleFormatting = (kind: 'bold' | 'italic'): void => {
    if (!formattingEnabled) return;
    const root = rootRef.current;
    if (root === null) return;
    const index = selectedIndex ?? chipIndexAtCaret();
    if (index === null) return;

    const current = normalizePlaceholders(nodeText(root));
    const token = parsePlaceholders(current).filter((item) => item.closed)[index];
    if (token === undefined) return;

    const next =
      kind === 'bold' ? { bold: !token.bold, italic: token.italic } : { bold: token.bold, italic: !token.italic };
    const applied = applyFormatting(current, index, next);

    props.onChange(applied.value);
    setText(applied.value);
    setSelectedIndex(index);
    renderChips(root, applied.value, schema, index);
    root.focus();
    setCaretAt(root, applied.caret);
    setCaret(applied.caret);
  };

  const handleEditorClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    syncCaret();
    const root = rootRef.current;
    if (root === null) return;

    if (!formattingEnabled) {
      setSelectedIndex(null);
      markSelection(root, null);
      return;
    }

    const target = event.target as HTMLElement | null;
    const chip = target === null ? null : target.closest('[data-token]');
    if (chip === null) {
      setSelectedIndex(null);
      markSelection(root, null);
      return;
    }

    const chips = Array.from(root.querySelectorAll<HTMLElement>('[data-token]'));
    const index = chips.indexOf(chip as HTMLElement);
    const nextIndex = index < 0 ? null : index;
    setSelectedIndex(nextIndex);
    markSelection(root, nextIndex);
  };

  const selectedChip =
    selectedIndex === null
      ? null
      : (rootRef.current?.querySelectorAll<HTMLElement>('[data-token]')[selectedIndex] ?? null);
  const selectedToken = useMemo(() => {
    if (selectedIndex === null) return null;
    return parsePlaceholders(text).filter((token) => token.closed)[selectedIndex] ?? null;
  }, [selectedIndex, text]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    // Начертание чипа: Ctrl/Cmd+B и Ctrl/Cmd+I (учтены русские клавиши «и» и «ш»).
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (key === 'b' || key === 'и') {
        event.preventDefault();
        toggleFormatting('bold');
        return;
      }
      if (key === 'i' || key === 'ш') {
        event.preventDefault();
        toggleFormatting('italic');
        return;
      }
    }

    if (open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        setHighlighted((index) => (index + delta + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        accept(suggestions[Math.min(highlighted, suggestions.length - 1)]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissed(true);
        return;
      }
    }
    // Enter: в многострочном режиме — перенос строки, иначе просто не даём создать новый абзац.
    if (event.key === 'Enter') {
      event.preventDefault();
      if (multiline) {
        if (!insertWithCommand('insertLineBreak')) {
          insertTextAtCaret('\n');
          handleInput();
        }
      }
    }
  };

  const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
    if (pasted === '') return;

    const text = multiline ? pasted : pasted.replace(/\n+/g, ' ');
    if (!insertWithCommand('insertText', text)) {
      insertTextAtCaret(text);
      handleInput();
    }
  };

  return (
    <Stack sx={{ minWidth: 0, flex: '1 1 auto' }} spacing={0.5}>
      {props.label !== undefined && <Label>{props.label}</Label>}
      <Editor
        ref={rootRef}
        role="textbox"
        aria-multiline={multiline}
        aria-label={props.label ?? props.placeholder}
        contentEditable={props.disabled !== true}
        $multiline={multiline}
        data-disabled={props.disabled === true}
        data-focused={focused}
        data-placeholder={props.placeholder ?? ''}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={syncCaret}
        onMouseUp={syncCaret}
        onClick={handleEditorClick}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onBlur={() => {
          setFocused(false);
          setDismissed(true);
        }}
        onPaste={handlePaste}
      />
      {props.helperText !== undefined && <Helper>{props.helperText}</Helper>}
      <Popper open={open} anchorEl={rootRef.current} placement="bottom-start" sx={{ zIndex: 1500 }}>
        <Paper elevation={4} sx={{ mt: 0.5, minWidth: 240, maxHeight: 240, overflowY: 'auto' }}>
          <MenuList dense sx={{ py: 0.5 }}>
            {suggestions.map((field, index) => (
              <MenuItem
                key={field.path}
                selected={index === highlighted}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => accept(field)}
                sx={{ fontFamily: 'Consolas, monospace', fontSize: 12.5 }}
              >
                {fieldLabel(field)}
              </MenuItem>
            ))}
          </MenuList>
        </Paper>
      </Popper>
      <Popper
        open={formattingEnabled && selectedChip !== null && selectedToken !== null}
        anchorEl={selectedChip}
        placement="top"
        sx={{ zIndex: 1600 }}
      >
        <Paper elevation={4} sx={{ display: 'flex', gap: 0.25, p: 0.25 }}>
          <IconButton
            size="small"
            aria-label="жирный"
            title="Жирный (Ctrl+B)"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => toggleFormatting('bold')}
            sx={{
              color: selectedToken?.bold === true ? 'primary.main' : 'text.secondary',
              bgcolor: selectedToken?.bold === true ? 'action.selected' : 'transparent',
            }}
          >
            <FormatBoldIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <IconButton
            size="small"
            aria-label="курсив"
            title="Курсив (Ctrl+I)"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => toggleFormatting('italic')}
            sx={{
              color: selectedToken?.italic === true ? 'primary.main' : 'text.secondary',
              bgcolor: selectedToken?.italic === true ? 'action.selected' : 'transparent',
            }}
          >
            <FormatItalicIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Paper>
      </Popper>
    </Stack>
  );
}

