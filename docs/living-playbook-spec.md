# The Living Playbook — Functional & Data Specification

This document describes how the current Living Playbook web app (`src/index.html` + `src/playbook.js`) works and the format of its data files. It is meant as a reference for building a React-based viewer and editor with the same features.

Everything here was derived from the source as of version `2025.0002.0002` of `living_playbook.json`. Where the current code has quirks or bugs, they are called out under **⚠ Quirk** so you can decide whether to reproduce them, fix them, or stay backward compatible with them.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Data files](#2-data-files)
3. [Data schema](#3-data-schema)
4. [Derived / runtime-only fields](#4-derived--runtime-only-fields)
5. [Viewer functionality](#5-viewer-functionality)
6. [Search language](#6-search-language)
7. [Tag filter](#7-tag-filter)
8. [Lists and favorites](#8-lists-and-favorites)
9. [Sharing and URL parameters](#9-sharing-and-url-parameters)
10. [Game card rendering](#10-game-card-rendering)
11. [Editor functionality (current)](#11-editor-functionality-current)
12. [Export: sanitizing and versioning](#12-export-sanitizing-and-versioning)
13. [Diff format](#13-diff-format)
14. [Maintenance scripts](#14-maintenance-scripts)
15. [Visual design notes](#15-visual-design-notes)
16. [Known quirks and bugs (summary)](#16-known-quirks-and-bugs-summary)
17. [Recommendations for the React version](#17-recommendations-for-the-react-version)

---

## 1. Architecture overview

- **Static, front-end only.** There is no backend. `index.html` loads `styles.css`, `marked.min.js` (a Markdown renderer), and `playbook.js`. On `DOMContentLoaded` it calls `playbookPage.onPageLoad()`.
- **One JSON database per page load.** The page fetches either `living_playbook.json` (the default, "Online" edition) or `living_playbook_2001.json` (the legacy edition, selected with `?dbId=2001`). Fetches use `{ cache: 'no-store' }`.
- **All user state lives in the URL and in `localStorage`.** Search/tag state goes into the query string. Favorites and user lists go into `localStorage`.
- **Editing is local only.** With `?edit=1`, a maintainer can edit games in memory and then download a whole new JSON file or a diff file. Getting changes into the repo is a manual step (commit or pull request).
- **Local dev:** `python test/server.py` serves `src/` on port 8000 with caching disabled (also `start_test.bat` and the VS Code task/launch configs).

Main classes in `playbook.js`:

| Class | Responsibility |
|---|---|
| `Util` | Encodes/decodes a set of integers as a compact bitmask string (used for list sharing). |
| `mdToHtml()` | Wraps `marked`: `parseInline` for single-line strings, `parse` for multi-line strings. |
| `TagFilter` | Two sets: `yesTags` (must have) and `noTags` (must not have). |
| `SearchOp`, `SearchNode` | Tokenizer, parser, and evaluator for the search language. |
| `SearchFilter` | Thin wrapper holding a parsed `SearchNode` tree. |
| `LocalStore` | JSON wrapper around `window.localStorage`, plus a list of the user's game lists. |
| `GameList` | A named list of game UIDs stored in `localStorage`. |
| `GameDiff`, `PlaybookDiff` | Compute a per-field diff between two playbooks. |
| `Playbook` | Loads data, extracts tags, searches, sanitizes, exports. |
| `PlaybookPage` | Everything in the UI: DOM building, event handling, URL sync, edit overlays. |

---

## 2. Data files

All data files live in `src/`.

| File | Purpose | Loaded by app? |
|---|---|---|
| `living_playbook.json` | **Current, up-to-date database.** This is the file maintainers edit. | Yes (default) |
| `living_playbook_2001.json` | **Legacy database.** A faithful copy of the original 2001 Living Playbook (see `Living-Playbook.pdf`). The original document's terms require it to stay available. It should not receive content updates. | Yes, with `?dbId=2001` |
| `living_playbook.2025.0001.0000.json`, `living_playbook.2025.0002.0000.json` | **Archived release snapshots**, named `living_playbook.<year>.<major>.<minor>.json`. Used to generate changelogs. | No |
| `Living-Playbook.pdf` | The original source document (linked from the footer). | Linked only |

Stats for the current files:

| File | version | games | nextUid | tags in use |
|---|---|---|---|---|
| `living_playbook.json` | 2025.0002.0002 | 284 | 289 | 54 |
| `living_playbook_2001.json` | 2001.0001.0001 | 276 | 287 | 41 |

UIDs line up across files by game identity: a game keeps its UID across editions and renames (for example, "King Game" in 2001 and "Monarch Game" now are both UID 113). `scripts/assign_uids.py` was used to copy UIDs from the main file into the other files by exact name match.

---

## 3. Data schema

### 3.1 Top-level object

```jsonc
{
  "version": { "year": "2025", "major": "0002", "minor": "0002" },
  "contributors": ["Kris Anderson", "Tony Beeman", "..."],
  "notes": "This is the Online Living Playbook, with ongoing updates.",
  "license": "The Online Living Playbook © 2025, maintained by [Tony Beeman](...) ...",
  "nextUid": 289,
  "games": [ /* Game objects */ ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `version` | object of **strings** | yes | `year` is 4 digits. `major` and `minor` are zero-padded to 4 digits (`"0002"`). The header shows only `major.minor`. Export increments `minor` automatically. |
| `contributors` | string[] | no | Full names. Shown in the footer as a comma-separated list. On export they are sorted by the **last word** of the name. May contain duplicates (e.g. "Paul Killam" appears twice); nothing dedupes them. |
| `notes` | string | no | Short description of the database. **The app never displays it.** |
| `license` | string (Markdown) | no | License text. **The app never displays it.** The footer license text is hard-coded in `playbook.js`. |
| `nextUid` | integer | yes (in practice) | The next free UID. Must be greater than every existing `uid`. If it's missing or not a number, the code falls back to `1`. |
| `games` | Game[] | yes | See below. The file is sorted by name on export, but the app re-sorts on display anyway, so file order doesn't matter. |

The 2001 file also has a legacy key `"contributers"` (misspelled) holding one string. It isn't used, and its `contributors` entries include annotations like `"Tony Beeman (Post 2001 Technical Updates)"`.

### 3.2 Game object

```jsonc
{
  "uid": 113,
  "name": "Monarch Game",
  "description": "One improviser is the monarch ...",
  "notes": "If a servant makes mistakes ...\n\nMonarchs are annoyed by ...",
  "variations": ["Hero/Chorus: Improvisers stand in a circle ..."],
  "aliases": ["King Game"],
  "related": ["Pecking Order"],
  "tags": ["exercise", "game", "shortform"],
  "createdBy": "Keith Johnstone"
}
```

| Field | Type | Required | Rendering | Count in current file |
|---|---|---|---|---|
| `uid` | integer ≥ 1 | yes | Not shown. Used for permalinks, lists, and diffs. | 284/284 |
| `name` | string | yes | Plain text title. **Must be unique**: the editor looks games up by name, and `related` references games by name. | 284/284 |
| `description` | string (Markdown) | yes | Markdown | 284/284 |
| `notes` | string (Markdown) | no | Markdown, with a "notes" header | 30 |
| `variations` | string[] (each Markdown) | no | Each item is rendered as Markdown with a `‣` bullet | 73 |
| `aliases` | string[] | no | Plain-text chips | 35 |
| `related` | string[] (game **names**) | no | Links that run the search `id:<anchor of name>` | 43 |
| `tags` | string[] | effectively yes | Plain-text chips. Also drive the tag filter. | 283 (only "Song in a Style" has none) |
| `createdBy` | string (Markdown) | no | Markdown, with a "createdBy" header | 3 |

Conventions and constraints:

- **Missing vs. empty.** Optional fields are omitted when empty. The exporter strips empty strings, empty arrays, `null` and `undefined`.
- **Arrays are sorted alphabetically on export.** This includes `variations`, so a maintainer can't control variation order. See [§12](#12-export-sanitizing-and-versioning).
- **Markdown.** Multi-line text uses `\n`, and paragraphs use `\n\n`. Lists (`- item`), `*italic*`, `**bold**` and links all appear in the data. Strings without a newline are rendered inline, so no `<p>` wrapper.
- **Tags** are lower-case free text, and some contain spaces (`"blank challenge"`, `"group game"`, `"stage picture"`). There's no controlled vocabulary, and near-duplicates exist (`toss-up` / `tossup`, `emotions`). The tag list in the UI is built from whatever tags appear in the data.
- **Related** entries are game names, not UIDs, so they break when the target is renamed. Currently `"Panel Experts Endowment"` points at a game that no longer exists under that name. `sanitizeDatabase()` logs unknown related names to the console.
- **Name characters.** Names can include punctuation and symbols (`In A _____, With A ____, While _____`, `™`). Every current name starts with a letter A–Z, which matters for the letter dividers.

Current tag vocabulary (54 tags, with counts):
`active 6, animal 1, audience 11, beginner 1, bell 9, blank challenge 2, blocking 1, character 3, cultural 13, dance 3, directed 26, emotions 1, endowment 41, environment 9, exercise 32, game 53, gibberish 12, group game 1, guessing 18, historical 2, justification 30, list 1, longform 4, monologue 10, musical 15, narrated 14, narrative 12, news 2, numbers 4, physical 34, pimping 6, pop-culture 6, props 16, risky 1, scene 205, shortform 258, silence 8, sound 5, spectacle 2, stage picture 1, status 6, styles 16, switch 2, teamwork 3, tech 10, timed 32, timejump 9, toss-up 8, tossup 1, transitions 2, verbal 31, warm-up 8, wtf 3, yes-and 1`

### 3.3 Suggested TypeScript types

```ts
interface PlaybookVersion { year: string; major: string; minor: string } // zero-padded strings

interface Game {
  uid: number;
  name: string;
  description: string;       // markdown
  notes?: string;            // markdown
  variations?: string[];     // markdown each
  aliases?: string[];
  related?: string[];        // game names
  tags?: string[];
  createdBy?: string;        // markdown
}

interface PlaybookFile {
  version: PlaybookVersion;
  contributors?: string[];
  notes?: string;
  license?: string;          // markdown
  nextUid: number;
  games: Game[];
  contributers?: string;     // legacy typo, 2001 file only; ignore
}
```

---

## 4. Derived / runtime-only fields

When the database loads, `Playbook.loadFromURL()` adds these to every game in memory. They're stripped again on export:

- `anchorName`: `name.replace(/[^A-Za-z0-9]+/g, '').toLowerCase()`. For example, `"Word-at-a-Time Story"` becomes `"wordatatimestory"`. It's used as the card's DOM `id` and as the target of `id:` searches and related-game links.
- `anchorAliases`: the same transform applied to each alias.

**⚠ Quirk:** Free-text search looks at *all* string and array fields except `related` and `uid`, and that includes `anchorName` and `anchorAliases`. So searching `monarchgame` finds "Monarch Game". The React version should decide whether to keep this. It's mostly harmless.

---

## 5. Viewer functionality

### 5.1 Page layout (top to bottom)

1. **Header**: the Unexpected Productions logo (`img/UPLogo.svg`), then the title and version:
   - Title: `The (Online) Living Playbook`, or `The (2001) Living Playbook` when `dbId=2001`.
   - Version line: `Version {major}.{minor}` (the year is not shown).
   - Subtitle on the right: `The Unexpected Productions Improv Game List`.
2. **Control pane** (hidden when printing):
   - **Search box** (`type="search"`, placeholder "Search games..."). With `edit=1`, two extra buttons appear next to it: **Download Json** and **Download Diff Json**.
   - **"Filter By Tags"**: a collapsible section, collapsed by default.
   - **"Lists and Favorites"**: a collapsible section, collapsed by default.
3. **Search description bar**: a horizontal rule with a label describing the current query and result count (see [§5.3](#53-search-description)).
4. **Game list**: game cards sorted by name (`localeCompare`), with a letter divider (`A`, `B`, …) before the first game of each new first letter (case-insensitive).
5. **Footer**: license and copyright text, links to the GitHub repo, the PDF and `?dbId=2001`, and "Contributors to this database include {contributors joined by ', '} and many friends, company members, teachers and supporters of Unexpected Productions." When there are no contributors, the list and the "and" are left out.

### 5.2 Live filtering

- Every keystroke in the search box re-runs the search and re-renders the list. No submit is needed.
- The URL updates **lazily**: at most once per second while typing (a 1-second timer that doesn't reset on each keystroke), and immediately when the box loses focus.
- Changing a tag updates the list and the URL immediately.
- The final result is `searchExpression(game) AND tagFilter(game)`, sorted by name.

### 5.3 Search description

The description is built from three parts, joined with `"| "`:

- `Search term: {raw search string}` when there's a search.
- `Tags: {yesTags joined by '; '}` when any tags are included.
- `Excluded tags: {noTags joined by '; '}` when any tags are excluded.

When all three are empty, it shows `All Games, Exercises and Formats`. It always ends with ` (1 entry)` or ` ({n} entries)`.

### 5.4 Collapsible sections

Clicking a section header toggles an `active` class and shows or hides the next sibling element. Both sections start collapsed. The header shows a `+` indicator (via CSS `:after`) that becomes `–` when expanded.

### 5.5 Printing

`@media print` hides the control pane and removes the page chrome, so a filtered list prints as a clean game list.

---

## 6. Search language

Implemented by `SearchNode.ParseFromString()` → `ParseFromFlatList()` → `ParseExpression()`, and evaluated with `SearchNode.match(game)`.

### 6.1 Tokenizing

Regex: `/(\(|\)|(?:"([^"]+)"|[^\s()]+))/g`

- `(` and `)` are separate tokens, even with no spaces around them.
- `"quoted phrase"` becomes a single **Term** token containing the phrase, without the quotes. Quoted text is never treated as an operator or prefix, so `"and"` searches for the literal text "and".
- Everything else is split on whitespace and parentheses.
- Unquoted tokens are checked case-insensitively for the operators `and`, `or`, `not`.
- Prefixes (case-sensitive, lowercase):

| Token | Node | Matches when |
|---|---|---|
| `list:Name` | List | `game.uid` is in the localStorage list `Name`. The lookup key is sanitized and lower-cased, so matching is case-insensitive. An empty name matches nothing. |
| `tag:name` | Tag | `game.tags` contains `name` exactly (**case-sensitive**). |
| `id:anchor` | Id | `game.anchorName === anchor` exactly. Aliases are **not** checked. |
| `uid:N` | Uid | `parseInt(game.uid) === parseInt(N)`. |
| `uids:1,2,3` | Uids | `game.uid` is in the list. |
| anything else | Term | Case-insensitive substring match on any string field or string-array item, excluding `related` and `uid`. This includes `anchorName`/`anchorAliases` (see [§4](#4-derived--runtime-only-fields)). |

**⚠ Quirk:** Because tokens split on whitespace, `tag:` can't target tags that contain spaces (`tag:blank challenge` becomes `tag:blank` AND the term `challenge`). `tag:"blank challenge"` doesn't work either: the quote regex only matches when the token starts with a quote. Users have to rely on the tag filter buttons for those tags.

### 6.2 Grammar and precedence

Precedence from lowest to highest: **OR < AND < NOT**. Parentheses group.

The parser is recursive-descent style on the flat token list:

1. Find the **right-most** `or` outside any parenthesized group. Split there into `Or(left, right)`.
2. Otherwise, find the right-most `and` outside groups. Split into `And(left, right)`.
3. Otherwise, if the first token is `not`, return `Not(parse(rest))`.
4. Otherwise, if the span is exactly `( … )`, parse the inside.
5. Otherwise, if it's a single token, return that terminal.
6. Otherwise, if there's a group inside, parse only the first group's contents. **⚠ Quirk:** anything outside that group is dropped, e.g. `foo (bar)`.
7. Otherwise, fall back to **implicit AND**: `And(firstToken, parse(rest))`. So `justification animal` means `justification AND animal`.

An empty or whitespace-only search gives an `Everything` node, which matches all games.

### 6.3 Evaluation with missing operands (lenient)

- `And` with a missing side treats that side as `true`.
- `Or` with a missing side treats that side as `false`.
- `Not` with a missing operand returns `false`.
- An empty `Term` matches everything.

So dangling operators like `foo and` or `or bar` still produce sensible results while the user is typing.

### 6.4 Examples (from `CHANGELOG.md`)

| Query | Meaning |
|---|---|
| `justification and not animal` | Has "justification", doesn't have "animal". |
| `emotion or attitude and game` | `emotion OR (attitude AND game)` |
| `(emotion or attitude) and game` | Has game, plus emotion or attitude. |
| `yes and` | Contains "yes" (the trailing `and` has no right side, so it counts as true). |
| `"yes and"` | Contains the exact phrase "yes and". |
| `tag:audience and not tag:justification` | Tag-based query. |
| `list:Favorites` | Games in the user's Favorites. |
| `uid:113` | Permalink to one game. |
| `id:monarchgame` | Legacy anchor lookup, used by related-game links. |

---

## 7. Tag filter

- The tag buttons list every distinct tag across all games (trimmed, deduplicated, sorted with `localeCompare`).
- Each button cycles through **three states** on click:
  1. **empty** (grey border): ignored.
  2. **checked** (green, `#4caf50`): include only games with this tag. The tag goes into `yesTags`.
  3. **unchecked** (red, `#f44336`): exclude games with this tag. The tag goes into `noTags`.
  4. Back to empty.
- Help text under the buttons: "Green to include only games with this tag. Red to exclude games with this tag."
- Matching: the game must have **every** yes-tag and **none** of the no-tags. This is combined with AND against the search expression.
- State is kept in the URL (`yesTags`, `noTags`), so it survives reloads and can be shared.

---

## 8. Lists and favorites

All of this is stored per browser in `localStorage`. It isn't part of the database.

### 8.1 Storage format

- Key: `"gamelist-" + sanitizedName.toLowerCase()`
- Value: `JSON.stringify({ name: sanitizedName, games: number[] /* uids */ })`
- Name sanitizing (`GameList.SanitizeGameName`): runs of whitespace become `-`, then everything except `[A-Za-z0-9-]` is removed. For example, "My Warm-ups!" becomes `My-Warm-ups`.
- Favorites is just the list named `Favorites` (key `gamelist-favorites`).
- Listing the user's lists means scanning every `localStorage` key that starts with `gamelist-`.

A React version should keep reading this format, so users on the same origin don't lose their existing favorites and lists. If the React app runs on a different origin, it can't reach this storage at all; consider an import-via-share-link path.

### 8.2 Favorites (heart button on each card)

- A grey heart means not a favorite. A red heart means favorite. Hovering shows plus/minus variants.
- Tooltip: "Add to favorites" / "Remove from favorites".
- Clicking toggles the game's UID in the `Favorites` list and refreshes the Lists panel.
- The Favorites list only appears in storage (and in the panel) after the first heart click, and it stays there even when empty.

### 8.3 "Add to List" button on each card

This opens a small popup menu positioned at the button:

- **"Add to New List..."** prompts for a name, adds the game to that list (creating the list, or appending if a list with that sanitized name already exists), then closes the menu.
- Below that, one **checkbox per existing list** (Favorites excluded), checked if the game is already in it. Toggling a checkbox adds or removes the game immediately.
- Clicking outside the menu closes it.
- **⚠ Quirk:** `addGame` doesn't check for duplicates, so "Add to New List..." with an existing name can add the same UID twice. The Lists panel isn't refreshed after changes made in this menu.

### 8.4 "Lists and Favorites" panel

- If there are no lists, it shows: "You don't have any lists or favorited games. Click some 💖's, add a game to a new list, or create a list from a search using the button below."
- Otherwise it shows one row per list, with **Favorites first**:
  - **List-name button.** Clicking it sets the search to `list:<Name>` and highlights the button in green. Clicking the highlighted button again clears the search. The highlight is shown when the current search is exactly one `list:` term matching this list (case-insensitive).
  - **Delete button** (trash icon, not shown for Favorites). Asks "Are you sure you want to delete the list "{name}"?" and removes the key.
  - **Share button** (send icon). Builds a link that encodes the list's UIDs (see [§9.2](#92-list-share-links)), copies it to the clipboard, and shows an `alert` with the link.
- **"Create List From Current Games"** button (below the rows) prompts for a name and saves a list of the UIDs of every game currently displayed. **⚠ Quirk:** this silently overwrites an existing list with the same sanitized name.
- **⚠ Quirk:** Clicking a list button calls `updateSearchString(…, true)`, which re-renders the games but doesn't update the URL. The URL only updates on the next search-box edit or blur, or on a tag change.

---

## 9. Sharing and URL parameters

### 9.1 Query parameters

| Param | Read on load | Written | Meaning |
|---|---|---|---|
| `dbId` | yes | preserved (never removed) | `2001` loads the legacy database. Any other value, or none, loads the current one. |
| `search` | yes | yes | Raw search string. Written as `trim().toLowerCase()`. **⚠ Quirk:** lower-casing breaks case-sensitive `tag:` values that contain uppercase letters (none exist today). |
| `uid` | yes | yes | Permalink to one game. On load it becomes the search `uid:N`, and that text appears in the search box. When saving, if the search contains `uid:(\d+)` **anywhere**, only `uid=N` is written and the rest of the search is lost. |
| `uids` | yes | **never removed** | A shared list (bitmask-encoded, see below). On load it becomes the search `uids:1,2,3,…`. |
| `yesTags` | yes | yes | Included tags, joined with `;`. |
| `noTags` | yes | yes | Excluded tags, joined with `;`. |
| `edit` | yes | preserved | `1` turns on edit mode. |
| `list` | no | removed | Leftover. Deleted on write, never set. |

Load priority: `search` > `uid` > `uids`. Tags are always read.

URL writes use `history.pushState`, so every update adds a browser history entry. The app doesn't listen for `popstate`, so the Back button changes the URL without changing what's on screen. A React Router version should fix this.

### 9.2 List share links

`Util.EncodeIntegerSet(set)`:

1. `numBytes = ceil((max(uid) + 1) / 8)`.
2. For each byte `i`, set bit `j` if UID `i*8 + j` is in the set (so UID 0 is bit 0 of byte 0).
3. Turn each byte into a character with `String.fromCharCode(...bytes)` (0–255), then run `encodeURIComponent` on that string. Bytes ≥ 128 end up UTF-8 percent-encoded.

Link format: `{origin}{pathname}?{dbId=… &}uids={encoded}`

`Util.DecodeIntegerSet(str)`: `URLSearchParams.get('uids')` has already percent-decoded the value once, and the code then calls `decodeURIComponent` on it **again** before reading the char codes back into bits.

**⚠ Quirk / bug:** The second decode throws a `URIError` or corrupts the data if any decoded byte is `0x25` (`%`), i.e. UIDs `8k+0, 8k+2, 8k+5` present and `8k+1,3,4,6,7` absent in some byte, and the following characters happen to look like hex. An empty list encodes to `""`, because `Math.max()` of nothing is `-Infinity`. A React version must be able to **decode existing links**. For new links, prefer something robust like base64url of the same bitmask, a versioned format (e.g. `uids2=`), or a plain comma list.

### 9.3 Single-game share (send icon on each card)

This opens a popup with a read-only text box holding `{origin}{pathname}?{dbId=… &}uid={uid}` and a **Copy Link** button, which copies the link and shows an alert "Link copied to clipboard!". Clicking outside closes the popup.

### 9.4 Related-game links

Each related name becomes an `<a href>` to the current URL with `search=id:{anchor(name)}`, so it's a full page navigation. Because `id:` only matches `anchorName`, links to renamed games find nothing. The unused helper `Playbook.getGameIdFromSearchTerm()` does check aliases; the React version should resolve related names against names **and aliases**, or better, store related links as UIDs.

---

## 10. Game card rendering

`createGameCardDiv(game, editMode)` builds each card:

```
┌───────────────────────────────────────────────────────────┐
│ {name}                          [♥] [+list] [share] [edit]│  ← title bar (edit only with ?edit=1)
├───────────────────────────────────────────────────────────┤
│ DESCRIPTION  description (md)               ← always       │
│ NOTES        notes (md)                     ← if present   │
│ VARIATIONS   ‣ variation 1 (md)             ← if present   │
│              ‣ variation 2 (md)                            │
│ ALIASES      [alias] [alias]                ← if present   │
│ TAGS         [tag] [tag] [tag]              ← if present   │
│ RELATED GAMES [link] [link]                 ← if present   │
│ CREATEDBY    creator (md)                   ← if present   │
└───────────────────────────────────────────────────────────┘
```

- Card DOM `id` = `anchorName`, so `#monarchgame` page anchors work.
- Every row, including description, has a small header (`x-small` font) above its content, which is indented 10pt. The header text is the literal lower-case string `description`, `notes`, `variations`, `aliases`, `tags`, `related games` or `createdBy` (the diagram shows them in capitals only for readability).
- Markdown fields (`description`, `notes`, each `variation`, `createdBy`) go through `marked` and are inserted with `innerHTML` **without sanitizing**. That's fine for trusted repo data, but **a public editor must sanitize** (e.g. DOMPurify, or `react-markdown` without raw HTML).
- Aliases are pink-bordered chips (`#efbfee`). Tags are green chips (`#cdeedc` background, `#7eaa92` border). Related links are blue-bordered chips (`#888eba`, hover `#a1b7e7`).
- Tag chips on cards are **not** clickable. (Making them toggle the filter would be a cheap improvement.)
- Hovering a card gives it a light grey (`#f0f0f0`) background. Title buttons show their `title` text as a CSS tooltip.

---

## 11. Editor functionality (current)

Edit mode is turned on with `?edit=1`. It's hidden: there's no UI link to it.

### 11.1 What it adds

- An **edit (pencil)** button on each card's title bar.
- **Download Json** and **Download Diff Json** buttons next to the search box.
- There is **no "New Game" button, no delete, and no contributors or version editing** in the UI.

### 11.2 Edit flow

1. **Edit overlay** (a full-screen modal) with fields:

| Label | Control | Field | Serialization |
|---|---|---|---|
| Name: | text input | `name` | trimmed |
| Description: | auto-growing textarea | `description` | trimmed |
| Notes: | auto-growing textarea | `notes` | trimmed |
| Variations (one per line): | auto-growing textarea | `variations` | split on `\n`, each item trimmed |
| Aliases (semi-colon-separated): | text input | `aliases` | split on `;`, trimmed |
| Related Games (semi-colon-separated): | text input | `related` | split on `;`, trimmed |
| Tags (semi-colon-separated): | text input | `tags` | split on `;`, trimmed |
| Created By: | textarea | `createdBy` | trimmed |

   Buttons: **Preview Changes** and **Cancel**. Empty list fields become `null`.

   **⚠ Quirk:** Because variations are split on newlines, a single variation can't contain multiple paragraphs or a Markdown list, even though the viewer would render one. Some existing variations are long single-line paragraphs for this reason.

2. **Preview overlay** ("Confirm Changes"): shows the new card side by side with the old card ("Edited Details" vs. "Old Details"). If no existing game has the *new* name, it shows only "New Game". Buttons: **Confirm** and **Return to Edit**. Return to Edit reopens the edit form with the entered values.

3. **Confirm**: finds the existing game **by name** (old name if it's an edit), or pushes a new `{}` if none. It assigns every field (empty becomes `null`), recomputes `anchorName`/`anchorAliases`, closes the overlay, and re-renders. Changes stay in memory only. A reload loses them.

**⚠ Quirk / bug — renames duplicate games:** `previewGameEdit()` looks up `oldDetails` using the **new** name. If you change a game's name, the old game isn't found, the preview says "New Game", and Confirm **adds a second game** (with no `uid` until export) instead of renaming. To rename today you have to edit the JSON by hand. The old UID is also lost for the duplicate. The React editor should key edits by `uid`.

**⚠ Quirk:** The new-game path (via the rename bug) produces a game with no `uid`. It gets one from `nextUid` only when `sanitizeDatabase()` runs during export.

### 11.3 Download Json

Runs `Playbook.exportJson()` (see [§12](#12-export-sanitizing-and-versioning)) and downloads `living_playbook.json`. **⚠ Quirk:** This mutates in-memory state: every click bumps `version.minor` again and re-sorts and sanitizes the live data.

### 11.4 Download Diff Json

Re-fetches the original file from the same URL, computes `PlaybookDiff.getDiff(edited, original)`, and downloads `living_playbook_diff.json` (see [§13](#13-diff-format)). The edited data is **not** sanitized first, unlike Download Json.

---

## 12. Export: sanitizing and versioning

`Playbook.sanitizeDatabase()` runs as part of `exportJson()`:

1. **UIDs:** A game with a missing or non-numeric UID, a UID of `-1`, or a UID that duplicates an earlier game's gets a new one from `nextUid` (which is then incremented). `nextUid` is raised to `max(uid)+1` if needed.
2. **Strings** (`name`, `createdBy`, `description`, `notes`) are trimmed. Falsy values become `undefined` and are dropped from the JSON.
3. **Arrays** (`variations`, `aliases`, `related`, `tags`) are cleaned: empty and whitespace-only items are removed, and the rest are **sorted with `localeCompare`**. Non-arrays become `undefined`.
4. **Games** are sorted by `name` with `localeCompare`.
5. **Related names** that don't match an existing game name are logged to the console. Nothing blocks the export.
6. **Contributors** are sorted by the last whitespace-separated word.

Then `exportJson()`:

7. Increments `version.minor`, zero-padded to 4 digits. `year` and `major` are changed by hand for releases.
8. Serializes with 2-space indent, dropping `anchorName`/`anchorAliases` (case-insensitive key match).

Key order within each game follows object insertion order. Games edited in the UI get the order `name, createdBy, description, notes, variations, aliases, related, tags, uid`. Untouched games keep their file order (usually `name, description, notes, variations, tags, uid, aliases, related`). A React exporter should use a **canonical key order** to keep git diffs clean.

Note that `scripts/sort_playbook.py` writes with **4-space** indent, while the web exporter uses **2-space**. Pick one.

### Release process (inferred from repo history)

- Maintainers edit via `?edit=1`, download, and commit `src/living_playbook.json`. Or they edit the JSON by hand, or send pull requests on GitHub.
- For a release, bump `major` (reset `minor` to `0000`), copy the file to `src/living_playbook.<year>.<major>.<minor>.json`, and run `scripts/generate_changelog.py old.json new.json` to draft the `CHANGELOG.md` entry, which is then edited by hand.

---

## 13. Diff format

`PlaybookDiff.toJson()` output:

```jsonc
{
  "oldVersion": { "year": "2025", "major": "0002", "minor": "0002" },
  "newGames": [ /* full Game objects */ ],
  "delGames": [ /* full Game objects */ ],
  "modifiedGames": [
    {
      "uid": 113,                                    // always present
      "notes": { "old": "…", "new": "…" },           // one entry per changed field
      "aliases": { "old": ["King Game"], "new": ["King Game", "Queen Game"] }
    }
  ],
  "newContributors": ["lower-cased name"],
  "delContributors": ["lower-cased name"]
}
```

- Games are matched by `uid`. A game counts as "modified" if `JSON.stringify` differs. Its per-field entries include only fields where the *normalized* values differ: empty string, empty array, empty object, `null` and missing are all treated as the same.
- Only keys present on the **new** game are compared, so a field deleted entirely from the new game isn't reported. (In practice the edit UI sets it to `null`, so it is reported.)
- Contributor comparison is case-insensitive, and names are output **lower-cased**.
- The diff includes the runtime fields `anchorName`/`anchorAliases` in `newGames`/`delGames` objects. They aren't stripped.

**⚠ Bug — added/removed are swapped:** In `getDiff(playbookNew, playbookOld)`, games found only in the *new* playbook are pushed to `diff.removed`, and games only in the *old* one go to `diff.added`. These are then passed into the constructor as `newGames = diff.added` and `delGames = diff.removed`. The same inversion applies to contributors. The result: **`newGames` lists deleted games and `delGames` lists added games.** Per-field `old`/`new` values in `modifiedGames` are correct.

`PlaybookDiff.applyToPlaybook(playbook)` exists but is **never called**. It has problems of its own: it expects `modifiedGames` to be plain `{uid, field:{old,new}}` objects, which is only true after parsing the JSON, not for in-memory `GameDiff` instances. It also doesn't check `old` values for conflicts.

The diff format is the natural starting point for a "submit a change for review" workflow: a small, self-describing patch keyed by UID. If you adopt it, fix the swap, strip runtime fields, and add conflict detection (compare `old` with the current value before applying).

---

## 14. Maintenance scripts

All in `scripts/`, Python 3, run by hand.

| Script | What it does |
|---|---|
| `assign_uids.py` | Run from the repo root. For every `src/living_playbook*.json` except the main file, gives each game the UID of the **same-named** game in `living_playbook.json` (or `-1` if not found). Reports mismatches. Writes 2-space JSON. |
| `generate_changelog.py old.json new.json` | Compares by UID and prints a Markdown changelog: Games Added, Games Removed, and Games Updated, with per-field "Added/Updated/Removed" lines and "Renamed from 'X' to 'Y'". (Bug: removed games are looked up in the new file, which crashes when there are any.) |
| `sort_playbook.py` | Run from `scripts/`. Sorts the games in the main and 2001 files by name (Python's sort order differs from `localeCompare`, so this and the web exporter disagree on order). Writes 4-space JSON. |
| `update_game_variations.py` | One-time migration: copied `gameVariations` from the 2001 file into the current file. Historical; the field is now `variations`. |

---

## 15. Visual design notes

- **Fonts:** Montserrat for body text and Fondamento for the page title, both from Google Fonts.
- **Page:** light blue page border (`#e9eef8`), a white rounded "inner body" card with a soft shadow, 20px padding.
- **Icons** (`src/img/icons/`), each in a resting and hover color:
  - heart: gray, red (favorited), plus and minus (hover states)
  - add-to-playlist: gray and black
  - send-to (share): gray, black and blue
  - edit: gray and black
  - trash: red and black
- **Favicons** are in `src/img/favicon/`. The logo is `src/img/UPLogo.svg`.
- Letter dividers and the search description use a "horizontal rule with label" style: grey (`#aaaaaa`) lines with the label centered.

---

## 16. Known quirks and bugs (summary)

| # | Area | Issue |
|---|---|---|
| 1 | Editor | Renaming a game creates a duplicate instead of renaming, because edits are keyed by name. |
| 2 | Editor | There's no UI to add, delete, or reorder games, or to edit contributors or version. |
| 3 | Editor | Variations are split on newlines, so a variation can't be multi-paragraph. |
| 4 | Export | Variations are sorted alphabetically, so authored order is lost. |
| 5 | Export | Each Download Json click increments `minor` again and mutates live data. |
| 6 | Diff | `newGames`/`delGames` and `newContributors`/`delContributors` are swapped. |
| 7 | Diff | Runtime fields leak into the diff. `applyToPlaybook` is unused and broken for in-memory diffs. |
| 8 | Search | `tag:` can't match tags containing spaces, and it's case-sensitive while the URL lower-cases the search. |
| 9 | Search | `id:` ignores aliases, so related links to renamed games return nothing (e.g. "Panel Experts Endowment"). |
| 10 | Search | A query like `foo (bar)` silently drops `foo`. |
| 11 | URL | `uid:N` anywhere in the search replaces the whole search with `uid=N` in the URL. |
| 12 | URL | The `uids` param is never removed. There's no `popstate` handling, and `pushState` runs on every update. |
| 13 | URL | List-button clicks don't update the URL. |
| 14 | Sharing | The bitmask decoder double-decodes and can throw on some UID sets. |
| 15 | Lists | "Add to New List" doesn't dedupe. "Create List From Current Games" overwrites silently. The popup doesn't refresh the panel. |
| 16 | Security | Markdown is rendered with raw `innerHTML` and no sanitizing. |
| 17 | Code | `PageMode.Uids` is referenced but never defined. `pageMode` is otherwise unused. |
| 18 | Data | Duplicate contributor ("Paul Killam"). Tag near-duplicates (`toss-up`/`tossup`). One dangling related name. The 2001 file has a duplicate UID 58 ("Experts" / "Panel Experts Endowments") and the misspelled `contributers` key. |

---

## 17. Recommendations for the React version

These are suggestions, not requirements. They're here because they affect data-format decisions you'll make early.

**Viewer parity checklist**

- [ ] Load current (default) and 2001 (`dbId=2001`) databases, with a header that shows the edition and `major.minor`.
- [ ] A search box using the exact search language in [§6](#6-search-language), with live filtering.
- [ ] A three-state tag filter from [§7](#7-tag-filter), with tags derived from the data.
- [ ] A search description bar with the result count.
- [ ] An alphabetized list with letter dividers.
- [ ] Game cards with every field and its rendering rule from [§10](#10-game-card-rendering), with Markdown **sanitized**.
- [ ] Favorites, named lists, add-to-list menu, create list from current results, delete list, share list — reading the existing `localStorage` format from [§8.1](#81-storage-format).
- [ ] Single-game permalink (`?uid=`) and list links (`?uids=`), able to decode old links.
- [ ] Related-game links.
- [ ] URL state (`search`, `yesTags`, `noTags`, `uid`, `uids`, `dbId`) with working Back/Forward.
- [ ] Footer with the license text, the copyright notice from the original document (required by its terms), a link to the PDF, a link to the 2001 edition, and contributors.
- [ ] A print stylesheet that hides the controls.

**Editor design considerations**

- **Key everything by `uid`.** Allocate new UIDs from `nextUid` when a game is saved, so the review system sees stable IDs. Handle two pending submissions that grab the same `nextUid` (for example, assign the final UID when the change is merged).
- **Submissions as patches.** A corrected version of the diff format in [§13](#13-diff-format) (per-game, per-field `old`/`new`, keyed by UID) works well as the payload for "submit for review". Reviewers can see exactly what changed, conflicts can be detected by comparing `old`, and approved patches can be applied to `living_playbook.json` (e.g. by a bot opening a GitHub pull request, or by your backend writing the file).
- **Structured inputs instead of delimiter strings:** a tag picker suggesting existing tags (to avoid `tossup` vs `toss-up`), an alias chip input, a related-game picker that searches existing games and ideally stores UIDs, and a variations editor with one Markdown editor per variation that keeps order.
- **Validation before submit:** name required and unique (including against other games' aliases), description required, at least one tag, related names resolve, no empty array items.
- **Live preview** that uses the same card component as the viewer, like the current side-by-side "Old vs New" preview.
- **Operations the current app is missing:** add game, delete game (maybe a soft "retired" flag, since shared lists and links point at UIDs), rename with an automatic alias for the old name (the maintainers already do this by hand, e.g. "King Game" became an alias of "Monarch Game"), and editing contributors.
- **Protect the 2001 edition.** Make it read-only in the editor.
- **Deterministic output:** a canonical key order, a consistent indent, games sorted by name, and arrays sorted except `variations`. That keeps pull-request diffs of `living_playbook.json` minimal and reviewable.
- **Versioning:** bump `minor` once per applied change set, not once per download, and keep the snapshot-and-changelog process for `major` releases.
