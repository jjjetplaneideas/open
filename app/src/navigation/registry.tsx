import React from 'react';
import type { ScreenKey } from '../state/AppState';
import { DashboardScreen } from '../screens/DashboardScreen';
import { ExplorerScreen } from '../screens/ExplorerScreen';
import { EditorScreen } from '../screens/EditorScreen';
import { AssistantScreen } from '../screens/AssistantScreen';
import { DiffScreen } from '../screens/DiffScreen';
import { TerminalScreen } from '../screens/TerminalScreen';
import { CommitScreen } from '../screens/CommitScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

export const SCREENS: Record<ScreenKey, () => React.JSX.Element | null> = {
  dashboard: DashboardScreen,
  explorer: ExplorerScreen,
  editor: EditorScreen,
  assistant: AssistantScreen,
  diff: DiffScreen,
  terminal: TerminalScreen,
  commit: CommitScreen,
  settings: SettingsScreen,
};

export interface NavItem {
  key: ScreenKey;
  label: string;
  icon: string;
}

/** Primary destinations shown in the phone bottom bar. */
export const BOTTOM_NAV: NavItem[] = [
  { key: 'dashboard', label: 'Home', icon: 'explorer' },
  { key: 'explorer', label: 'Files', icon: 'folder' },
  { key: 'editor', label: 'Editor', icon: 'editor' },
  { key: 'assistant', label: 'AI', icon: 'ai' },
  { key: 'commit', label: 'Git', icon: 'commit' },
];

/** Center-pane destinations on tablet (tree + assistant are permanent panes). */
export const TABLET_TABS: NavItem[] = [
  { key: 'dashboard', label: 'Home', icon: 'explorer' },
  { key: 'editor', label: 'Editor', icon: 'editor' },
  { key: 'diff', label: 'Diff', icon: 'diff' },
  { key: 'terminal', label: 'Run', icon: 'terminal' },
  { key: 'commit', label: 'Commit', icon: 'commit' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];
