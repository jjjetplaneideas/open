import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, space } from '../theme/theme';
import { Badge, ScreenHeader } from '../components/ui';
import { FileTree } from '../components/FileTree';
import { useApp } from '../state/AppState';

export function ExplorerScreen() {
  const { tree, openFilePath, dirtyPaths, selectFile, branch } = useApp();

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Files"
        subtitle={branch}
        right={dirtyPaths.length ? <Badge text={`${dirtyPaths.length} unsaved`} tone="accent" /> : undefined}
      />
      {tree ? (
        <ScrollView contentContainerStyle={{ padding: space.sm }}>
          <FileTree
            node={tree}
            openPath={openFilePath}
            dirtyPaths={dirtyPaths}
            onSelect={selectFile}
          />
        </ScrollView>
      ) : (
        <Text style={styles.empty}>Loading file tree…</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  empty: { color: colors.textFaint, padding: space.xl, fontSize: font.size.sm },
});
