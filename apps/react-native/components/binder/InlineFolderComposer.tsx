import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View as NativeView,
  View,
} from 'react-native';
import { IconCheck } from '@tabler/icons-react-native';
import {
  ALLOWED_FOLDER_COLORS,
  DEFAULT_FOLDER_COLOR,
  FOLDER_EMOJI_OPTIONS,
} from './folderAppearance';

interface InlineFolderComposerProps {
  initialEmoji?: string;
  initialColor?: string;
  saving?: boolean;
  onSave: (name: string, emoji: string, color: string) => Promise<void> | void;
}

const COLOR_CHIP_SIZE = 26;
const POPUP_HORIZONTAL_PADDING = 24;
const COLOR_GRID_GAP = 8;

interface ParsedColor {
  color: string;
  hue: number;
  saturation: number;
  lightness: number;
}

function hexToHsl(hexColor: string): { hue: number; saturation: number; lightness: number } {
  const raw = hexColor.replace('#', '');
  const value = Number.parseInt(raw, 16);
  const red = ((value >> 16) & 0xff) / 255;
  const green = ((value >> 8) & 0xff) / 255;
  const blue = (value & 0xff) / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs((2 * lightness) - 1));

  return { hue, saturation, lightness };
}

function orderColorsByHue(colors: string[]): string[] {
  const parsed: ParsedColor[] = colors.map((color) => {
    const { hue, saturation, lightness } = hexToHsl(color);
    return { color, hue, saturation, lightness };
  });

  // Hue-first ordering, then richer colors before muted, then darker->lighter.
  parsed.sort((a, b) => (
    a.hue - b.hue
    || b.saturation - a.saturation
    || a.lightness - b.lightness
  ));

  return parsed.map((item) => item.color);
}

function pickColorGridColumns(totalColors: number, maxColumns: number, minColumns: number): number {
  if (totalColors <= 0) return minColumns;
  for (let columns = maxColumns; columns >= minColumns; columns -= 1) {
    if (totalColors % columns !== 1) return columns;
  }
  return Math.max(minColumns, maxColumns);
}

function chunkColors(colors: string[], columns: number): string[][] {
  if (columns <= 0) return [colors];
  const rows: string[][] = [];
  for (let index = 0; index < colors.length; index += columns) {
    rows.push(colors.slice(index, index + columns));
  }
  return rows;
}

