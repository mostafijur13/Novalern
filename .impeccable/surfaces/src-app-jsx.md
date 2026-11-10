---
version: 1
slug: "src-app-jsx"
primary_target: "src/App.jsx"
related_targets: ["src/pages/Home.jsx","src/pages/Learn.jsx","src/components/LessonPlayer.jsx","src/components/Layout.jsx","src/pages/DailyExam.jsx"]
---

## Scope

Mode: Operate. Surfaces: app shell (top bar, bottom navigation), Home, Learn with AI (empty state, conversation, video player), Daily exam, Weekly recap, Profile, and the login page's type. Audience: teen and university students on phone and laptop, studying alone in short sessions. Task: start a lesson, replay a lesson, take an exam. Must stay untouched: all behaviour, data, copy of generated lessons, the brand wordmark and icon.

## Direction contract

THESIS: A study notebook that is already open to the right page. Headings are set in a pixel face and underlined with a single green rule; everything beneath them is open text separated by hairlines, never boxed. The surface refuses the dashboard arrangement of same-size cards, stat tiles and a coloured hero block.

OWN-WORLD: Ground off-white #F6F3EC with a faint 24px dot grid. Ink navy #0F172A. One accent, the logo green #5BA300, used for rules under headings, the active nav item, the primary button and links; lime #A3E635 only inside the logo and the player's progress blocks. Pixel face (Pixelify Sans) for the greeting, every section heading, the Learn slogan and the player's captions and scene counter; Public Sans for body, controls, lists. Rules are 1px #D9D2C5 hairlines; the heading rule is 2px green. No shadows, no card backgrounds, square-ish 6px radii on controls only.

STORY: The student lands on their name in big pixel type, sees "Learn with AI" as the single large action, and their past lessons listed beneath an underlined "History". They understand this is a tool for their own material, that starting is one tap, and that nothing is hidden.

FIRST VIEWPORT (Home, phone and laptop): top bar with the wordmark at 56px tall and the avatar. Then the greeting "Hi, Name." in pixel type at 2.6rem desktop / 2rem phone, no block. Directly under it, the primary action: "Learn with AI →" as a full-width green button at 1.1rem with a one-line sub-caption. Then "History" as a pixel heading over a 2px green rule, followed by lesson rows: title in bold body, topic and date in muted body, a hairline between rows, no boxes. Bottom navigation: off-white, hairline top, four items in small caps body type, the active one carrying a 2px green underline under its label.

FORM: Pinned by the user's brief (off-white, logo green, pixel headings, open lists, minimal). seed: none (unavailable). Signature move: the pixel heading over a green rule, repeated on every surface and inside the player.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Surface notes

- Learn with AI: no header card; a centred pixel slogan ("Type it. Say it. Upload it. Watch it.") above the input bar when the lesson is empty; the page scrolls naturally, no inner scroll container; the player is width-bound with max-height 72vh and keeps its aspect on any viewport.
- Player: square corners, hairline border, pixel captions, progress as blocks; no inner scrollbar.
- Daily exam / Weekly recap: same open-list treatment; the setup steps are sections under pixel headings, not cards.
- Unresolved: whether the paper dot grid stays on phone (default: yes, at reduced opacity).
