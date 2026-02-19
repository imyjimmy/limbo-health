import React, { useState } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Modal,
  Text,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  IconHome,
  IconHomeFilled,
  IconFile,
  IconFileFilled,
  IconPlus,
  IconSearch,
  IconNote,
  IconMicrophone,
  IconCamera,
} from '@tabler/icons-react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { ProfileAvatar } from './ProfileAvatar';

const ICON_SIZE = 24;
const PLUS_SIZE = 34;
const INACTIVE_COLOR = '#cecece';
const ACTIVE_COLOR = '#ffffff';

const CREATE_MENU_ITEMS = [
  { key: 'audio', label: 'Record Audio', Icon: IconMicrophone },
  { key: 'note', label: 'Add Note', Icon: IconNote },
  { key: 'photo', label: 'Take Photo', Icon: IconCamera },
] as const;

interface CustomTabBarProps extends BottomTabBarProps {
  profileImageUrl?: string | null;
  profileInitials?: string;
  hasNotification?: boolean;
  onCreateAction?: (action: 'note' | 'audio' | 'photo') => void;
  onDocumentPress?: () => void;
}

export function CustomTabBar({
  state,
  navigation,
  profileImageUrl = null,
  profileInitials = 'ME',
  hasNotification = false,
  onCreateAction,
  onDocumentPress,
}: CustomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [menuVisible, setMenuVisible] = useState(false);

  const handleCreatePress = (action: 'note' | 'audio' | 'photo') => {
    setMenuVisible(false);
    onCreateAction?.(action);
  };

  return (
    <>
      <View
        style={[
          styles.container
        ]}
      >
         
        <View style={styles.tabRow}>
          {state.routes.filter((r) =>
            ['(home)', 'page', 'create', 'search', 'profile'].includes(r.name)
          ).map((route) => {
            const index = state.routes.indexOf(route);
            const isActive = state.index === index;

            const onPress = () => {
              // Center "create" tab opens menu instead of navigating
              if (route.name === 'create') {
                setMenuVisible(true);
                return;
              }

              // Document tab jumps to last viewed directory
              if (route.name === 'page') {
                onDocumentPress?.();
                return;
              }

              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isActive && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            return (
              <View key={route.key} style={styles.tabColumn}>
                <Pressable
                  key={route.key}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  accessibilityRole="button"
                  accessibilityState={isActive ? { selected: true } : {}}
                  accessibilityLabel={route.name}
                  testID={`tab-${route.name}`}
                  style={styles.tabButton}
                >
                  {renderTabIcon(route.name, isActive, {
                    profileImageUrl,
                    profileInitials,
                    hasNotification,
                  })}
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>

      {/* Create menu modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuContainer}>
            {CREATE_MENU_ITEMS.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => handleCreatePress(item.key)}
                testID={`create-menu-${item.key}`}
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed && styles.menuItemPressed,
                ]}
              >
                <item.Icon
                  size={24}
                  color={ACTIVE_COLOR}
                  strokeWidth={1.5}
                />
                {/* <Text style={styles.menuItemLabel}>{item.label}</Text> */}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function renderTabIcon(
  routeName: string,
  isActive: boolean,
  profile: {
    profileImageUrl?: string | null;
    profileInitials: string;
    hasNotification: boolean;
  }
) {
  const color = isActive ? ACTIVE_COLOR : INACTIVE_COLOR;

  switch (routeName) {
    case '(home)':
      return isActive ? (
        <IconHomeFilled size={ICON_SIZE} color={color} />
      ) : (
        <IconHome size={ICON_SIZE} color={color} strokeWidth={2} />
      );

    case 'page':
      return isActive ? (
        <IconFileFilled size={ICON_SIZE} color={color} />
      ) : (
        <IconFile size={ICON_SIZE} color={color} strokeWidth={2} />
      );

    case 'create':
      return (
        <View style={styles.plusButton}>
          <IconPlus size={PLUS_SIZE} color={color} strokeWidth={isActive ? 2.5 : 2} />
        </View>
      );

    case 'search':
      return (
        <IconSearch size={ICON_SIZE} color={color} strokeWidth={2} />
      );

    case 'profile':
      return (
        <ProfileAvatar
          isActive={isActive}
          hasNotification={profile.hasNotification}
          imageUrl={profile.profileImageUrl}
          initials={profile.profileInitials}
        />
      );

    default:
      return null;
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f1923',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 4,
    paddingBottom: 12,
    // borderBottomWidth: 2,
    // borderBottomColor: 'red',
  },
  tabColumn: {
   flex: 1,
   alignItems: 'center',
  },
  tabRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
    // borderBottomWidth: 2,
    // borderBottomColor: 'yellow',
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    minHeight: 32,
    padding: 4,
  },
  plusButton: {
    borderColor: 'rgba(190, 190, 190, 0.8)',
    borderWidth: 2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    paddingBottom: 100,
    paddingHorizontal: 80,
  },
  menuContainer: {
    backgroundColor: '#1a2733',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
  },
  menuItem: {
    flex: 1,
    alignItems: 'center',
    // justifyContent: 'center',
    // gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  menuItemPressed: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  menuItemLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
});