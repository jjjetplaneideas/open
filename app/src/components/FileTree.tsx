/** Recursive, collapsible file tree. Highlights the open file and dirty files. */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '../theme/theme';
import type { FileNode } from '../services/types';
import { Icon } from './ui';

export function FileTree({
  node,
  openPath,
  dirtyPaths,
  onSelect,
}: {
  node: FileNode;
  openPath: string | null;
  dirtyPaths: string[];
  onSelect: (path: string) => void;
}) {
  return (
    <View>
      {(node.children ?? []).map((child) => (
        <TreeRow
          key={child.path}
          node={child}
          depth={0}
          openPath={openPath}
          dirtyPaths={dirtyPaths}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

function TreeRow({
  node,
  depth,
  openPath,
  dirtyPaths,
  onSelect,
}: {
  node: FileNode;
  depth: number;
  openPath: string | null;
  dirtyPaths: string[];
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isDir = node.type === 'dir';
  const isOpen = node.path === openPath;
  const isDirty = dirtyPaths.includes(node.path);

  return (
    <View>
      <Pressable
        onPress={() => (isDir ? setExpanded((e) => !e) : onSelect(node.path))}
        style={({ pressed }) => [
          styles.row,
          { paddingLeft: space.md + depth * space.lg },
          isOpen && styles.rowOpen,
          pressed && styles.rowPressed,
        ]}
      >
        <Icon
          name={isDir ? (expanded ? 'folderOpen' : 'folder') : 'file'}
          color={isDir ? colors.accent : colors.textMuted}
        />
        <Text style={[styles.name, isOpen && styles.nameOpen]} numberOfLines={1}>
          {node.name}
        </Text>
        {isDirty ? <View style={styles.dot} /> : null}
      </Pressable>
      {isDir && expanded
        ? (node.children ?? []).map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              openPath={openPath}
              dirtyPaths={dirtyPaths}
              onSelect={onSelect}
            />
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: font.minTapTarget,
    paddingRight: space.md,
    borderRadius: radius.sm,
  },
  rowOpen: { backgroundColor: colors.accentSoft },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  name: { color: colors.text, fontSize: font.size.md, flex: 1 },
  nameOpen: { color: colors.accent, fontWeight: '600' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning },
});
