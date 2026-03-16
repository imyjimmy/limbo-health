Good news — the `ToolbarItem` interface is straightforward. Each item just needs `onPress`, `active`, `disabled`, and `image` (which feeds into an RN `<Image source={...}>`). The key pattern is to create a factory function that closes over your attachment callback.

Here's the approach:

**1. Create a paperclip icon asset.** The toolbar uses `<Image source={...}>`, so you need a PNG or data URI — not a Tabler component. Simplest approach: save a 24x24 paperclip PNG to `assets/icons/paperclip.png`.

**2. Create the custom toolbar item.** Something like a new file `components/editor/attachToolbarItem.ts`:

```ts
import type { ToolbarItem } from '@10play/tentap-editor';

const paperclipIcon = require('../../assets/icons/paperclip.png');

export function createAttachToolbarItem(
  onPress: () => void
): ToolbarItem {
  return {
    onPress: () => () => onPress(),
    active: () => false,
    disabled: () => false,
    image: () => paperclipIcon,
  };
}
```

**3. In NoteEditor, show an ActionSheet on press.** Use `ActionSheetIOS` (or cross-platform `@expo/react-native-action-sheet`) to present the options, then compose the toolbar items:

```ts
import { ActionSheetIOS } from 'react-native';
import { DEFAULT_TOOLBAR_ITEMS } from '@10play/tentap-editor';

// Inside the component:
const attachItem = createAttachToolbarItem(() => {
  ActionSheetIOS.showActionSheetWithOptions(
    {
      options: ['Cancel', 'Photo from Binder', 'Take Photo', 'Record Audio', 'Attach File'],
      cancelButtonIndex: 0,
    },
    (buttonIndex) => {
      switch (buttonIndex) {
        case 1: /* pick encrypted photo */ break;
        case 2: /* launch camera */ break;
        case 3: /* audio recorder stub */ break;
        case 4: /* file picker stub */ break;
      }
    },
  );
});

const toolbarItems = [...DEFAULT_TOOLBAR_ITEMS, attachItem];
```

Then pass it: `<Toolbar editor={editor} items={toolbarItems} />`

**4. For Android** you'd swap `ActionSheetIOS` for a cross-platform solution. Since you're on Expo, `@expo/react-native-action-sheet` works on both platforms, or you could just use `Alert.alert` with buttons as a quick stub.

The Photo/Camera cases would call `handleAddAttachment` from your existing attachment flow. Audio and File stay as stubs that show a "Coming soon" alert.

## Summary
Here's the carry-forward summary:

**Summary for New Chat**

**What's Done and Working**

The rich text markdown editor is fully functional in the React Native app using `@10play/tentap-editor` v1.0.1 with a custom advanced setup (Vite-built WebView bundle).

Key pieces in place:
- `editor-web/AdvancedEditor.tsx` — uses `useTenTap` with `TenTapStartKit` + `MarkdownBridge`, loads `@tiptap/markdown` (no `.configure()` — `transformPastedText` doesn't exist on that extension's options)
- `core/editor/MarkdownBridge.ts` — custom `BridgeExtension` that exposes `getMarkdown()` and `setMarkdown()` across the RN↔WebView bridge. Uses the async request/response pattern with an **inlined** `AsyncMessages` class (tentap doesn't export it from its public API). Defines `GetMarkdown`, `SetMarkdown`, and `SendMarkdownToNative` action types. The `onBridgeMessage` handler has a try/catch around `(editor as any).getMarkdown()` to prevent silent Promise hangs.
- `components/editor/NoteEditor.tsx` — full editor screen with title input, `<RichText>`, `<Toolbar>` (with `TenTapStartKit` + `MarkdownBridge` in bridgeExtensions), `<AttachmentList>`, and save handler that assembles a `MedicalDocument` with `# title\n\nbody` markdown format
- `npm run editor:build` produces `editor-web/build/editorHtml.js` (Vite bundle ~770KB)
- Save flow works end-to-end: editor → `getMarkdown()` → assemble doc → log (commit not yet wired)
- Toolbar renders correctly above the keyboard with all default formatting buttons

**What's Next: Attachment Button in Toolbar**

The plan is to add a paperclip/attach button as the last item in the toolbar. When pressed, it shows an ActionSheet with options: "Photo from Binder" (pick existing encrypted photo), "Take Photo" (camera), "Record Audio" (stub), "Attach File" (stub).

Implementation approach discovered from reading tentap source:
- `<Toolbar>` accepts an `items` prop of type `ToolbarItem[]`
- `ToolbarItem` interface: `{ onPress, active, disabled, image }` where `image` returns an RN `Image` source (PNG asset, not a React component)
- `DEFAULT_TOOLBAR_ITEMS` is exported from `@10play/tentap-editor` and can be spread + appended to
- Create `createAttachToolbarItem(onPress)` factory that returns a `ToolbarItem`
- Use `ActionSheetIOS` or `@expo/react-native-action-sheet` for the picker menu
- Selected attachments feed into the existing `handleAddAttachment` / `PendingSidecar` flow in `NoteEditor`
- Need a 24x24 paperclip PNG asset since toolbar uses `<Image source={...}>` not Tabler icon components

**Key Constraints (still apply)**
- React Native has no `Buffer`, `atob`, `btoa` — use custom base64 utilities or `react-native-base64`
- Icon library is Tabler (`@tabler/icons-react`) but toolbar specifically needs PNG assets
- API routes in plebdoc-scheduler-api use Bun, not Express
- `fs.promises.readFile` with `{ encoding: 'utf8' }` needs `as string` assertion in the RN-fs adapter
- `.npmrc` has `legacy-peer-deps=true`

---

That plus your existing memory should get the next chat up to speed fast.
