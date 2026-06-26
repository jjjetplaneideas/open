/**
 * Touch keyboard accessory row: the symbols that are painful to reach on a
 * mobile keyboard but essential when coding. Each key inserts a snippet (and an
 * optional caret offset) or fires a named action (arrows, comment toggle).
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, font, radius, space } from '../theme/theme';

export type AccessoryAction =
  | { type: 'insert'; text: string; caretOffset?: number }
  | { type: 'move'; dir: 'left' | 'right' | 'up' | 'down' }
  | { type: 'tab' }
  | { type: 'comment' };

interface Key {
  label: string;
  action: AccessoryAction;
}

const KEYS: Key[] = [
  { label: 'Tab', action: { type: 'tab' } },
  { label: '{ }', action: { type: 'insert', text: '{}', caretOffset: 1 } },
  { label: '( )', action: { type: 'insert', text: '()', caretOffset: 1 } },
  { label: '[ ]', action: { type: 'insert', text: '[]', caretOffset: 1 } },
  { label: '"', action: { type: 'insert', text: '""', caretOffset: 1 } },
  { label: "'", action: { type: 'insert', text: "''", caretOffset: 1 } },
  { label: '/', action: { type: 'insert', text: '/' } },
  { label: '//', action: { type: 'comment' } },
  { label: ';', action: { type: 'insert', text: ';' } },
  { label: '=', action: { type: 'insert', text: ' = ' } },
  { label: '←', action: { type: 'move', dir: 'left' } },
  { label: '→', action: { type: 'move', dir: 'right' } },
  { label: '↑', action: { type: 'move', dir: 'up' } },
  { label: '↓', action: { type: 'move', dir: 'down' } },
];

export function KeyboardAccessoryRow({ onKey }: { onKey: (a: AccessoryAction) => void }) {
  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {KEYS.map((k) => (
        <Pressable
          key={k.label}
          onPress={() => onKey(k.action)}
          style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
        >
          <Text style={styles.keyLabel}>{k.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    gap: space.sm,
    backgroundColor: colors.surfaceAlt,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  key: {
    minWidth: font.minTapTarget,
    height: font.minTapTarget,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { backgroundColor: colors.accentSoft },
  keyLabel: { color: colors.text, fontSize: font.size.md, fontFamily: font.mono },
});
