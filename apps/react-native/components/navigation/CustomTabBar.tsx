import React, { useState } from 'react';
import { View, Pressable, StyleSheet, Modal, Text } from 'react-native';
import {
  IconBook2,
  IconBook,
  IconBookFilled,
  IconHome,
  IconHomeFilled,
  IconPlus,
  IconContract,
  IconId,
  IconMicrophone,
  IconCamera,
  IconLogs,
} from '@tabler/icons-react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { ProfileAvatar } from './ProfileAvatar';
import { createThemedStyles, useTheme, useThemedStyles } from '../../theme';

const ICON_SIZE = 24;
const PLUS_SIZE = 34;

type CreateAction = 'note' | 'audio' | 'photo' | 'medication';
type ContextualCreateIconKey = 'medication' | 'bio' | 'note';
type TabKind = 'home' | 'binders' | 'create' | 'page' | 'profile';

const CREATE_MENU_ITEMS = [
  { key: 'audio', label: 'Record Audio', Icon: IconMicrophone },
  { key: 'note', label: 'Add Note', Icon: IconContract },
  { key: 'photo', label: 'Take Photo', Icon: IconCamera },
] as const;

function getTabKind(routeName: string): TabKind | null {
  if (routeName === 'home') return 'home';
  if (routeName === 'create') return 'create';
  if (routeName === 'page') return 'page';
  if (routeName === 'profile') return 'profile';
  if (
    routeName === '(binders)' ||
    routeName === '(binders)/index' ||
    routeName === '(home)' ||
    routeName === '(home)/index'
  ) {
    return 'binders';
  }
  return null;
}

interface CustomTabBarProps extends BottomTabBarProps {
  profileImageUrl?: string | null;
  profileInitials?: string;
  hasNotification?: boolean;
  onCreateAction?: (action: CreateAction) => void;
  contextualCreateAction?: {
    action: CreateAction;
    label: string;
    icon?: ContextualCreateIconKey;
  } | null;
  onDocumentPress?: () => void;
}

export function CustomTabBar({
  state,
  navigation,
  profileImageUrl = null,
  profileInitials = 'ME',
  hasNotification = false,
  onCreateAction,
  contextualCreateAction = null,
  onDocumentPress,
}: CustomTabBarProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [menuVisible, setMenuVisible] = useState(false);
  const orderedTabKinds: TabKind[] = ['home', 'binders', 'create', 'page', 'profile'];
  const visibleRoutes = orderedTabKinds
    .map((kind) => state.routes.find((route) => getTabKind(route.name) === kind))
    .filter((route): route is (typeof state.routes)[number] => Boolean(route));

  const handleCreatePress = (action: CreateAction) => {
    setMenuVisible(false);
    onCreateAction?.(action);
  };

  return (
    <>
      <View style={styles.container}>
        <View style={styles.tabRow}>
          {visibleRoutes.map((route) => {
            const index = state.routes.indexOf(route);
            const isActive = state.index === index;
            const tabKind = getTabKind(route.name);
            if (!tabKind) return null;

            const onPress = () => {
              if (tabKind === 'create') {
                setMenuVisible(true);
                return;
              }

              if (tabKind === 'page') {
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
                  accessibilityLabel={tabKind}
                  testID={`tab-${tabKind}`}
                  style={styles.tabButton}
                >
                  {renderTabIcon(
                    tabKind,
                    isActive,
                    {
                      profileImageUrl,
                      profileInitials,
                      hasNotification,
                    },
                    theme.colors.tabIconActive,
                    theme.colors.tabIconInactive,
                    styles,
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuContainer}>
            {contextualCreateAction && (
              <Pressable
                onPress={() => handleCreatePress(contextualCreateAction.action)}
                testID={`create-menu-${contextualCreateAction.action}`}
                style={({ pressed }) => [
                  styles.contextualMenuItem,
                  pressed && styles.menuItemPressed,
                ]}
              >
                <ContextualCreateIcon
                  action={contextualCreateAction.action}
                  icon={contextualCreateAction.icon}
                  color={theme.colors.tabIconActive}
                />
                <Text style={styles.contextualMenuItemLabel}>
                  {contextualCreateAction.label}
                </Text>
              </Pressable>
            )}
            <View style={styles.menuRow}>
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
                    color={theme.colors.tabIconActive}
                    strokeWidth={1.5}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function renderTabIcon(
  tabKind: TabKind,
  isActive: boolean,
  profile: {
    profileImageUrl?: string | null;
    profileInitials: string;
    hasNotification: boolean;
  },
  activeColor: string,
  inactiveColor: string,
  styles: ReturnType<typeof createStyles>,
) {
  const color = isActive ? activeColor : inactiveColor;

  switch (tabKind) {
    case 'home':
      return isActive ? (
        <IconHomeFilled size={ICON_SIZE} color={color} />
      ) : (
        <IconHome size={ICON_SIZE} color={color} strokeWidth={2} />
      );

    case 'binders':
      return <IconBook2 size={ICON_SIZE} color={color} strokeWidth={2} />;

    case 'page':
      return isActive ? (
        <IconBookFilled size={ICON_SIZE} color={color} />
      ) : (
        <IconBook size={ICON_SIZE} color={color} strokeWidth={2} />
      );

    case 'create':
      return (
        <View style={styles.plusButton}>
          <IconPlus size={PLUS_SIZE} color={color} strokeWidth={isActive ? 2.5 : 2} />
        </View>
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

function ContextualCreateIcon({
  action,
  icon,
  color,
}: {
  action: CreateAction;
  icon?: ContextualCreateIconKey;
  color: string;
}) {
  const resolvedIcon = icon ?? action;

  switch (resolvedIcon) {
    case 'medication':
      return <IconLogs size={22} color={color} strokeWidth={1.5} />;
    case 'bio':
      return <IconId size={22} color={color} strokeWidth={1.5} />;
    case 'note':
      return <IconContract size={22} color={color} strokeWidth={1.5} />;
    default:
      return <IconPlus size={22} color={color} strokeWidth={1.5} />;
  }
}

const createStyles = createThemedStyles((theme) => ({
  container: {
    backgroundColor: theme.colors.tabBarBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.tabBarBorder,
    paddingTop: 4,
    paddingBottom: 18,
  },
  tabColumn: {
    flex: 1,
    alignItems: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    minHeight: 32,
    padding: 4,
  },
  plusButton: {
    borderColor: theme.colors.tabIconInactive,
    borderWidth: 2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlayStrong,
    justifyContent: 'flex-end',
    paddingBottom: 100,
    paddingHorizontal: 80,
  },
  menuContainer: {
    backgroundColor: theme.colors.surfaceInverse,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.tabBarBorder,
  },
  menuRow: {
    flexDirection: 'row',
  },
  menuItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  menuItemPressed: {
    backgroundColor: theme.colors.overlayMuted,
  },
  menuItemLabel: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '500',
  },
  contextualMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.tabBarBorder,
  },
  contextualMenuItemLabel: {
    color: theme.colors.textInverse,
    fontSize: 14,
    fontWeight: '600',
  },
}));
