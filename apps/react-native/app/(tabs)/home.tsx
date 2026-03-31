import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  IconCirclePlus,
  IconCheck,
  IconChevronRight,
} from '@tabler/icons-react-native';
import { createThemedStyles, useTheme, useThemedStyles } from '../../theme';
import { TexasHospitalLogoMarquee } from '../../components/records/TexasHospitalLogoMarquee';
const INFO_PILLS = ['Find hospital systems', 'Re-Use Your Bio', 'Send Official Forms'];
const APP_ICON = require('../../assets/icon.png');

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.screenTitle}>Request Your Records</Text>
        </View>

        <View style={styles.contentArea}>
          <View style={styles.topSection}>
            <View style={styles.infoCard}>
              <View style={styles.infoIconShell}>
                <Image source={APP_ICON} style={styles.infoIcon} resizeMode="cover" />
              </View>
              <View style={styles.infoPillRow}>
                {INFO_PILLS.map((pill) => (
                  <View key={pill} style={styles.infoPill}>
                    <IconCheck size={14} color={theme.colors.secondary} strokeWidth={2.4} />
                    <Text style={styles.infoPillText}>{pill}</Text>
                  </View>
                ))}
              </View>
            </View>

            <TexasHospitalLogoMarquee style={styles.hospitalLogoPanel} />

            <View style={styles.pendingSection}>
              <Text style={styles.pendingSectionTitle}>Pending Requests</Text>
              <View style={styles.pendingEmptyState}>
                <Text style={styles.pendingEmptyText}>No Pending Requests</Text>
              </View>
            </View>
          </View>

          <View style={styles.bottomSection}>
            <Pressable
              onPress={() => router.push('/records-request')}
              style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaButtonPressed]}
            >
              <IconCirclePlus size={22} color={theme.colors.primaryForeground} strokeWidth={2} />
              <Text style={styles.ctaText}>Start Records Request</Text>
              <IconChevronRight size={20} color={theme.colors.primaryForeground} strokeWidth={2} />
            </Pressable>

            {/* <Text style={styles.supportNote}>
              Coverage will expand to all 50 States.
            </Text> */}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 12,
  },
  screenTitle: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  contentArea: {
    flex: 1,
  },
  topSection: {
    flex: 1,
    gap: 0,
  },
  bottomSection: {
    marginTop: 'auto',
    paddingTop: 20,
  },
  hospitalLogoPanel: {
    marginBottom: 16,
  },
  infoCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.dangerSoft,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  infoIconShell: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    height: 74,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 74,
  },
  infoIcon: {
    height: 74,
    width: 74,
  },
  infoPillRow: {
    flex: 1,
    gap: 6,
    paddingLeft: 4,
  },
  infoPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  infoPillText: {
    color: theme.colors.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  pendingSection: {
    flex: 1,
    marginTop: 2,
  },
  pendingEmptyState: {
    flex: 1,
    justifyContent: 'center',
  },
  pendingSectionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  pendingEmptyText: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
    opacity: 0.9,
    textAlign: 'center',
  },
  ctaButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  ctaButtonPressed: {
    opacity: 0.9,
  },
  ctaText: {
    color: theme.colors.primaryForeground,
    flex: 1,
    fontSize: 19,
    fontWeight: '600',
    marginLeft: 10,
  },
  supportNote: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    paddingHorizontal: 4,
  },
}));
