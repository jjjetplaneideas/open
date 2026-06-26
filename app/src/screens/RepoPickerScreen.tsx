import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, font, radius, space } from '../theme/theme';
import { Badge, Icon, ScreenHeader } from '../components/ui';
import { useApp } from '../state/AppState';
import type { Repo } from '../services/types';

export function RepoPickerScreen() {
  const { repos, openRepo, user, signOut } = useApp();
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState<string | null>(null);

  const filtered = useMemo(
    () => repos.filter((r) => r.fullName.toLowerCase().includes(query.toLowerCase().trim())),
    [repos, query]
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Repositories"
        subtitle={user ? `Signed in as ${user.login}` : undefined}
        right={
          <Pressable onPress={signOut} style={styles.signOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        }
      />
      <View style={styles.searchRow}>
        <Icon name="search" color={colors.textFaint} />
        <TextInput
          placeholder="Filter repositories"
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
          style={styles.search}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        renderItem={({ item }) => (
          <RepoCard
            repo={item}
            opening={opening === item.id}
            onPress={async () => {
              setOpening(item.id);
              await openRepo(item);
              setOpening(null);
            }}
          />
        )}
      />
    </View>
  );
}

function RepoCard({ repo, opening, onPress }: { repo: Repo; opening: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { borderColor: colors.accent }]}
    >
      <View style={styles.cardHead}>
        <Text style={styles.repoName}>{repo.fullName}</Text>
        {repo.private ? <Badge text="private" /> : <Badge text="public" tone="accent" />}
      </View>
      <Text style={styles.repoDesc} numberOfLines={2}>
        {repo.description}
      </Text>
      <View style={styles.cardFoot}>
        <View style={styles.langDot} />
        <Text style={styles.meta}>{repo.language}</Text>
        <Icon name="branch" color={colors.textFaint} size={font.size.sm} />
        <Text style={styles.meta}>{repo.defaultBranch}</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.meta}>{opening ? 'Opening…' : 'Open ›'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  signOut: { padding: space.sm },
  signOutText: { color: colors.textMuted, fontSize: font.size.sm },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    margin: space.lg,
    marginBottom: 0,
    paddingHorizontal: space.md,
    height: 44,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  search: { flex: 1, color: colors.text, fontSize: font.size.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  repoName: { color: colors.text, fontSize: font.size.md, fontWeight: '700', flex: 1 },
  repoDesc: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 18 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  langDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent2 },
  meta: { color: colors.textFaint, fontSize: font.size.xs },
});
