import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { IconClipboardHeart } from '@tabler/icons-react-native';
import { createThemedStyles, useTheme, useThemedStyles } from '../../theme';

export default function PendingRequestsScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.screenTitle}>Pending Requests</Text>
          <Text style={styles.screenSubtitle}>
            Track the records requests you have started. They will stay here until you finish
            them.
          </Text>
        </View>

        <View style={styles.emptyStateWrap}>
          <View style={styles.emptyStateCard}>
            <View style={styles.iconShell}>
              <IconClipboardHeart size={28} color={theme.colors.secondary} strokeWidth={1.8} />
            </View>
            <Text style={styles.emptyTitle}>No Pending Requests</Text>
            <Text style={styles.emptyBody}>
              Start a records request from Home and it will appear here.
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const createStyles = createThemedStyles((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 20,
  },
  headerRow: {
    paddingTop: 40,
    paddingBottom: 20,
  },
  screenTitle: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  screenSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 320,
  },
  emptyStateWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 72,
  },
  emptyStateCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  iconShell: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    height: 56,
    justifyContent: 'center',
    marginBottom: 16,
    width: 56,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyBody: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    marginTop: 10,
    opacity: 0.9,
    textAlign: 'center',
  },
}));
