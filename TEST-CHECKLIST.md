# KHub-Boilerplate — Full Test Checklist

Run this checklist before calling any version of a KHub app **done**.  
Check every item in every section. If anything fails, fix before shipping.

---

## 1. Service Worker / PWA

- [ ] `sw.js` loads with no console errors on first visit
- [ ] App shell is cached after first load (DevTools → Application → Cache Storage)
- [ ] App loads offline after first visit (DevTools → Network → Offline)
- [ ] Bumped `CACHE_VERSION` in `sw.js` triggers a new SW install
- [ ] Update notice appears when new SW is waiting and page is "not safe"
- [ ] Clicking **Refresh** on update banner reloads to new version
- [ ] "Safe" state (no modal/focused input/dirty form) triggers quiet auto-reload
- [ ] `localStorage.khub_last_update_check` timestamp is set after update check
- [ ] Clearing `khub_last_update_check` and reloading triggers a fresh update check
- [ ] `manifest.json` has no errors (DevTools → Application → Manifest)
- [ ] All 8 icon sizes load without 404 (DevTools → Network filter: icon)

---

## 2. PWA Install

- [ ] Install prompt appears on Chrome/Edge on Android/desktop (⊕ in address bar)
- [ ] App installs to home screen on Android (Add to Home Screen)
- [ ] App installs on iOS (Safari → Share → Add to Home Screen)
- [ ] Installed app opens in standalone mode (no browser chrome)
- [ ] App icon shows "K" lettermark correctly on home screen
- [ ] Splash screen uses `background_color` from manifest (white/dark)
- [ ] `theme-color` tints the status bar on Android

---

## 3. Dark Mode

- [ ] Default theme matches OS preference on first visit
- [ ] `🌙` button toggles to dark mode; `☀️` button toggles back
- [ ] Dark theme persists after page reload (`localStorage.khub_theme`)
- [ ] Changing OS preference updates theme if user hasn't manually overridden
- [ ] Changing OS preference does NOT override a manual user choice
- [ ] `KHub.Theme.reset()` clears override and follows OS again
- [ ] All text passes 4.5:1 contrast in both light and dark mode
- [ ] Error boundary, update notice, and modal look correct in dark mode
- [ ] `Alt+D` keyboard shortcut toggles dark mode

---

## 4. Language Toggle (EN/ES)

- [ ] Default language loads correctly (respects `localStorage.khub_lang`)
- [ ] **EN** button switches to Spanish; **ES** button switches back
- [ ] All `data-i18n` elements update on toggle (no stale text)
- [ ] `<html lang="">` attribute updates to `"es"` or `"en"`
- [ ] Language choice persists after reload
- [ ] `Alt+L` keyboard shortcut toggles language
- [ ] Button `aria-label` updates with each language switch
- [ ] Every i18n key used in `index.html` exists in both `en` and `es` in `i18n.js`

---

## 5. Accessibility (WCAG 2.2 AA)

- [ ] Skip link is hidden until focused; clicking it moves focus to `#main-content`
- [ ] All interactive elements reachable by `Tab` key alone
- [ ] Focus ring (3px blue outline) is visible on all focused elements
- [ ] `Alt+H` moves focus to main content
- [ ] Modal opens and immediately traps focus inside
- [ ] `Tab` and `Shift+Tab` cycle within open modal only
- [ ] `Escape` closes modal
- [ ] Focus returns to the button that opened the modal on close
- [ ] Screen reader announces update notice (verify with VoiceOver / NVDA)
- [ ] Screen reader announces error boundary message (assertive)
- [ ] Screen reader announces auth state change
- [ ] All buttons have visible label or `aria-label`
- [ ] All inputs have associated `<label>` elements
- [ ] Required inputs have `aria-required="true"` or `required`
- [ ] Validation errors are announced by screen reader (`role="alert"`)
- [ ] `KHub.A11y.increaseFontSize()` increases text across all elements (rem-based)
- [ ] `KHub.A11y.decreaseFontSize()` decreases text; floor is 85%
- [ ] Font scale persists across reloads
- [ ] All interactive elements meet 44×44px touch target
- [ ] No keyboard traps outside of modal
- [ ] `@media (prefers-reduced-motion: reduce)` disables all transitions

---

## 6. Component Library

**Buttons**
- [ ] Primary, secondary, danger variants render correctly in light + dark
- [ ] Disabled button shows 50% opacity and `cursor: not-allowed`
- [ ] All buttons meet 44px minimum height
- [ ] `KHub.Components.Button.create()` returns a working `<button>` element

