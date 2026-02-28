// components/binder/folderAppearance.ts
// Shared folder icon/color options for create/edit flows.
// Allowed colors are sampled from color-palette.png.

export const FOLDER_EMOJI_OPTIONS = [
  '❤️‍🩹', '🩺', '🧪', '💊', '💉', '⚠️', '🔬', '📷', '📄',
  '🦴', '🧠', '👁️', '🦷', '👂', '🫁', '🫀', '🩻', '🩹',
  '🏥', '🚑', '🧬', '🦠', '🩸', '🌡️', '😷', '🤒', '🎙️',
];

export const ALLOWED_FOLDER_COLORS = [
  // Deep cool
  '#0E324A', '#1A5869', '#2A6F87', '#335C81', '#5B6C8A',
  // Teal / cyan
  '#0F766E', '#0E9F9A', '#2CB1BC', '#4FD1C5', '#7DD3FC',
  // Green range
  '#314E2A', '#3F6B33', '#5B8F3F', '#6E9B4B', '#93C572',
  // Olive / moss
  '#5B5D20', '#7A7D2E', '#9AA041', '#BABA7B', '#C9CF8A',
  // Neutral / stone
  '#8B8A87', '#A59F95', '#B7AFA3', '#C9BBA2', '#D8CCC0',
  // Warm orange / amber
  '#D48D19', '#E3A32E', '#DDAA4A', '#F2C166', '#F7D79A',
  // Rust / terracotta
  '#9B5608', '#A94416', '#B65D2E', '#CB7A4D', '#CB9982',
  // Red / magenta accents
  '#8E3B2E', '#B23A48', '#CC4B65', '#A64D79', '#8B4A7A',
  // Purple / indigo
  '#5A4E8C', '#6B5FA8', '#7C74C9', '#8F8BE8', '#5A5CC2',
  // Deep earth
  '#7E483A', '#5E330C', '#4B2E1B', '#321D10',
];

export const DEFAULT_FOLDER_COLOR = ALLOWED_FOLDER_COLORS[2];
