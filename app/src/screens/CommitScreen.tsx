import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, font, radius, space } from '../theme/theme';
import { Badge, Button, Icon, ScreenHeader } from '../components/ui';
import { useApp } from '../state/AppState';
import { StubAiService } from '../services/stubs';

const ai = new StubAiService();

export function CommitScreen() {
  const {
    gitStatus,
    refreshGit,
    stage,
    unstage,
    commitAndPush,
    branch,
    dirtyPaths,
    pendingDiffs,
  } = useApp();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refreshGit();
  }, [refreshGit]);

  const staged = gitStatus.filter((e) => e.staged);
  const unstaged = gitStatus.filter((e) => !e.staged);

  const generateMessage = async () => {
    const accepted = pendingDiffs.filter((d) => d.status === 'accepted');
    const msg = await ai.generateCommitMessage(
      accepted.length ? accepted : dirtyPaths.map((p) => ({
        id: p,
        path: p,
        before: '',
        after: '',
        summary: '',
        status: 'accepted' as const,
      }))
    );
    setMessage(msg);
  };

  const onCommit = async () => {
    if (!message.trim() || staged.length === 0) return;
    setBusy(true);
    try {
      await commitAndPush(message.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Commit & push" subtitle={`branch: ${branch}`} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Section title={`Staged (${staged.length})`}>
          {staged.length === 0 ? (
            <Text style={styles.dim}>Nothing staged yet.</Text>
          ) : (
            staged.map((e) => (
              <FileRow key={e.path} path={e.path} state={e.state} actionLabel="Unstage" onAction={() => unstage(e.path)} />
            ))
          )}
        </Section>

        <Section title={`Changes (${unstaged.length})`}>
          {unstaged.length === 0 ? (
            <Text style={styles.dim}>No unstaged changes.</Text>
          ) : (
            unstaged.map((e) => (
              <FileRow key={e.path} path={e.path} state={e.state} actionLabel="Stage" onAction={() => stage(e.path)} />
            ))
          )}
        </Section>

        <Section title="Commit message">
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Describe your change…"
            placeholderTextColor={colors.textFaint}
            style={styles.message}
            multiline
          />
          <Pressable style={styles.generate} onPress={generateMessage}>
            <Icon name="ai" color={colors.accent} />
            <Text style={styles.generateText}>Generate with AI</Text>
          </Pressable>
        </Section>

        <Button
          label={busy ? 'Pushing…' : `Commit ${staged.length} file(s) & push`}
          onPress={onCommit}
          busy={busy}
          disabled={!message.trim() || staged.length === 0}
        />
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function FileRow({
  path,
  state,
  actionLabel,
  onAction,
}: {
  path: string;
  state: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <View style={styles.fileRow}>
      <Badge text={state[0].toUpperCase()} tone={state === 'deleted' ? 'danger' : 'accent'} />
      <Text style={styles.filePath} numberOfLines={1}>
        {path}
      </Text>
      <Pressable onPress={onAction} hitSlop={8}>
        <Text style={styles.action}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sectionTitle: { color: colors.text, fontSize: font.size.sm, fontWeight: '700' },
  dim: { color: colors.textFaint, fontSize: font.size.sm },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 36 },
  filePath: { color: colors.text, fontFamily: font.mono, fontSize: font.size.sm, flex: 1 },
  action: { color: colors.accent, fontSize: font.size.sm, fontWeight: '600' },
  message: {
    color: colors.text,
    fontSize: font.size.md,
    minHeight: 80,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    padding: space.md,
    textAlignVertical: 'top',
  },
  generate: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start' },
  generateText: { color: colors.accent, fontSize: font.size.sm, fontWeight: '600' },
});
