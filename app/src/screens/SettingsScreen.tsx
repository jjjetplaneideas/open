import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { colors, font, radius, space } from '../theme/theme';
import { Button, ScreenHeader } from '../components/ui';
import { useApp } from '../state/AppState';

export function SettingsScreen() {
  const { user, signOut, repo } = useApp();
  const [lineNumbers, setLineNumbers] = useState(true);
  const [minimap, setMinimap] = useState(false);
  const [encryptCache, setEncryptCache] = useState(true);
  const [confirmRemote, setConfirmRemote] = useState(true);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Settings" subtitle={user ? user.login : undefined} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Group title="Account">
          <Row label="Signed in as" value={user?.name ?? '—'} />
          <Row label="Active repository" value={repo?.fullName ?? 'none'} />
        </Group>

        <Group title="Editor">
          <ToggleRow label="Show line numbers" value={lineNumbers} onChange={setLineNumbers} />
          <ToggleRow label="Minimap (tablet only)" value={minimap} onChange={setMinimap} />
        </Group>

        <Group title="Security & remote execution">
          <ToggleRow label="Encrypt local project cache" value={encryptCache} onChange={setEncryptCache} />
          <ToggleRow label="Confirm before each remote command" value={confirmRemote} onChange={setConfirmRemote} />
          <Text style={styles.note}>
            Builds and tests always run in an isolated cloud workspace. Source you
            open remains viewable and editable on device.
          </Text>
        </Group>

        <Group title="About">
          <Row label="App" value="Pocket IDE (prototype)" />
          <Row label="License" value="GPL-3.0-or-later" />
          <Text style={styles.note}>
            An original, clean-room mobile IDE. Not affiliated with, and not using
            the branding of, any third-party editor.
          </Text>
        </Group>

        <Button label="Sign out" variant="danger" onPress={signOut} />
      </ScrollView>
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.border }}
        thumbColor={colors.text}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  groupTitle: { color: colors.textMuted, fontSize: font.size.xs, fontWeight: '700', textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: font.minTapTarget, gap: space.md },
  rowLabel: { color: colors.text, fontSize: font.size.md, flex: 1 },
  rowValue: { color: colors.textMuted, fontSize: font.size.sm, maxWidth: '50%' },
  note: { color: colors.textFaint, fontSize: font.size.xs, lineHeight: 16, marginTop: space.xs },
});
