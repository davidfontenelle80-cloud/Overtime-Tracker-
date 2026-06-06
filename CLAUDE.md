# Build and Ship Rules for This App

This file is read automatically when working in this repo. Honor it on every change.

## House finish (from KHub-Boilerplate)
- Dark theme by default, light theme on toggle. Both must work.
- All color, radius, spacing, shadow, and motion come from the KHub tokens. No raw values
  in component CSS.
- No sharp corners. Radius comes from the scale: sm 10, md 16, lg 22, xl 28, full.
- Press-scale, spring transitions, glow on the primary action, monospace tabular numbers.

## Before calling any version done, run the ship check
1. Open the app. No console errors. Error boundary present.
2. Open every view, tab, and modal. Each renders real content, not a blank or white screen.
3. Dark and light both render. Language toggle works.
4. Installs as a PWA and serves clean from GitHub Pages.
5. Design conformance: tokens only, unified radii, no mixed sharp and rounded edges,
   components match the KHub library, motion and polish present.
6. Fix every fail before shipping. Deliver one clean working build.

## How to run the static part of the check
From the repo root:
```
node scripts/khub-check.mjs .
```
This reports operational and design drift. A clean report is required to ship.
