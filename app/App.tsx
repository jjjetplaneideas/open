import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from './src/theme/theme';
import { AppProvider, useApp } from './src/state/AppState';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { RepoPickerScreen } from './src/screens/RepoPickerScreen';
import { AppShell } from './src/navigation/AppShell';

function Gate() {
  const { user, repo } = useApp();
  if (!user) return <WelcomeScreen />;
  if (!repo) return <RepoPickerScreen />;
  return <AppShell />;
}

export default function App() {
  return (
    <AppProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe}>
        <Gate />
      </SafeAreaView>
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
});
