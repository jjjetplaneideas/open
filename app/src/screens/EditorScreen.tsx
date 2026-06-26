import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, space } from '../theme/theme';
import { Badge, Icon } from '../components/ui';
import { CodeEditor } from '../components/CodeEditor';
import { useApp } from '../state/AppState';

export function EditorScreen() {
  const { openFile, editFile, dirtyPaths, navigate } = useApp();
  const [showLineNumbers, setShowLineNumbers] = useState(true);

  if (!openFile) {
    return (
      <View style={[styles.container, styles.center]}>
        <Icon name="editor" size={32} color={colors.textFaint} />
        <Text style={styles.emptyTitle}>No file open</Text>
        <Pressable onPress={() => navigate('explorer')}>
          <Text style={styles.link}>Browse files →</Text>
        </Pressable>
      </View>
    );
  }

  const isDirty = dirtyPaths.includes(openFile.path);

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        <Icon name="file" color={colors.textMuted} />
        <Text style={styles.path} numberOfLines={1}>
          {openFile.path}
        </Text>
        {isDirty ? <Badge text="unsaved" tone="accent" /> : null}
        <Pressable
          onPress={() => setShowLineNumbers((s) => !s)}
          style={styles.toggle}
          hitSlop={8}
        >
          <Text style={[styles.toggleText, showLineNumbers && styles.toggleOn]}># lines</Text>
        </Pressable>
      </View>
      <CodeEditor value={openFile.text} onChange={editFile} showLineNumbers={showLineNumbers} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md },
  emptyTitle: { color: colors.textMuted, fontSize: font.size.md },
  link: { color: colors.accent, fontSize: font.size.md },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  path: { color: colors.text, fontSize: font.size.sm, fontFamily: font.mono, flex: 1 },
  toggle: { paddingHorizontal: space.sm, paddingVertical: 4 },
  toggleText: { color: colors.textFaint, fontSize: font.size.xs },
  toggleOn: { color: colors.accent },
});
