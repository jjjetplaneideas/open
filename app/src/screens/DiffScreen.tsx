import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, space } from '../theme/theme';
import { Button, Icon, ScreenHeader } from '../components/ui';
import { DiffView } from '../components/DiffView';
import { useApp } from '../state/AppState';

export function DiffScreen() {
  const { pendingDiffs, resolveDiff, navigate } = useApp();
  const pending = pendingDiffs.filter((d) => d.status === 'pending');
  const resolved = pendingDiffs.filter((d) => d.status !== 'pending');

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Review changes"
        subtitle={`${pending.length} pending · ${resolved.length} resolved`}
      />
      {pendingDiffs.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="diff" size={32} color={colors.textFaint} />
          <Text style={styles.emptyText}>
            No proposed changes yet. Ask the assistant for an edit and its patches
            will appear here for review.
          </Text>
          <Button label="Open assistant" variant="ghost" onPress={() => navigate('assistant')} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
          {pending.length > 1 ? (
            <View style={styles.bulk}>
              <Button
                label={`Accept all (${pending.length})`}
                onPress={() => pending.forEach((d) => resolveDiff(d.id, 'accepted'))}
                style={{ flex: 1 }}
              />
              <Button
                label="Reject all"
                variant="ghost"
                onPress={() => pending.forEach((d) => resolveDiff(d.id, 'rejected'))}
                style={{ flex: 1 }}
              />
            </View>
          ) : null}

          {pendingDiffs.map((hunk) => (
            <DiffView
              key={hunk.id}
              hunk={hunk}
              onAccept={() => resolveDiff(hunk.id, 'accepted')}
              onReject={() => resolveDiff(hunk.id, 'rejected')}
            />
          ))}

          {resolved.some((d) => d.status === 'accepted') ? (
            <Button label="Go to commit →" onPress={() => navigate('commit')} />
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  emptyText: { color: colors.textMuted, fontSize: font.size.sm, textAlign: 'center', lineHeight: 20 },
  bulk: { flexDirection: 'row', gap: space.sm },
});
