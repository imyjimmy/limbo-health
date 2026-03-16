# Limbo Health Brand Exploration Spec

## Purpose

Explore a cohesive visual direction for Limbo Health across logo, color system, and core mobile UI.

This spec is intended for an LLM or designer with strong UX, brand, and iOS/mobile design skills. The goal is not to immediately lock a final direction, but to generate high-quality visual proposals that help us decide between:

1. A logo-led black and warm red/orange system based on the current brand asset.
2. A calmer deep green system based on the new onboarding screens.
3. A hybrid direction that preserves brand recognition while improving healthcare trust and product coherence.

## Product Context

Limbo Health is a healthcare app focused on:

- medical-records requests
- reusable patient biography/profile data
- privacy and local-first handling of sensitive user info
- reducing hospital paperwork friction through guided workflows

Core emotional goals:

- trustworthy
- private
- competent
- calm
- modern
- human, not sterile

The app should feel more like "secure patient control" than "urgent clinical system."

## Design Tension To Resolve

We are at a real brand crossroads:

- The current brand/logo direction appears anchored in charcoal/black with a warm red-orange accent.
- The recently designed onboarding screens use a deep green with cool blue and soft mint support colors, which feels appropriate for healthcare and privacy.

The challenge is congruence:

- The green direction feels calmer and more healthcare-native.
- The black/red direction is more consistent with the current logo.
- A mismatch between logo and interface could make the app feel unfinished or internally inconsistent.

This exploration should explicitly examine whether:

- the UI should follow the existing logo palette
- the logo should evolve toward the new UI palette
- both should meet in a hybrid middle ground

## Source Palette A: Existing Brand / Logo-Led Direction

Use the current app icon / existing brand asset as the anchor for this branch.

Observed palette from the current icon asset:

- `#0E0E0E` near-black
- `#242424` charcoal
- `#3A3A3A` softened dark neutral
- `#A1301F` brick red
- `#C14D39` rust red
- `#ED654D` warm orange-red
- `#F28872` soft coral
- `#F9F1E4` warm cream

Interpretation:

- strong, memorable, high-contrast
- more editorial / bold / distinct
- potentially premium
- risk: could read as alarming, aggressive, or less "care" oriented if overused in healthcare UI

This branch should explore how to keep the existing brand recognizable while softening it enough for a patient-facing healthcare experience.

## Source Palette B: New Onboarding / Deep Green Direction

Use the new onboarding screens in [welcome.tsx](/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/react-native/app/(auth)/welcome.tsx) as the anchor for this branch.

Observed palette from the onboarding implementation:

- `#0F766E` deep teal-green primary
- `#1D4ED8` cobalt blue secondary accent
- `#0F172A` deep navy / ink
- `#F5F8FF` cool cloud background
- `#D6F5EE` pale mint glow
- `#DBEAFE` pale blue glow
- `#D1FAE5` mint support
- `#CBD5E1` light slate border
- `#475569` slate body text
- `#FFFFFF` white surfaces

Interpretation:

- calm, reassuring, privacy-forward
- better aligned to healthcare trust and device-first control
- more contemporary app-system feel
- risk: may drift too far from the current brand unless the logo evolves too

This branch should explore whether the app can feel distinct and premium, not generic health-tech teal.

## Exploration Goal

Produce visual concepts that answer this question:

> What should Limbo Health look like if it wants to feel private, premium, and trustworthy in healthcare while staying internally coherent between logo and interface?

## Required Exploration Tracks

Generate **three** distinct directions:

### Direction 1: Logo-Led

Build the product system around the current black + warm red/orange brand.

Requirements:

- preserve recognizable DNA from the current logo/icon
- make the palette feel appropriate for healthcare
- avoid looking like an emergency alert, fintech app, or edgy media brand
- show how warm reds can be used sparingly for emphasis rather than flooding the interface

### Direction 2: Green-Led

Build the product system around the new onboarding palette.

Requirements:

- treat deep green as the primary trust color
- use blue and mint as supporting tones, not noise
- keep the look emotionally calm, polished, and premium
- explain what should happen to the existing logo so the brand remains coherent

### Direction 3: Bridged Hybrid

Create a direction that intentionally merges the two worlds.

Possible strategies:

- charcoal + green core with ember accent
- green UI with a revised warmer logo accent
- near-black wordmark with restrained medicinal green and a subtle warm signature color

Requirements:

- feel like a real brand system, not compromise-by-averaging
- preserve distinctiveness
- create a clear argument for why this bridge is the best long-term system

## Deliverables

For each of the 3 directions, provide:

1. A short brand thesis
2. A named palette
3. A token set with:
   - primary
   - secondary
   - accent
   - background
   - surface
   - text primary
   - text secondary
   - border
   - success
   - warning
   - destructive
4. Guidance for logo treatment:
   - keep current logo as-is
   - refine current logo
   - redesign logo while preserving brand memory
5. Guidance for UI personality:
   - typography mood
   - corner radius language
   - shadow/elevation style
   - illustration or shape language
6. Mock or describe the following screens:
   - onboarding
   - sign-in
   - home/dashboard
   - bio setup
   - records request workflow stepper
7. A short rationale explaining:
   - why this direction fits healthcare
   - how it handles privacy/trust
   - how it aligns or intentionally realigns the logo
   - what risks remain

## What Good Looks Like

The strongest direction should feel:

- credible for handling medical records
- private by default
- patient empowering
- sophisticated without luxury cliches
- warm without looking playful
- modern without looking trend-chasing
- native to iOS quality expectations

## What To Avoid

- generic hospital blue with no point of view
- generic startup teal gradients with no brand tension
- blood-red dominant interfaces
- harsh black-heavy UI that feels punitive or stressful
- sterile enterprise healthcare visuals
- excessive friendliness that reduces trust
- visual inconsistency between logo and product surfaces

## Accessibility And UX Constraints

All proposals must respect:

- strong text contrast for patient-facing interfaces
- color roles that still work for users under stress
- restrained use of red for destructive/error states
- iPhone-first design with clean hierarchy and large tap targets
- support for light mode first; dark mode can be considered later
- clarity over decoration on form-heavy and workflow-heavy screens

## Brand Questions To Answer

The exploration should explicitly answer these questions:

1. Is the current logo palette strong enough to define the entire product?
2. If the UI moves green, does the logo need to change?
3. Can Limbo Health own a distinctive healthcare aesthetic that is not generic blue/teal?
4. Which direction best expresses:
   - privacy
   - patient agency
   - form/workflow competence
   - emotional calm
5. Which direction is most likely to scale well across:
   - mobile UI
   - marketing site
   - app icon
   - PDFs / generated documents

## Preferred Output Format For The Next Design Pass

The next design pass should return:

1. A concise recommendation matrix comparing all 3 directions
2. One recommended primary direction
3. One credible alternate
4. Revised palette tokens with exact hex values
5. Logo recommendations tied directly to the chosen system
6. High-fidelity visual descriptions or mockups for the core screens

## Current Recommendation Bias

There is **no final decision yet**.

However, the exploration should take seriously that:

- the green-led direction may be better for healthcare trust and calm
- the black/red direction has stronger continuity with the current brand
- the best answer may be a hybrid that keeps the brand recognizable while making the product feel more trustworthy and medically appropriate

## Final Instruction To The Designer / LLM

Do not produce safe average work.

The outcome should feel like a deliberate healthcare brand with a real point of view. Preserve emotional clarity, visual discipline, and iOS polish. If a logo revision is necessary to make the strongest product system, say so directly and show the path.
