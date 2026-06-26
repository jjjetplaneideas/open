import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '../theme/theme';
import { Button } from '../components/ui';
import { useApp } from '../state/AppState';

export function WelcomeScreen() {
  const { signIn, signingIn } = useApp();
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.mark}>
          <Text style={styles.markText}>{'</>'}</Text>
        </View>
        <Text style={styles.title}>Pocket IDE</Text>
        <Text style={styles.tagline}>
          Code, review, and ship from your phone. AI-assisted. Touch-first.
        </Text>
      </View>

      <View style={styles.features}>
        <Feature text="Browse and edit any GitHub repo" />
        <Feature text="Ask AI for patches — you approve every change" />
        <Feature text="Run tests & builds in a secure cloud workspace" />
      </View>

      <View style={styles.footer}>
        <Button
          label={signingIn ? 'Connecting…' : 'Continue with GitHub'}
          onPress={signIn}
          busy={signingIn}
        />
        <Text style={styles.legal}>
          Source you open stays editable and viewable on device. Builds and tests
          run remotely in an isolated workspace.
        </Text>
      </View>
    </View>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <View style={styles.feature}>
      <View style={styles.bullet} />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: space.xl, justifyContent: 'space-between' },
  hero: { alignItems: 'center', marginTop: space.xxl, gap: space.md },
  mark: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  markText: { color: colors.accent, fontSize: font.size.xl, fontFamily: font.mono, fontWeight: '700' },
  title: { color: colors.text, fontSize: font.size.xxl, fontWeight: '800' },
  tagline: { color: colors.textMuted, fontSize: font.size.md, textAlign: 'center', lineHeight: 22 },
  features: { gap: space.md },
  feature: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  bullet: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent2 },
  featureText: { color: colors.text, fontSize: font.size.md, flex: 1 },
  footer: { gap: space.md },
  legal: { color: colors.textFaint, fontSize: font.size.xs, textAlign: 'center', lineHeight: 16 },
});
