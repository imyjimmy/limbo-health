# Appearance Toggle Shortfalls

## Context

The mobile app in `apps/react-native` currently exposes a Light/Dark appearance switch from Profile > Settings.

Even though the control uses React Native's native `Switch` on iOS, the overall interaction still does not feel native-quality. The difference between the current implementation and a polished native toggle is large enough to be noticeable immediately on device.

## Current User-Visible Problems

- The toggle feels laggy when switching between Light and Dark.
- The control does not feel as crisp or immediate as a native iOS settings toggle.
- The visual transition is still jarring even after reducing some of the surrounding custom styling.
- The problem is not the switch thumb alone; it is the full-screen theme change that happens around it.

## Why This Still Feels Wrong

The switch itself is a native iOS `UISwitch` through React Native, but toggling it triggers a broad app-wide appearance update:

- the theme provider resolves a new theme mode
- screens re-render against new semantic color tokens
- navigation chrome updates
- profile surfaces update
- home surfaces update
- any other mounted themed components update

That means the user is not only seeing a native switch animate. They are also seeing the rest of the app repaint during or immediately after the gesture. That repaint cost is what makes the interaction feel clunky.

## What Was Tried

- Replaced the earlier multi-option control with a single native `Switch`
- Removed extra scaling and heavier decorative styling around the switch
- Delayed the persisted theme update until after the interaction settles

These changes helped the structure, but they did not close the gap enough.

## Practical Conclusion

This is currently "native control, non-native-feeling outcome."

The implementation is serviceable, but it does not meet the bar of a truly smooth iOS appearance toggle.

## If Revisited Later

A better solution likely needs a deeper architectural change instead of more small styling tweaks. Options to consider:

- apply appearance changes after leaving the Settings screen instead of during the toggle gesture
- use a temporary local preview state with a controlled transition rather than immediate global repaint
- reduce the number of mounted surfaces that re-render on theme change
- move more theme-dependent values out of frequently re-created style paths
- consider following system appearance only, if instant in-app switching is not worth the interaction cost

## Status

Documented for future revisit. Not considered solved.
