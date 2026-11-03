---
version: 1
slug: "apps-web-src-screens-feedbackpage-tsx"
primary_target: "apps/web/src/screens/FeedbackPage.tsx"
related_targets: ["apps/web/src/admin/AdminFeedbackPanel.tsx","apps/web/src/screens/AdminPage.tsx","apps/web/src/room/RoomSessionLayout.tsx"]
---

# Feedback surfaces

## Thesis

Feedback is a short, trustworthy path from a live minigame into an administrator-owned inbox. Players should understand what will be sent; administrators should triage without leaving the product.

## Own world

Inherit Pokémon Universe: dark/light token palette, Fredoka headings, Nunito body, functional berry/electric/aqua/leaf accents, 12–16px bordered surfaces, direct Spanish copy and Lucide stroke icons. No advertising, monetization or premium treatment.

## First viewport

- `/feedback` shows game context, the problem/suggestion choice, description and send action in one focused surface.
- Admin Feedback shows global operational context, feedback counts, filters and the newest inbox entries without hiding them behind another navigation level.

## Player behavior

- Signed registered users and guests can send feedback.
- A room link preselects the current game and carries only the room code.
- Loading, retryable failure, validation and confirmation states are explicit.

## Admin behavior

- New problems, new suggestions, reviewing and resolved counts remain visible.
- Search and type/status filters control a paginated inbox.
- Selecting an entry reveals its full text, game, author snapshot, room and date.
- Status changes persist as New, Reviewing or Resolved with an in-progress state.

## Responsive and accessibility boundary

Support keyboard interaction and 320px-to-desktop layouts. Type and state are always textual as well as colored; controls meet touch size; the two-pane inbox stacks into a readable mobile flow.
