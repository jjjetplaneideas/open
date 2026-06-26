/**
 * Responsive application shell.
 *
 * Phone  : header + single active screen + bottom navigation + FAB palette.
 * Tablet : header + three panes (file tree · active screen · assistant) with a
 *          segmented tab bar for the center pane — the iPad split view.
 */
import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { colors, font, radius, space, TABLET_BREAKPOINT } from '../theme/theme';
import { Icon } from '../components/ui';
import { FileTree } from '../components/FileTree';
import { CommandPalette, Command } from '../components/CommandPalette';
import { useApp, ScreenKey } from '../state/AppState';
import { BOTTOM_NAV, SCREENS, TABLET_TABS } from './registry';
import { AssistantScreen } from '../screens/AssistantScreen';

export function AppShell() {
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  const app = useApp();
  const commands = useCommands();

  return (
    <View style={styles.root}>
      <Header />
      {isTablet ? <TabletLayout /> : <PhoneLayout />}
      <Pressable
        style={styles.fab}
        onPress={() => app.setCommandPaletteOpen(true)}
        accessibilityLabel="Open command palette"
      >
        <Icon name="palette" color="#0B0D10" size={20} />
      </Pressable>
      <CommandPalette
        visible={app.commandPaletteOpen}
        commands={commands}
        onClose={() => app.setCommandPaletteOpen(false)}
      />
    </View>
  );
}

function Header() {
  const { repo, branch, navigate, signOut } = useApp();
  return (
    <View style={styles.header}>
      <Pressable onPress={() => navigate('dashboard')} style={styles.headerLeft}>
        <View style={styles.mark}>
          <Text style={styles.markText}>{'</>'}</Text>
        </View>
        <View>
          <Text style={styles.repoName} numberOfLines={1}>
            {repo?.name ?? 'Pocket IDE'}
          </Text>
          <View style={styles.branchRow}>
            <Icon name="branch" color={colors.textFaint} size={font.size.xs} />
            <Text style={styles.branch}>{branch}</Text>
          </View>
        </View>
      </Pressable>
      <View style={styles.headerActions}>
        <Pressable onPress={() => navigate('settings')} hitSlop={8} style={styles.iconBtn}>
          <Icon name="settings" color={colors.textMuted} />
        </Pressable>
        <Pressable onPress={signOut} hitSlop={8} style={styles.iconBtn}>
          <Icon name="close" color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

function PhoneLayout() {
  const { screen, navigate } = useApp();
  const Active = SCREENS[screen];
  return (
    <View style={styles.body}>
      <View style={styles.flex}>
        <Active />
      </View>
      <View style={styles.bottomNav}>
        {BOTTOM_NAV.map((item) => {
          const active = screen === item.key;
          return (
            <Pressable key={item.key} style={styles.navItem} onPress={() => navigate(item.key)}>
              <Icon name={item.icon} color={active ? colors.accent : colors.textFaint} />
              <Text style={[styles.navLabel, active && styles.navLabelOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TabletLayout() {
  const { screen, navigate, tree, openFilePath, dirtyPaths, selectFile } = useApp();
  // Tree and assistant are permanent side panes, so the center never shows them.
  const centerKey: ScreenKey =
    screen === 'explorer' || screen === 'assistant' ? 'editor' : screen;
  const Center = SCREENS[centerKey];

  return (
    <View style={styles.tablet}>
      <View style={styles.leftPane}>
        <Text style={styles.paneTitle}>Files</Text>
        <ScrollView>
          {tree ? (
            <FileTree node={tree} openPath={openFilePath} dirtyPaths={dirtyPaths} onSelect={selectFile} />
          ) : null}
        </ScrollView>
      </View>

      <View style={styles.centerPane}>
        <View style={styles.segment}>
          {TABLET_TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => navigate(t.key)}
              style={[styles.segItem, centerKey === t.key && styles.segItemOn]}
            >
              <Text style={[styles.segText, centerKey === t.key && styles.segTextOn]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.flex}>
          <Center />
        </View>
      </View>

      <View style={styles.rightPane}>
        <AssistantScreen />
      </View>
    </View>
  );
}

function useCommands(): Command[] {
  const app = useApp();
  return useMemo<Command[]>(
    () => [
      { id: 'go-files', title: 'Go to Files', hint: 'explorer', run: () => app.navigate('explorer') },
      { id: 'go-editor', title: 'Go to Editor', run: () => app.navigate('editor') },
      { id: 'go-ai', title: 'Open AI Assistant', run: () => app.navigate('assistant') },
      { id: 'go-diff', title: 'Review proposed changes', run: () => app.navigate('diff') },
      { id: 'go-run', title: 'Open Remote Runner', run: () => app.navigate('terminal') },
      { id: 'go-commit', title: 'Commit & Push', run: () => app.navigate('commit') },
      { id: 'go-settings', title: 'Open Settings', run: () => app.navigate('settings') },
      { id: 'run-tests', title: 'Run tests remotely', hint: 'npm test', run: () => { app.navigate('terminal'); app.runCommand('npm test'); } },
      { id: 'ai-summary', title: 'Ask AI to summarize the repo', run: () => { app.navigate('assistant'); app.sendToAssistant('Summarize the repo structure'); } },
    ],
    [app]
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  body: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1 },
  mark: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { color: colors.accent, fontFamily: font.mono, fontWeight: '700', fontSize: font.size.sm },
  repoName: { color: colors.text, fontSize: font.size.md, fontWeight: '700' },
  branchRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  branch: { color: colors.textFaint, fontSize: font.size.xs },
  headerActions: { flexDirection: 'row', gap: space.xs },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  bottomNav: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingBottom: space.sm,
  },
  navItem: { flex: 1, alignItems: 'center', paddingTop: space.sm, gap: 2 },
  navLabel: { color: colors.textFaint, fontSize: font.size.xs },
  navLabelOn: { color: colors.accent, fontWeight: '600' },

  tablet: { flex: 1, flexDirection: 'row' },
  leftPane: {
    width: 260,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    backgroundColor: colors.surface,
    paddingTop: space.sm,
  },
  paneTitle: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  centerPane: { flex: 1 },
  rightPane: {
    width: 360,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
    backgroundColor: colors.bg,
  },
  segment: {
    flexDirection: 'row',
    gap: space.xs,
    padding: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  segItem: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.sm },
  segItemOn: { backgroundColor: colors.accentSoft },
  segText: { color: colors.textMuted, fontSize: font.size.sm },
  segTextOn: { color: colors.accent, fontWeight: '600' },

  fab: {
    position: 'absolute',
    right: space.lg,
    bottom: 92,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
