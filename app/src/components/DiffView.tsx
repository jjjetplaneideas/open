/** Renders a single proposed patch with accept / reject controls. */
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '../theme/theme';
import type { DiffHunk } from '../services/types';
import { lineDiff } from '../editor/diff';
import { Badge, Button } from './ui';

export function DiffView({
  hunk,
  onAccept,
  onReject,
}: {
  hunk: DiffHunk;
  onAccept: () => void;
  onReject: () => void;
}) {
  const lines = useMemo(() => lineDiff(hunk.before, hunk.after), [hunk.before, hunk.after]);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.path} numberOfLines={1}>
          {hunk.path}
        </Text>
        {hunk.status === 'accepted' ? <Badge text="accepted" tone="success" /> : null}
        {hunk.status === 'rejected' ? <Badge text="rejected" tone="danger" /> : null}
        {hunk.status === 'pending' ? <Badge text="pending" tone="accent" /> : null}
      </View>
      <Text style={styles.summary}>{hunk.summary}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {lines.map((line, idx) => (
            <View
              key={idx}
              style={[
                styles.line,
                line.type === 'add' && styles.add,
                line.type === 'del' && styles.del,
              ]}
            >
              <Text style={styles.sign}>
                {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
              </Text>
              <Text
                style={[
                  styles.code,
                  line.type === 'add' && { color: colors.diffAddText },
                  line.type === 'del' && { color: colors.diffDelText },
                ]}
              >
                {line.text || ' '}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {hunk.status === 'pending' ? (
        <View style={styles.actions}>
          <Button label="Reject" variant="ghost" onPress={onReject} style={{ flex: 1 }} />
          <Button label="Accept" onPress={onAccept} style={{ flex: 1 }} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  path: { color: colors.text, fontWeight: '700', fontSize: font.size.md, flex: 1 },
  summary: { color: colors.textMuted, fontSize: font.size.sm },
  line: { flexDirection: 'row', alignItems: 'flex-start' },
  add: { backgroundColor: colors.diffAddBg },
  del: { backgroundColor: colors.diffDelBg },
  sign: {
    width: 16,
    color: colors.textFaint,
    fontFamily: font.mono,
    fontSize: font.size.sm,
  },
  code: { color: colors.text, fontFamily: font.mono, fontSize: font.size.sm },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
});
