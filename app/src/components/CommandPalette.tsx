/** Modal command palette, opened from the floating action button. */
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, font, radius, space } from '../theme/theme';
import { Icon } from './ui';

export interface Command {
  id: string;
  title: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({
  visible,
  commands,
  onClose,
}: {
  visible: boolean;
  commands: Command[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () =>
      commands.filter((c) => c.title.toLowerCase().includes(query.toLowerCase().trim())),
    [commands, query]
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <View style={styles.searchRow}>
            <Icon name="palette" color={colors.accent} />
            <TextInput
              autoFocus
              placeholder="Type a command…"
              placeholderTextColor={colors.textFaint}
              value={query}
              onChangeText={setQuery}
              style={styles.input}
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.id}
            keyboardShouldPersistTaps="always"
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                onPress={() => {
                  onClose();
                  item.run();
                }}
              >
                <Text style={styles.itemTitle}>{item.title}</Text>
                {item.hint ? <Text style={styles.itemHint}>{item.hint}</Text> : null}
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.empty}>No matching commands</Text>}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-start',
    paddingTop: 96,
    paddingHorizontal: space.lg,
  },
  panel: {
    backgroundColor: colors.elevated,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxHeight: 420,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  input: { flex: 1, color: colors.text, fontSize: font.size.md, padding: 0 },
  item: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: font.minTapTarget,
    justifyContent: 'center',
  },
  itemPressed: { backgroundColor: colors.accentSoft },
  itemTitle: { color: colors.text, fontSize: font.size.md },
  itemHint: { color: colors.textFaint, fontSize: font.size.xs, marginTop: 2 },
  empty: { color: colors.textFaint, textAlign: 'center', padding: space.xl },
});
