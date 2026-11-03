---
version: 1
slug: "apps-web-src-screens-changelogpage-tsx"
primary_target: "apps/web/src/screens/ChangelogPage.tsx"
related_targets: ["apps/web/src/screens/HomePage.tsx","apps/web/src/admin/AdminChangelogPanel.tsx","apps/web/src/screens/AdminPage.tsx"]
---

# Changelog surfaces

## Thesis

Patch notes are a calm, scannable product record inside the established Pokémon Universe visual world. Public surfaces prioritize reading; the administrator prioritizes fast, safe editing.

## Own world

Reuse the existing dark/light palette, Fredoka display type, Nunito body type, functional accent colors, rounded bordered surfaces and direct Spanish copy. Do not introduce monetization, advertising, premium states or a separate visual language.

## First viewport

- Home exposes the latest published version without requiring a full viewport of scrolling.
- `/changelog` leads with the history title and the newest published version.
- Admin leads with operational summary, stable navigation and the version editor.

## Public behavior

- Only published versions appear publicly.
- Changes are grouped by semantic category with icon, label and text.
- Loading, failure with retry, and empty states remain explicit.
- The unread badge is browser-local and clears when the history is read.

## Admin behavior

- Draft and published status is always expressed in text as well as color/icon.
- Creating, editing, publishing, unpublishing and deleting refreshes public changelog state immediately.
- Dirty forms are protected before switching records, starting a new record, changing admin tabs or leaving the browser page.

## Responsive and accessibility boundary

Support keyboard use and 320px-to-desktop layouts. Reading columns collapse to one; admin columns stack. Preserve visible focus, semantic headings and status announcements, and never rely on color alone.