**Modal**
- [ ] `KHub.Components.Modal.open()` renders modal with correct title + body
- [ ] Confirm and Cancel callbacks fire correctly
- [ ] `✕` close button dismisses modal
- [ ] Clicking backdrop dismisses modal
- [ ] `Escape` key dismisses modal
- [ ] `KHub.Components.Modal.close()` works programmatically
- [ ] Only one modal open at a time (opening second closes first)
- [ ] `aria-modal="true"` and `aria-labelledby` are set on backdrop

**Card**
- [ ] `KHub.Components.Card.create({title, body})` renders correctly
- [ ] Optional footer renders only when provided
- [ ] Card looks correct in both light and dark mode

**Input**
- [ ] `KHub.Components.Input.create({...})` renders label + input + hint + error
- [ ] `required: true` adds asterisk and `required` attribute
- [ ] `validate` function runs on blur
- [ ] Invalid state adds red border + shows error message
- [ ] Error message is announced by screen reader
- [ ] Password input uses `type="password"` and `autocomplete="current-password"`
- [ ] Email input uses `type="email"` and `autocomplete="email"`

---

## 7. Error Boundary

- [ ] No error: boundary element is `hidden`
- [ ] `KHub.ErrorBoundary.show('message')` shows the banner with message
- [ ] Dismiss button hides the banner
- [ ] Throwing an uncaught error triggers boundary automatically
- [ ] Unhandled promise rejection triggers boundary
- [ ] Dev mode: shows technical error message
- [ ] Prod mode: shows generic "Something went wrong" message
- [ ] `show(msg, retryFn)` adds a "Try again" button that calls retryFn
- [ ] Error boundary text is translated on language toggle

---

## 8. Auth Pattern

- [ ] `KHub.Config.features.auth = false` — no auth UI appears
- [ ] `KHub.Auth.isSignedIn()` returns `false` by default
- [ ] `KHub.Auth.getUser()` returns `null` by default
- [ ] `KHub.Auth.renderControls('#container')` injects sign-in button when signed out
- [ ] Clicking sign-in button opens modal with email + password fields
- [ ] `onAuthChange(fn)` fires immediately with current user state
- [ ] Auth state change is announced by screen reader
- [ ] Setting `features.auth = true` without implementing provider logs a clear warning

---

## 9. Performance

- [ ] `KHub.Perf.report()` runs on window load in dev mode (check console)
- [ ] TTFB < 800ms on localhost
- [ ] FCP < 1800ms on localhost
- [ ] No render-blocking resources (DevTools → Performance)
- [ ] All CSS loaded via `<link>` (no inline styles that bypass caching)
- [ ] All JS files load without 404
- [ ] Total page weight < 200 KB uncompressed (excluding icons)
- [ ] Images (icons) have correct `type` in manifest
- [ ] No unused CSS variables (spot-check with DevTools)

---

## 10. Responsive Design

- [ ] Phone (375px): layout is single-column, bottom nav visible if used
- [ ] Tablet (768px): content area expands, appropriate spacing
- [ ] Desktop (1024px+): content centered at `--max-width`, bottom nav hidden
- [ ] Modal is full-width on phone, fixed-width on desktop
- [ ] No horizontal scroll at any breakpoint
- [ ] Text does not overflow containers at any size
- [ ] Touch targets (44px) pass on phone viewport
- [ ] Header controls (lang + theme toggles) visible at all widths

---

## 11. Cross-browser / Cross-device

- [ ] Chrome (desktop) — install, offline, update flow
- [ ] Firefox (desktop) — layout, dark mode, keyboard nav
- [ ] Safari (desktop) — service worker, manifest
- [ ] Chrome (Android) — install to home screen, standalone mode
- [ ] Safari (iOS) — Add to Home Screen, standalone mode
- [ ] Edge (desktop) — install prompt, layout

---

## 12. Code quality

- [ ] `npm run lint` passes with 0 errors
- [ ] `npm run format:check` passes with 0 changes needed
- [ ] `node --check` passes on every `.js` file
- [ ] No `var` declarations (all `const` or `let`)
- [ ] No `==` comparisons (all `===`)
- [ ] Every new JS file added to `PRECACHE_URLS` in `sw.js`
- [ ] `CACHE_VERSION` bumped in `sw.js` on every deploy
- [ ] No hardcoded user data or secrets in any file
- [ ] `.env.local` not committed (confirm with `git status`)
- [ ] README is current and reflects all active features

---

## 13. GitHub Pages deploy

- [ ] GitHub Pages enabled (Settings → Pages → main branch, `/` root)
- [ ] Site loads at `https://username.github.io/repo-name/`
- [ ] No mixed-content warnings (all assets served over HTTPS)
- [ ] Service worker registers successfully on Pages URL
- [ ] `manifest.json` loads without 404
- [ ] PWA install prompt appears on Chrome/Edge
- [ ] All icons load (check Network tab on first visit)
- [ ] Update flow works end-to-end on Pages (deploy a change, wait 5 min, reload)

