/**
 * Touch code editor.
 *
 * Technique: a syntax-highlighted text layer is rendered *behind* a transparent
 * <TextInput>. They share identical font metrics so the colored text lines up
 * under the editable (but invisible) input that owns the caret and selection.
 * This is the standard React Native approach to inline highlighting without a
 * native text view.
 *
 * Features: line-number gutter (toggle), undo/redo, find + replace, long-press
 * selection (native), and the keyboard accessory row.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputSelectionChangeEventData,
  View,
} from 'react-native';
import { colors, font, radius, space } from '../theme/theme';
import { tokenColor, tokenizeLine } from '../editor/highlight';
import { AccessoryAction, KeyboardAccessoryRow } from './KeyboardAccessoryRow';
import { Icon } from './ui';

const LINE_HEIGHT = 20;
const FONT_SIZE = 13;

interface Selection {
  start: number;
  end: number;
}

export function CodeEditor({
  value,
  onChange,
  showLineNumbers,
}: {
  value: string;
  onChange: (text: string) => void;
  showLineNumbers: boolean;
}) {
  const inputRef = useRef<TextInput>(null);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [pendingSelection, setPendingSelection] = useState<Selection | null>(null);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);

  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');

  const lines = useMemo(() => value.split('\n'), [value]);

  const pushHistory = useCallback((prev: string) => {
    undoStack.current.push(prev);
    if (undoStack.current.length > 200) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  const change = useCallback(
    (next: string) => {
      pushHistory(value);
      onChange(next);
    },
    [value, onChange, pushHistory]
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (prev === undefined) return;
    redoStack.current.push(value);
    onChange(prev);
  }, [value, onChange]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (next === undefined) return;
    undoStack.current.push(value);
    onChange(next);
  }, [value, onChange]);

  const onSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      setSelection(e.nativeEvent.selection);
    },
    []
  );

  const replaceRange = useCallback(
    (start: number, end: number, insert: string, caret?: number) => {
      const next = value.slice(0, start) + insert + value.slice(end);
      change(next);
      const pos = caret ?? start + insert.length;
      setPendingSelection({ start: pos, end: pos });
    },
    [value, change]
  );

  const handleAccessory = useCallback(
    (a: AccessoryAction) => {
      const { start, end } = selection;
      switch (a.type) {
        case 'insert':
          replaceRange(start, end, a.text, start + (a.caretOffset ?? a.text.length));
          break;
        case 'tab':
          replaceRange(start, end, '  ');
          break;
        case 'comment': {
          // Toggle a line comment at the current line start.
          const lineStart = value.lastIndexOf('\n', start - 1) + 1;
          const hasComment = value.slice(lineStart, lineStart + 2) === '//';
          if (hasComment) replaceRange(lineStart, lineStart + 3, '', start - 3);
          else replaceRange(lineStart, lineStart, '// ', start + 3);
          break;
        }
        case 'move': {
          const delta = a.dir === 'left' ? -1 : a.dir === 'right' ? 1 : 0;
          const pos = Math.max(0, Math.min(value.length, start + delta));
          setPendingSelection({ start: pos, end: pos });
          break;
        }
      }
    },
    [selection, value, replaceRange]
  );

  const runReplaceAll = useCallback(() => {
    if (!findText) return;
    change(value.split(findText).join(replaceText));
  }, [findText, replaceText, value, change]);

  const findNext = useCallback(() => {
    if (!findText) return;
    const from = selection.end;
    const idx = value.indexOf(findText, from);
    const at = idx >= 0 ? idx : value.indexOf(findText);
    if (at >= 0) {
      setPendingSelection({ start: at, end: at + findText.length });
      inputRef.current?.focus();
    }
  }, [findText, selection.end, value]);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <ToolbarButton icon="search" label="Find" onPress={() => setFindOpen((o) => !o)} />
        <ToolbarButton icon="back" label="Undo" onPress={undo} />
        <ToolbarButton icon="back" label="Redo" onPress={redo} flip />
        <View style={{ flex: 1 }} />
        <Text style={styles.meta}>
          {lines.length} lines · {value.length} chars
        </Text>
      </View>

      {findOpen ? (
        <View style={styles.findBar}>
          <TextInput
            placeholder="Find"
            placeholderTextColor={colors.textFaint}
            value={findText}
            onChangeText={setFindText}
            style={styles.findInput}
          />
          <TextInput
            placeholder="Replace"
            placeholderTextColor={colors.textFaint}
            value={replaceText}
            onChangeText={setReplaceText}
            style={styles.findInput}
          />
          <Pressable style={styles.findBtn} onPress={findNext}>
            <Text style={styles.findBtnText}>Next</Text>
          </Pressable>
          <Pressable style={styles.findBtn} onPress={runReplaceAll}>
            <Text style={styles.findBtnText}>All</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <ScrollView horizontal keyboardShouldPersistTaps="handled">
          <View style={styles.editorRow}>
            {showLineNumbers ? (
              <View style={styles.gutter}>
                {lines.map((_, i) => (
                  <Text key={i} style={styles.lineNo}>
                    {i + 1}
                  </Text>
                ))}
              </View>
            ) : null}

            <View style={styles.codeArea}>
              {/* Highlight layer (read-only, sits behind the input). */}
              <View pointerEvents="none" style={styles.highlightLayer}>
                {lines.map((line, i) => (
                  <Text key={i} style={styles.codeLine}>
                    {tokenizeLine(line).map((tok, j) => (
                      <Text key={j} style={{ color: tokenColor[tok.kind] }}>
                        {tok.text}
                      </Text>
                    ))}
                    {line.length === 0 ? ' ' : ''}
                  </Text>
                ))}
              </View>

              {/* Editable transparent input on top. */}
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={value}
                onChangeText={change}
                onSelectionChange={onSelectionChange}
                selection={pendingSelection ?? undefined}
                onKeyPress={() => setPendingSelection(null)}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                keyboardAppearance="dark"
                textAlignVertical="top"
                selectionColor={colors.accent}
              />
            </View>
          </View>
        </ScrollView>
      </ScrollView>

      <KeyboardAccessoryRow onKey={handleAccessory} />
    </View>
  );
}

