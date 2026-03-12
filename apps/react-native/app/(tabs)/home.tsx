import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  IconMedicalCross,
  IconCirclePlus,
  IconChevronRight,
} from '@tabler/icons-react-native';
import { colors } from '../../constants/colors';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.screenTitle}>Home</Text>
        </View>

        <View style={styles.contentArea}>
          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <View style={styles.infoIconWrap}>
                <IconMedicalCross size={20} color={colors.brand.rose} strokeWidth={2} />
              </View>
              <View style={styles.infoHeadingWrap}>
                <Text style={styles.infoTitle}>Medical Records</Text>
                <Text style={styles.infoSubtitle}>Request Assistant</Text>
              </View>
            </View>

            <Text style={styles.infoBody}>
              Easily generate official medical records request forms. Search for your hospital, fill
              out your details, and get a ready-to-send PDF.
            </Text>
          </View>

          <View style={styles.hospitalLogoPlaceholder} />

          <Pressable
            onPress={() => {}}
            style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaButtonPressed]}
          >
            <IconCirclePlus size={22} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.ctaText}>New Records Request</Text>
            <IconChevronRight size={20} color="#FFFFFF" strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 48,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 12,
  },
  screenTitle: {
    color: '#111',
    fontSize: 28,
    fontWeight: '700',
  },
  contentArea: {
    flex: 1,
  },
  hospitalLogoPlaceholder: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#FF0000',
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(225, 29, 72, 0.22)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  infoHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 8,
  },
  infoIconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(225, 29, 72, 0.14)',
    borderRadius: 10,
    height: 34,
    justifyContent: 'center',
    marginRight: 12,
    width: 34,
  },
  infoHeadingWrap: {
    flex: 1,
  },
  infoTitle: {
    color: colors.base.ink,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  infoSubtitle: {
    color: colors.base.slate,
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 22,
  },
  infoBody: {
    color: colors.base.slate,
    fontSize: 16,
    lineHeight: 24,
    paddingRight: 6,
  },
  ctaButton: {
    alignItems: 'center',
    backgroundColor: '#E65941',
    borderRadius: 14,
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  ctaButtonPressed: {
    opacity: 0.9,
  },
  ctaText: {
    color: '#FFFFFF',
    flex: 1,
    fontSize: 19,
    fontWeight: '600',
    marginLeft: 10,
  },
});
