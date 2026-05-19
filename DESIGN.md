# DESIGN.md — Emma Design System

Extracted from the live rendered UI on 2026-05-19 via `/design-review`.
This is the source of truth for design decisions. Deviations are findings.

---

## Classifier

**App pages** (`/app`, `/settings/*`, `/admin`): APP UI rules — calm surface hierarchy, dense but readable, minimal chrome, utility language.

**Landing page** (`/landing`): LANDING PAGE rules — brand-first, expressive typography, full-bleed compositions, conversion-focused.

---

## Color System

```css
/* App */
--emma-950: #0d0a0e;       /* base background */
--emma-900: #111113;       /* elevated surface */
--emma-surface: #16161a;   /* card/panel surface */
--emma-accent: rgb(232, 160, 191);   /* primary pink accent (emma-300) */
--emma-text: rgb(232, 223, 230);     /* primary text */
--emma-muted: rgba(232, 160, 191, 0.25);  /* secondary labels */

/* Landing */
--l-bg:         #111113;
--l-surface:    #161619;
--l-surface2:   #1e1e22;
--l-accent:     #e8547a;       /* hot pink CTA */
--l-accent-dark: #1a0610;
--l-text:       #f2f0ea;
--l-muted:      rgba(242, 240, 234, 0.60);
--l-muted2:     rgba(242, 240, 234, 0.28);
--l-border:     rgba(255, 255, 255, 0.09);
--l-border2:    rgba(255, 255, 255, 0.16);
--l-green:      #22c55e;
--l-red:        #ef4444;
```

**Rules:**
- Background is warm-dark (`#0d0a0e`), NOT pure black. Never use `#000`.
- One accent color per context. App uses desaturated pink (`emma-300`). Landing uses saturated pink (`#e8547a`). Do not mix.
- Semantic: `#22c55e` = success/enabled, `#ef4444` = error/destructive. Always accompanied by label — no color-only encoding.
- Dark mode off-white text: `#e8dfe6` (app), `#f2f0ea` (landing). Never pure white.

---

## Typography

### Font Stack

| Role | Family | Weights | Usage |
|--|--|--|--|
| Display / Hero | Bebas Neue | 400 | Landing H1 only |
| Body / UI | Outfit | 200, 300, 400, 500, 600 | All other text |
| Italic / accent | Cormorant Garamond | 400, 600, 400i | App secondary labels, decorative |
| Code / mono | JetBrains Mono | variable | Code blocks, terminal output |

**Hard rule: Maximum 3 font families active per page.** Landing: Bebas Neue + Outfit + JetBrains Mono. App: Outfit + Cormorant Garamond.

Do not add Barlow, Barlow Condensed, Inter, Roboto, or system-ui as primary fonts. `system-ui` is only acceptable as a fallback in the stack after a named font.

### Scale

| Role | Size | Weight | Line-height |
|--|--|--|--|
| Landing H1 | 102px (Bebas) | 400 | 0.9 |
| Section H2 | 51–64px | 900 | 1.1 |
| Feature H3 | 22–32px | 700 | 1.2 |
| App H3/labels | 18–22px | 700 | 1.3 |
| Body | 16px | 300–400 | 1.5 |
| Caption/label | 10–12px | 300–400 | 1.4 |

**Minimum body text: 16px.** Never render UI text below 12px.

### Text Rules

- `text-wrap: balance` on all headings (h1–h6) — applied globally in `globals.css`
- `text-wrap: pretty` on long body paragraphs
- Curly quotes `"..."` not straight `"..."`
- Ellipsis character `…` not three dots `...`
- `font-variant-numeric: tabular-nums` on number columns and stats

---

## Spacing

Base unit: **8px** (Tailwind `2` = 8px).

Common spacing pattern observed:
- Section gaps: `py-16` to `py-24` (64–96px)
- Card padding: `p-4` to `p-6` (16–24px)
- Input padding: `px-4 py-2.5` (16px / 10px)
- Icon gutters: `gap-2` to `gap-3` (8–12px)

Never use arbitrary pixel values in Tailwind classes without a documented reason. Use scale values (`gap-2`, `p-4`, etc.).

---

## Border Radius

| Context | Value | Tailwind |
|--|--|--|
| Cards / panels | 12px | `rounded-xl` |
| Buttons | 8px | `rounded-lg` |
| Pills / tags | full | `rounded-full` |
| Inputs | 8–16px | `rounded-lg` or `rounded-2xl` |

Avoid uniform `rounded-2xl` on everything — vary radius by element type. Inner radius = outer radius − gap.

---

## Interaction States