function ToolbarButton({
  icon,
  label,
  onPress,
  flip,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  flip?: boolean;
}) {
  return (
    <Pressable style={styles.toolBtn} onPress={onPress}>
      <View style={flip ? { transform: [{ scaleX: -1 }] } : undefined}>
        <Icon name={icon} color={colors.textMuted} />
      </View>
      <Text style={styles.toolBtnLabel}>{label}</Text>
    </Pressable>
  );
}

const monoText = {
  fontFamily: font.mono,
  fontSize: FONT_SIZE,
  lineHeight: LINE_HEIGHT,
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  toolBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  toolBtnLabel: { color: colors.textMuted, fontSize: font.size.sm },
  meta: { color: colors.textFaint, fontSize: font.size.xs },
  findBar: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.sm,
    backgroundColor: colors.surfaceAlt,
  },
  findInput: {
    flex: 1,
    backgroundColor: colors.bg,
    color: colors.text,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    height: 36,
  },
  findBtn: {
    paddingHorizontal: space.md,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  findBtnText: { color: colors.accent, fontWeight: '600' },
  scroll: { flex: 1 },
  editorRow: { flexDirection: 'row', minWidth: '100%' },
  gutter: {
    paddingTop: space.sm,
    paddingHorizontal: space.sm,
    backgroundColor: colors.surface,
  },
  lineNo: { ...monoText, color: colors.textFaint, textAlign: 'right', minWidth: 28 },
  codeArea: { flex: 1, paddingTop: space.sm, paddingHorizontal: space.sm, minWidth: 320 },
  highlightLayer: { ...StyleSheet.absoluteFillObject, paddingTop: space.sm, paddingHorizontal: space.sm },
  codeLine: { ...monoText },
  input: { ...monoText, color: 'transparent', padding: 0, margin: 0, minHeight: LINE_HEIGHT * 4 },
});
