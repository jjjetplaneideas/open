import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, font, radius, space } from '../theme/theme';
import { Icon, ScreenHeader } from '../components/ui';
import { useApp } from '../state/AppState';
import type { ChatMessage } from '../services/types';

const SUGGESTIONS = [
  'Explain the open file',
  'Summarize the repo structure',
  'Add input validation to the router',
  'Write a commit message for my changes',
];

export function AssistantScreen() {
  const { messages, sendToAssistant, assistantBusy, openFilePath, navigate, pendingDiffs } =
    useApp();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || assistantBusy) return;
    setDraft('');
    sendToAssistant(t);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const pending = pendingDiffs.filter((d) => d.status === 'pending').length;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        title="Assistant"
        subtitle={openFilePath ? `Context: ${openFilePath}` : 'Whole-repo context'}
        right={
          pending ? (
            <Pressable style={styles.diffPill} onPress={() => navigate('diff')}>
              <Icon name="diff" color={colors.accent} />
              <Text style={styles.diffPillText}>{pending} to review</Text>
            </Pressable>
          ) : undefined
        }
      />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.thread}>
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              Ask for changes, explanations, or a repo summary. The assistant
              proposes patches — you review and accept them.
            </Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} style={styles.chip} onPress={() => send(s)}>
                  <Text style={styles.chipText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} onReview={() => navigate('diff')} />)
        )}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask the assistant…"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          multiline
          onSubmitEditing={() => send(draft)}
        />
        <Pressable
          style={[styles.sendBtn, (!draft.trim() || assistantBusy) && styles.sendDisabled]}
          onPress={() => send(draft)}
          disabled={!draft.trim() || assistantBusy}
        >
          <Icon name="push" color="#0B0D10" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, onReview }: { message: ChatMessage; onReview: () => void }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        <Text style={[styles.bubbleText, isUser && styles.userText]}>
          {message.text || (message.pending ? '…' : '')}
        </Text>
        {message.proposedDiffs?.length ? (
          <Pressable style={styles.reviewBtn} onPress={onReview}>
            <Icon name="diff" color={colors.accent} />
            <Text style={styles.reviewText}>
              Review {message.proposedDiffs.length} proposed change(s)
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  thread: { padding: space.lg, gap: space.md },
  empty: { gap: space.lg },
  emptyText: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20 },
  suggestions: { gap: space.sm },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipText: { color: colors.text, fontSize: font.size.sm },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '88%', borderRadius: radius.md, padding: space.md },
  aiBubble: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  userBubble: { backgroundColor: colors.accentSoft },
  bubbleText: { color: colors.text, fontSize: font.size.md, lineHeight: 21 },
  userText: { color: colors.text },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  reviewText: { color: colors.accent, fontSize: font.size.sm, fontWeight: '600' },
  diffPill: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: space.sm },
  diffPillText: { color: colors.accent, fontSize: font.size.sm },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: font.size.md,
    maxHeight: 120,
    minHeight: font.minTapTarget,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  sendBtn: {
    width: font.minTapTarget,
    height: font.minTapTarget,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