### Touch Targets
**All interactive elements must be ≥44×44px.** Use `min-h-[44px]` or `w-11 h-11` when the visual size is smaller. Icon-only buttons must wrap with `w-11 h-11 flex items-center justify-center`.

### Focus
- `focus-visible` ring: `outline: 2px solid var(--l-accent)` with `outline-offset: 2px`
- Never `outline: none` without a replacement visible focus indicator
- App inputs: `focus:border-emma-300/30`

### Hover
- Buttons: color shift or opacity change — always provide a hover state
- Cards: `border-color` lift — no `box-shadow` pop on dark UI

### Loading States
- Skeleton shapes must match real content layout
- Loading text: "Loading…" with ellipsis, not three dots
- Never leave a blank screen — show a loader within 200ms

### Empty States
Must include: short warm message + primary action + optional icon. Never just "No items."

---

## Components

### Buttons

```
Primary:     bg-gradient-to-br from-emma-300 to-emma-400 + text-emma-950
Secondary:   bg-surface border border-surface-border text-emma-200/50
Ghost:       bg-transparent text-emma-200/30 hover:text-emma-200/60
Destructive: text-emma-200/15 hover:text-red-400/60 (with aria-label)
```

All buttons: `cursor-pointer`, `transition-all`, `disabled:opacity-20`.

### Inputs

```
Background:  bg-surface or bg-emma-200/3
Border:      border-surface-border or border-emma-200/8
Focus:       focus:border-emma-300/30
Text:        text-emma-100
Placeholder: placeholder:text-emma-200/20
```

**Always provide an accessible label.** Either a visible `<label>` element or `aria-label` attribute. Placeholder text alone is not a label.

### Cards / Panels

```
Background: bg-surface
Border:     border border-surface-border
Radius:     rounded-xl
```

Cards earn their existence — only use a card when the card is the interactive unit.

### Navigation (Settings Sidebar)

```
Active:   bg-emma-300/10 text-emma-300/80 border border-emma-300/15 rounded-lg
Inactive: text-emma-200/30 hover:text-emma-200/60
Label:    text-[10px] font-medium tracking-wider text-emma-200/20 uppercase
```

---

## Dark Mode

App is **dark-mode only**. There is no light mode.

- `html { color-scheme: dark }` — applied globally in `globals.css`
- Background: `#0d0a0e` (warm dark)
- Surfaces: lighter values for elevation, not shadows
- Scrollbars: 4px width, `rgba(232, 160, 191, 0.15)` thumb on transparent track

---

## Motion

- **Easing:** `ease-out` enter, `ease-in` exit, `ease-in-out` movement
- **Duration:** 150–300ms UI transitions, 400–700ms landing animations
- **Animate only:** `transform` and `opacity`. Never width/height/top/left.
- **`prefers-reduced-motion`:** all animations must have a reduced-motion fallback
- **No `transition: all`** — list properties explicitly

Landing animations defined in `globals.css`: `emmaFloat`, `emmaBreath`, `heroFadeIn`, `scrollLine`, `marquee`.

---

## Accessibility

- WCAG AA: 4.5:1 body text, 3:1 large text and UI components
- Touch targets: ≥44×44px on all interactive elements
- `aria-label` on all icon-only buttons and inputs without visible labels
- `aria-pressed` on toggle buttons (mic, mute, vision)
- `aria-disabled` on logically disabled but visible buttons
- No color-only encoding — pair with label, icon, or pattern

---

## Anti-Patterns (Never Do)

1. Purple/violet/indigo gradient backgrounds
2. 3-column feature grid with icon-in-colored-circle + bold title + 2-line description
3. Centered everything (`text-align: center` on all cards/headings)
4. Uniform `rounded-2xl` on every element
5. Decorative blobs, floating circles, wavy SVG dividers
6. Generic hero copy: "Welcome to...", "Unlock the power of...", "Your all-in-one..."
7. `system-ui` as primary body font
8. `transition: all` instead of specific properties
9. `outline: none` without a replacement focus indicator
10. Placeholder text as the only accessible label for an input

---

## Landing Page Rules (MARKETING pages only)

- First viewport = one composition, brand-first
- Hero: full-bleed, one headline + one CTA + one image. No cards in the hero.
- One job per section: one purpose, one headline, one short sentence
- Copy: product language, not mood/brand. Delete 30% of words repeatedly.
- Motion: at least 2 intentional entrance/scroll animations

---

## App UI Rules (APP pages only)

- Calm surfaces, strong typography, few colors. Dense but readable.
- Section headings state what the area IS or what the user CAN DO
- Utility language: "Profile settings", "Token usage" — not "Your journey"
- No decorative gradients on surface cards
- Cards only when card IS the interaction
