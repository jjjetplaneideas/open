import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '../theme/theme';
import { Button, Icon, ScreenHeader } from '../components/ui';
import { useApp } from '../state/AppState';
import { StubAiService } from '../services/stubs';

const ai = new StubAiService();

export function DashboardScreen() {
  const { repo, branch, tree, dirtyPaths, pendingDiffs, navigate, switchBranch, branches } =
    useApp();
  const [summary, setSummary] = useState('');

  useEffect(() => {
    if (tree) ai.summarizeRepo(tree).then(setSummary);
  }, [tree]);

  if (!repo) return null;
  const pending = pendingDiffs.filter((d) => d.status === 'pending').length;

  return (
    <View style={styles.container}>
      <ScreenHeader title={repo.name} subtitle={repo.fullName} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <View style={styles.row}>
          <Stat label="Branch" value={branch} icon="branch" />
          <Stat label="Unsaved" value={String(dirtyPaths.length)} icon="editor" />
          <Stat label="Patches" value={String(pending)} icon="diff" />
        </View>

        <Card title="Repository overview">
          <Text style={styles.body}>{summary || 'Summarizing repository…'}</Text>
        </Card>

        <Card title="Branches">
          <View style={styles.branchRow}>
            {branches.map((b) => (
              <Button
                key={b}
                label={b}
                variant={b === branch ? 'primary' : 'ghost'}
                onPress={() => switchBranch(b)}
              />
            ))}
          </View>
        </Card>

        <Card title="Quick actions">
          <View style={styles.actions}>
            <Button label="Browse files" variant="ghost" onPress={() => navigate('explorer')} />
            <Button label="Ask the assistant" variant="ghost" onPress={() => navigate('assistant')} />
            <Button label="Run tests" variant="ghost" onPress={() => navigate('terminal')} />
            <Button label="Review changes" variant="ghost" onPress={() => navigate('diff')} />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} color={colors.accent} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', gap: space.md },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statValue: { color: colors.text, fontSize: font.size.xl, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: font.size.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardTitle: { color: colors.text, fontSize: font.size.md, fontWeight: '700' },
  body: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20 },
  branchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  actions: { gap: space.sm },
});
