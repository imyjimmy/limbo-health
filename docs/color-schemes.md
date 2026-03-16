# Limbo Health Color Schemes

This document records the two competing color directions currently present in the repo. It is descriptive, not a final design decision.

## 1. Logo-Led Warm Red / Orange Scheme

### Summary

This is the older brand-facing direction anchored in the current app icon and logo palette. It is built around near-black neutrals with warm brick, rust, coral, and cream accents.

### Core Colors

Primary source: `brand-color-logo-exploration-spec.md`

- `#0E0E0E` near-black
- `#242424` charcoal
- `#3A3A3A` softened dark neutral
- `#A1301F` brick red
- `#C14D39` rust red
- `#ED654D` warm orange-red
- `#F28872` soft coral
- `#F9F1E4` warm cream

### Where It Appears

- The repo already describes this as the "existing brand / logo-led direction" in `brand-color-logo-exploration-spec.md`.
- The current app icon assets are the anchor for this scheme:
  - `apps/react-native/assets/icon.png`
  - `apps/react-native/assets/adaptive-icon.png`
- A quick sample of warm accent pixels from `apps/react-native/assets/icon.png` shows live icon colors clustered around:
  - `#E55840`
  - `#E75A42`
  - `#E65941`
  - `#E85C44`
  - `#F06850`
- The binder folder appearance palette also includes adjacent warm families:
  - amber: `#D48D19`, `#E3A32E`, `#DDAA4A`, `#F2C166`, `#F7D79A`
  - rust / terracotta: `#9B5608`, `#A94416`, `#B65D2E`, `#CB7A4D`, `#CB9982`
  - red accents: `#8E3B2E`, `#B23A48`, `#CC4B65`

### Visual Character

- High-contrast and brand-distinctive
- Dark, editorial, premium-leaning
- More emotionally intense than the green workflow
- Best suited for brand marks and restrained accent use, not broad patient-facing surfaces

### Source References

- `brand-color-logo-exploration-spec.md`
- `apps/react-native/assets/icon.png`
- `apps/react-native/assets/adaptive-icon.png`
- `apps/react-native/components/binder/folderAppearance.ts`

## 2. Deep Green Onboarding / Bio Workflow Scheme

### Summary

This is the newer product-facing direction used in onboarding, bio setup, and the records-request flow. It centers on a deep teal-green primary, cobalt blue secondary accents, pale mint and blue glows, white cards, and slate text.

### Core Colors

Primary sources: `apps/react-native/app/(auth)/welcome.tsx`, `apps/react-native/app/bio-setup.tsx`

- `#0F766E` deep teal-green primary
- `#1D4ED8` cobalt blue accent
- `#2563EB` bright blue navigation / secondary action
- `#0F172A` deep navy / ink
- `#334155` dark slate support text
- `#475569` slate body text
- `#64748B` muted slate
- `#CBD5E1` light slate border
- `#E2E8F0` card / divider border
- `#F5F8FF` cool cloud background
- `#F8FAFC` soft neutral background
- `#D6F5EE` pale mint glow
- `#DBEAFE` pale blue glow
- `#D1FAE5` mint support
- `#FFFFFF` white surface

### Where It Appears

- `apps/react-native/app/(auth)/welcome.tsx`
  - Intro slides use `#0F766E` and `#1D4ED8` accents.
  - Screen background uses `#F5F8FF`.
  - Decorative glows use `#D6F5EE` and `#DBEAFE`.
- `apps/react-native/app/bio-setup.tsx`
  - Background uses `#F5F8FF`.
  - Eyebrow and primary CTA use `#0F766E`.
  - Glows use `#D6F5EE` and `#DBEAFE`.
  - Inputs and cards use white surfaces with `#CBD5E1` or `#E2E8F0` borders.
- `apps/react-native/app/records-request.tsx`
  - Repeats the same family with `#0F766E`, `#2563EB`, `#0F172A`, `#475569`, `#FFFFFF`, `#E2E8F0`, and `#F8FAFC`.
- `apps/react-native/components/records/RequestStepper.tsx`
  - Active step uses `#0F766E`.
  - Completed step uses `#2563EB`.
- `apps/react-native/app/(tabs)/profile/personal-info.tsx`
  - Save button uses the same mint support background `#D6F5EE`.

### Visual Character

- Calm, reassuring, healthcare-native
- More privacy-forward and workflow-friendly
- Better suited to forms, guided flows, and high-trust screens
- More coherent for patient-facing product surfaces than the warm brand palette

### Source References

- `apps/react-native/app/(auth)/welcome.tsx`
- `apps/react-native/app/bio-setup.tsx`
- `apps/react-native/app/records-request.tsx`
- `apps/react-native/components/records/RequestStepper.tsx`
- `apps/react-native/app/(tabs)/profile/personal-info.tsx`

## Comparison

| Scheme | Emotional read | Dominant colors | Current role in repo |
|---|---|---|---|
| Warm red / orange | Bold, branded, high-contrast | black, charcoal, brick red, rust, coral, cream | Current icon / logo-led brand direction |
| Deep green | Calm, trustworthy, workflow-oriented | deep teal-green, cobalt blue, mint, blue glow, slate, white | Onboarding, bio setup, and records-request UI |

## Notes

- The split is real: the repo currently contains one brand system tied to the icon and one calmer product system tied to onboarding and forms.
- `brand-color-logo-exploration-spec.md` already frames this as an unresolved design tension rather than a settled decision.