export function InlineFolderComposer({
  initialEmoji = '📁',
  initialColor = DEFAULT_FOLDER_COLOR,
  saving = false,
  onSave,
}: InlineFolderComposerProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(initialEmoji);
  const [color, setColor] = useState(initialColor);
  const [activePicker, setActivePicker] = useState<'icon' | 'color' | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const iconButtonRef = useRef<NativeView | null>(null);
  const colorButtonRef = useRef<NativeView | null>(null);

  const colorOptions = useMemo(
    () => (ALLOWED_FOLDER_COLORS.includes(initialColor) ? ALLOWED_FOLDER_COLORS : [initialColor, ...ALLOWED_FOLDER_COLORS]),
    [initialColor],
  );

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && !saving;

  const closePickers = () => setActivePicker(null);

  const openPickerFromRef = (
    picker: 'icon' | 'color',
    ref: React.RefObject<NativeView | null>,
  ) => {
    if (saving) return;
    if (activePicker === picker) {
      setActivePicker(null);
      return;
    }
    const node = ref.current;
    if (!node) {
      setActivePicker(picker);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setPickerAnchor({ x, y, width, height });
      setActivePicker(picker);
    });
  };

  const toggleIconPicker = () => openPickerFromRef('icon', iconButtonRef);
  const toggleColorPicker = () => openPickerFromRef('color', colorButtonRef);

  const handleSave = async () => {
    if (!canSave) return;
    closePickers();
    await onSave(trimmed, emoji, color);
  };

  const POPUP_MARGIN = 12;
  const POPUP_GAP = 10;
  const iconPopupWidth = Math.min(318, Math.max(236, screenWidth - POPUP_MARGIN * 2));
  const maxColorPopupWidth = Math.min(292, Math.max(236, screenWidth - POPUP_MARGIN * 2));
  const orderedColorOptions = useMemo(
    () => orderColorsByHue(colorOptions),
    [colorOptions],
  );
  const maxColorGridColumns = Math.max(
    6,
    Math.floor((maxColorPopupWidth - POPUP_HORIZONTAL_PADDING + COLOR_GRID_GAP) / (COLOR_CHIP_SIZE + COLOR_GRID_GAP)),
  );
  const colorGridColumns = pickColorGridColumns(
    orderedColorOptions.length,
    maxColorGridColumns,
    5,
  );
  const colorGridContentWidth = (colorGridColumns * COLOR_CHIP_SIZE)
    + (Math.max(0, colorGridColumns - 1) * COLOR_GRID_GAP);
  const colorPopupWidth = Math.min(
    maxColorPopupWidth,
    Math.max(236, colorGridContentWidth + POPUP_HORIZONTAL_PADDING),
  );
  const colorGridRows = useMemo(
    () => chunkColors(orderedColorOptions, colorGridColumns),
    [orderedColorOptions, colorGridColumns],
  );
  const iconGridColumns = Math.max(
    4,
    Math.floor((iconPopupWidth - POPUP_HORIZONTAL_PADDING + 8) / 42),
  );
  const iconGridRows = Math.ceil(FOLDER_EMOJI_OPTIONS.length / iconGridColumns);

  const isColorPicker = activePicker === 'color';
  const popupWidth = isColorPicker ? colorPopupWidth : iconPopupWidth;
  const estimatedPopupHeight = isColorPicker
    ? (
      56
      + (colorGridRows.length * COLOR_CHIP_SIZE)
      + (Math.max(0, colorGridRows.length - 1) * COLOR_GRID_GAP)
      + 10
    )
    : (iconGridRows * 34) + (Math.max(0, iconGridRows - 1) * 8) + 56;
  const anchorRight = pickerAnchor.x + pickerAnchor.width;
  const preferredLeft = anchorRight - popupWidth;
  const popupLeft = Math.min(
    Math.max(POPUP_MARGIN, preferredLeft),
    screenWidth - popupWidth - POPUP_MARGIN,
  );
  const preferredTop = pickerAnchor.y - estimatedPopupHeight - POPUP_GAP;
  const fallbackTop = pickerAnchor.y + pickerAnchor.height + POPUP_GAP;
  const popupTop = preferredTop > POPUP_MARGIN
    ? preferredTop
    : Math.min(
        Math.max(POPUP_MARGIN, fallbackTop),
        screenHeight - estimatedPopupHeight - POPUP_MARGIN,
      );

  return (
    <View style={styles.wrap} testID="inline-folder-composer">
      <View style={styles.row}>
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          placeholder="Folder name"
          placeholderTextColor="#8D95A3"
          editable={!saving}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="done"
        />
        <Pressable
          ref={iconButtonRef}
          style={[styles.emojiButton, activePicker === 'icon' && styles.pickerButtonActive]}
          onPress={toggleIconPicker}
          disabled={saving}
        >
          <Text style={styles.emojiText}>{emoji}</Text>
        </Pressable>
        <Pressable
          ref={colorButtonRef}
          style={[
            styles.colorButton,
            { backgroundColor: color },
            activePicker === 'color' && styles.colorButtonActive,
          ]}
          onPress={toggleColorPicker}
          disabled={saving}
        />
        <Pressable
          style={[styles.actionButton, styles.saveButton, !canSave && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!canSave}
          testID="inline-folder-save"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <IconCheck size={18} strokeWidth={2.6} color="#fff" />
          )}
        </Pressable>
      </View>

      <Modal
        visible={activePicker !== null}
        transparent
        animationType="fade"
        onRequestClose={closePickers}
      >
        <Pressable style={styles.modalScrim} onPress={closePickers} />
        {activePicker === 'icon' && (
          <View style={[styles.popupCard, styles.iconPopup, { top: popupTop, left: popupLeft, width: popupWidth }]}>
            <Text style={styles.popupTitle}>Pick an icon</Text>
            <View style={styles.popupIconGrid}>
              {FOLDER_EMOJI_OPTIONS.map((option, index) => (
                <Pressable
                  key={`${option}-${index}`}
                  style={[
                    styles.popupEmojiChip,
                    styles.popupEmojiGridChip,
                    emoji === option && styles.popupEmojiChipSelected,
                  ]}
                  onPress={() => {
                    setEmoji(option);
                    closePickers();
                  }}
                >
                  <Text style={styles.popupEmojiText}>{option}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {activePicker === 'color' && (
          <View style={[styles.popupCard, styles.colorPopup, { top: popupTop, left: popupLeft, width: popupWidth }]}>
            <Text style={styles.popupTitle}>Pick a tab color</Text>
            <View style={styles.popupColorGrid}>
              {colorGridRows.map((row, rowIndex) => (
                <View key={`color-row-${rowIndex}`} style={styles.popupColorRow}>
                  {row.map((option, colIndex) => (
                    <Pressable
                      key={`${option}-${rowIndex}-${colIndex}`}
                      style={[
                        styles.popupColorChip,
                        { backgroundColor: option },
                        color === option && styles.popupColorChipSelected,
                      ]}
                      onPress={() => {
                        setColor(option);
                        closePickers();
                      }}
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
  },
  nameInput: {
    flex: 1,
    minWidth: 84,
    height: 38,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(42, 56, 78, 0.2)',
    backgroundColor: 'rgba(243, 246, 250, 0.92)',
    paddingHorizontal: 11,
    color: '#1F2D3D',
    fontSize: 16,
  },
  emojiButton: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(42, 56, 78, 0.2)',
    backgroundColor: 'rgba(243, 246, 250, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerButtonActive: {
    borderColor: '#0F6FDB',
    borderWidth: 2,
    backgroundColor: '#E7F0FF',
  },
  emojiText: {
    fontSize: 17,
  },
  colorButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(42, 56, 78, 0.25)',
  },
  colorButtonActive: {
    borderWidth: 2,
    borderColor: '#0F6FDB',
  },
  actionButton: {
    height: 32,
    borderRadius: 9,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButton: {
    width: 34,
    backgroundColor: '#34C759',
  },
  saveButtonDisabled: {
    backgroundColor: '#A1B2C6',
  },
  modalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  popupCard: {
    position: 'absolute',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderRadius: 14,
    borderWidth: 0,
    backgroundColor: '#FFFDF8',
    shadowColor: '#203040',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  iconPopup: {
    minHeight: 72,
  },
  colorPopup: {
    minHeight: 156,
  },
  popupTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#556173',
    marginBottom: 8,
  },
  popupIconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  popupEmojiChip: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(42, 56, 78, 0.2)',
    backgroundColor: '#EEF2F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupEmojiChipSelected: {
    borderWidth: 2,
    borderColor: '#0F6FDB',
    backgroundColor: '#E7F0FF',
  },
  popupEmojiText: {
    fontSize: 18,
  },
  popupEmojiGridChip: {
    flexShrink: 0,
  },
  popupColorGrid: {
    gap: COLOR_GRID_GAP,
    alignItems: 'center',
  },
  popupColorRow: {
    flexDirection: 'row',
    gap: COLOR_GRID_GAP,
    alignSelf: 'center',
  },
  popupColorChip: {
    width: COLOR_CHIP_SIZE,
    height: COLOR_CHIP_SIZE,
    borderRadius: COLOR_CHIP_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(42, 56, 78, 0.2)',
  },
  popupColorChipSelected: {
    borderWidth: 2.5,
    borderColor: '#1F2D3D',
  },
});
