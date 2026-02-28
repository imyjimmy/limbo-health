// components/binder/folderAppearance.ts
// Shared folder icon/color options for create/edit flows.
// Allowed colors are sampled from color-palette.png.

export const FOLDER_EMOJI_OPTIONS = [
  '❤️‍🩹', '🩺', '🧪', '💊', '💉', '⚠️', '🔬', '📷', '📄',
  '🦴', '🧠', '👁️', '🦷', '👂', '🫁', '🫀', '🩻', '🩹',
  '🏥', '🚑', '🧬', '🦠', '🩸', '🌡️', '😷', '🤒', '🎙️',
];

export const ALLOWED_FOLDER_COLORS = [
  // Cool shades
  '#0E324A', '#1A5869', '#697C87',
  // Green / olive shades
  '#314E2A', '#5B5D20', '#BABA7B',
  // Neutral shades
  '#8B8A87', '#C9BBA2', '#CB9982',
  // Warm shades
  '#DDAA4A', '#D48D19', '#B07C2F', '#9B5608', '#A94416',
  // Deep earth shades
  '#7E483A', '#5E330C', '#321D10',
];

export const DEFAULT_FOLDER_COLOR = ALLOWED_FOLDER_COLORS[2];
