import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '../theme/theme';
import { Badge, ScreenHeader } from '../components/ui';
import { useApp } from '../state/AppState';

// Only explicit, user-approved commands run remotely. No hidden background work.
const APPROVED_COMMANDS = ['npm test', 'npm run build', 'npm run lint'];

export function TerminalScreen() {
  const { runs, runCommand, runnerBusy, repo, branch } = useApp();
  const scrollRef = useRef<ScrollView>(null);
  const [selected, setSelected] = useState(APPROVED_COMMANDS[0]);

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Remote runner"
        subtitle={repo ? `${repo.name} · ${branch} · isolated workspace` : undefined}
        right={<Badge text={runnerBusy ? 'running' : 'idle'} tone={runnerBusy ? 'accent' : 'neutral'} />}
      />

      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Commands run in a secure cloud workspace — never on your device. Only
          the approved commands below can be launched, and nothing runs in the
          background.
        </Text>
      </View>

      <View style={styles.commandBar}>
        {APPROVED_COMMANDS.map((c) => (
          <Pressable
            key={c}
            onPress={() => setSelected(c)}
            style={[styles.cmdChip, selected === c && styles.cmdChipOn]}
          >
            <Text style={[styles.cmdText, selected === c && styles.cmdTextOn]}>{c}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.runBtn, runnerBusy && styles.runDisabled]}
          disabled={runnerBusy}
          onPress={() => {
            runCommand(selected);
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
          }}
        >
          <Text style={styles.runText}>{runnerBusy ? 'Running…' : 'Run ▷'}</Text>
        </Pressable>
      </View>

      <ScrollView ref={scrollRef} style={styles.console} contentContainerStyle={{ padding: space.md }}>
        {runs.length === 0 ? (
          <Text style={styles.dim}>No commands run yet. Pick one above and tap Run.</Text>
        ) : (
          runs.map((run) => (
            <View key={run.id} style={styles.run}>
              <View style={styles.runHead}>
                <Text style={styles.runCmd}>{run.command}</Text>
                <Badge
                  text={run.status}
                  tone={run.status === 'passed' ? 'success' : run.status === 'failed' ? 'danger' : 'accent'}
                />
              </View>
              {run.log.map((line, i) => (
                <Text key={i} style={styles.logLine}>
                  {line}
                </Text>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  notice: { padding: space.md, backgroundColor: colors.accentSoft, margin: space.md, borderRadius: radius.md },
  noticeText: { color: colors.text, fontSize: font.size.xs, lineHeight: 17 },
  commandBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  cmdChip: {
    paddingHorizontal: space.md,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cmdChipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  cmdText: { color: colors.textMuted, fontFamily: font.mono, fontSize: font.size.sm },
  cmdTextOn: { color: colors.accent },
  runBtn: {
    paddingHorizontal: space.lg,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runDisabled: { opacity: 0.5 },
  runText: { color: '#0B0D10', fontWeight: '700' },
  console: { flex: 1, backgroundColor: colors.bg, margin: space.md, marginTop: 0, borderRadius: radius.md },
  dim: { color: colors.textFaint, fontFamily: font.mono, fontSize: font.size.sm },
  run: { marginBottom: space.lg, gap: 2 },
  runHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  runCmd: { color: colors.text, fontFamily: font.mono, fontSize: font.size.sm, fontWeight: '700' },
  logLine: { color: colors.textMuted, fontFamily: font.mono, fontSize: font.size.sm, lineHeight: 18 },
});
