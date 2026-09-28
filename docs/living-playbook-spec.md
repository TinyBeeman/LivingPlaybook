# The Living Playbook — Viewer & Data Specification

This document describes how the public Living Playbook viewer (`src/index.html` + `src/playbook.js`, served at unexpectedproductions.org/playbook) works and the format of its data files.

**Editing no longer happens here.** It moved to UPTime (Documents → Living Playbook): signed-in users propose changes, reviewers accept them, and UPTime exports `living_playbook.json` into this repo through a pull request. UPTime's design is in its `docs/living-playbook-editor.md`, which cites this spec as "spec §N". Sections 11–14 therefore remain as short stubs, so those section numbers stay stable. Planned viewer work is in [`viewer-cleanup-plan.md`](viewer-cleanup-plan.md).

The data stats below are for version `2026.0001.0003` of `living_playbook.json`. Where the current code has quirks or bugs, they are called out under **⚠ Quirk**. §16 summarizes them and tracks which are fixed.

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
11. [Editor (moved to UPTime)](#11-editor-moved-to-uptime)
12. [Export and versioning (moved to UPTime)](#12-export-and-versioning-moved-to-uptime)
13. [Diff format (removed)](#13-diff-format-removed)
14. [Maintenance scripts (removed)](#14-maintenance-scripts-removed)
15. [Visual design notes](#15-visual-design-notes)
16. [Known quirks and bugs (summary)](#16-known-quirks-and-bugs-summary)
17. [The React version (built in UPTime)](#17-the-react-version-built-in-uptime)

---

## 1. Architecture overview

- **Static, front-end only.** There is no backend. `index.html` loads `styles.css`, `marked.min.js` (a Markdown renderer), and `playbook.js`. On `DOMContentLoaded` it calls `playbookPage.onPageLoad()`.
- **One JSON database per page load.** The page fetches either `living_playbook.json` (the default, "Online" edition) or `living_playbook_2001.json` (the legacy edition, selected with `?dbId=2001`). Fetches use `{ cache: 'no-store' }`.
- **All user state lives in the URL and in `localStorage`.** Search/tag state goes into the query string. Favorites and user lists go into `localStorage`.
- **Read-only.** The viewer has no editor. `living_playbook.json` is written by UPTime's exporter, and `living_playbook_2001.json` is maintained by hand (§2).
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
| `Playbook` | Loads data, extracts tags, searches. |
| `PlaybookPage` | Everything in the UI: DOM building, event handling, URL sync. |

---

## 2. Data files

All data files live in `src/`.

| File | Purpose | Loaded by app? |
|---|---|---|
| `living_playbook.json` | **Current, up-to-date database.** Written by UPTime's exporter in a canonical format (see UPTime's `docs/living-playbook-editor.md` §8.1). Direct PRs to it are still possible, and UPTime's re-import picks them up, but they should keep that format. | Yes (default) |
| `living_playbook_2001.json` | **Legacy database.** A faithful copy of the original 2001 Living Playbook (see `Living-Playbook.pdf`). The original document's terms require its **information** to stay available: names, descriptions, variations, tags and cross-references stay as they were in 2001. Obvious data bugs (like a duplicate UID) may be fixed and its format normalized, by hand in this repo. It gets no content improvements, and UPTime never imports or writes it. | Yes, with `?dbId=2001` |
| `living_playbook.2025.0001.0000.json`, `living_playbook.2025.0002.0000.json`, `living_playbook.2026.0001.0000.json` | **Archived release snapshots**, named `living_playbook.<year>.<major>.<minor>.json`. Frozen; never edited. | No |
| `Living-Playbook.pdf` | The original source document (linked from the footer). | Linked only |

Stats for the current files:

| File | version | games | nextUid | tags in use |
|---|---|---|---|---|
| `living_playbook.json` | 2026.0001.0003 | 284 | 293 | 54 |
| `living_playbook_2001.json` | 2001.0001.0001 | 276 | 287 | 41 |

UIDs line up across files by game identity: a game keeps its UID across editions and renames (for example, "King Game" in 2001 and "Monarch Game" now are both UID 113). UIDs were originally copied across by exact name match (a since-deleted `scripts/assign_uids.py`). A few 2001 UIDs no longer line up with the main file (see §16 #18).

---

## 3. Data schema

### 3.1 Top-level object

```jsonc
{
  "version": { "year": "2026", "major": "0001", "minor": "0003" },
  "contributors": ["Kris Anderson", "Tony Beeman", "..."],
  "notes": "This is the Online Living Playbook, with ongoing updates.",
  "license": "The Online Living Playbook © 2026, maintained by [Tony Beeman](...) ...",
  "nextUid": 293,
  "games": [ /* Game objects */ ],
  "glossary": [ /* Glossary entries (optional) */ ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `version` | object of **strings** | yes | `year` is 4 digits. `major` and `minor` are zero-padded to 4 digits (`"0002"`). The header shows `Version {year}.{major}.{minor}` without the padding, e.g. `Version 2026.1.3`. UPTime's exporter bumps `minor` once per export that has changes, bumps `major` for a release, and restarts at `<year>.0001.0000` in a new calendar year. |
| `contributors` | string[] | no | Full names. Shown in the footer as a comma-separated list. On export they are sorted by the **last word** of the name and de-duplicated case-insensitively. (The 2001 file still lists "Paul Killam" twice.) |
| `notes` | string | no | Short description of the database. **The app never displays it.** |
| `license` | string (Markdown) | no | License text. **The app never displays it.** The footer license text is hard-coded in `playbook.js`. **⚠ Quirk:** so metadata edits made in UPTime never reach the page, e.g. the file says © 2026 but the footer says © 2025. |
| `nextUid` | integer | yes (in practice) | The next free UID. Must be greater than every existing `uid`. If it's missing or not a number, the code falls back to `1`. |
| `games` | Game[] | yes | See below. The file is sorted by name (`localeCompare`) on export, but the app re-sorts on display anyway, so file order doesn't matter. |
| `glossary` | GlossaryEntry[] | no | Terms and definitions (see [§3.4](#34-glossary-entry)). Missing means empty; the 2001 file has none. Sorted by term on export. |

The 2001 file also has a legacy key `"contributers"` (misspelled) holding one string. It isn't used, and its `contributors` entries include annotations like `"Tony Beeman (Post 2001 Technical Updates)"`.

### 3.2 Game object

```jsonc
{
  "uid": 113,
  "name": "Monarch Game",
  "description": "One improviser is the monarch ...",
  "notes": "If a servant makes mistakes ...\n\nMonarchs are annoyed by ...",
  "variations": [
    "Play it as a long form.",
    { "name": "Hero/Chorus", "description": "Improvisers stand in a circle ..." }
  ],
  "aliases": ["King Game"],
  "related": ["Pecking Order"],
  "tags": ["exercise", "game", "shortform"],
  "createdBy": "Keith Johnstone"
}
```

| Field | Type | Required | Rendering | Count in current file |
|---|---|---|---|---|
| `uid` | integer ≥ 1 | yes | Not shown. Used for permalinks, lists, and diffs. | 284/284 |
| `name` | string | yes | Plain text title. **Must be unique**, because `related` references games by name. | 284/284 |
| `description` | string (Markdown) | yes | Markdown | 284/284 |
| `notes` | string (Markdown) | no | Markdown, with a "notes" header | 33 |
| `variations` | (string \| object)[] | no | Each item is a plain Markdown string (an unnamed variation) or `{ "name", "description" }` (a named one; either key may be left out, but not both). Rendered with a `‣` bullet; a name is shown in bold before the text. See the note below. | 75 |
| `aliases` | string[] | no | Plain-text chips | 36 |
| `related` | string[] (game **names**) | no | Links that run the search `id:<anchor of name>` | 44 |
| `tags` | string[] | effectively yes | Plain-text chips. Also drive the tag filter. | 283 (only "Song in a Style" has none) |
| `createdBy` | string (Markdown) | no | Markdown, with a "createdBy" header | 4 |

Conventions and constraints:

- **Missing vs. empty.** Optional fields are omitted when empty. The exporter strips empty strings and empty arrays.
- **Key order and sorting.** Each game's keys are in the order `name, description, notes, variations, aliases, related, tags, createdBy, uid`. `aliases`, `related` and `tags` are sorted and de-duplicated. `variations` keep their authored order. The 2001 file doesn't follow this yet.
- **Named variations.** An unnamed variation is always written as a plain string, never `{ "description": … }`, so files without names (including the 2001 file) look exactly as they always have. Named variations use the keys `name` then `description`. Many older variations carry a name informally as a `Name: text` prefix; UPTime can turn those into real names through reviewed proposals.
- **Markdown.** Multi-line text uses `\n`, and paragraphs use `\n\n`. Lists (`- item`), `*italic*`, `**bold**` and links all appear in the data. Strings without a newline are rendered inline, so no `<p>` wrapper.
- **Tags** are lower-case free text, and some contain spaces (`"blank challenge"`, `"group game"`, `"stage picture"`). There's no controlled vocabulary. UPTime has a bulk rename/merge tool, used in 2026.0001.0001 to merge `tossup` into `toss-up` and rename `animal`, `pop-culture` and `yes-and`. The tag list in the UI is built from whatever tags appear in the data.
- **Related** entries are game names, not UIDs, so they break when the target is renamed. Currently `"Panel Experts Endowment"` (in Experts) is a typo for the game "Panel Expert Endowment". UPTime stores `related` as UIDs internally and writes the current names on export, so renames no longer break links in the main file.
- **Name characters.** Names can include punctuation and symbols (`In A _____, With A ____, While _____`, `™`). Every current name starts with a letter A–Z, which matters for the letter dividers.

Current tag vocabulary (54 tags, with counts):
`active 6, animals 1, audience 11, beginner 1, bell 9, blank challenge 2, blocking 1, character 3, cultural 13, dance 3, directed 25, emotions 1, endowment 41, environment 9, exercise 33, free association 2, game 54, gibberish 12, group game 2, guessing 18, historical 2, justification 30, list 1, longform 4, monologue 10, musical 16, narrated 14, narrative 12, news 2, numbers 4, physical 33, pimping 6, pop culture 6, props 16, risky 1, scene 204, shortform 257, silence 8, sound 5, spectacle 2, stage picture 1, status 6, styles 14, switch 2, teamwork 3, tech 10, timed 32, timejump 9, toss-up 9, transitions 2, verbal 31, warm-up 9, wtf 3, yes and 2`

### 3.3 Suggested TypeScript types

```ts
interface PlaybookVersion { year: string; major: string; minor: string } // zero-padded strings

interface Game {
  uid: number;
  name: string;
  description: string;       // markdown
  notes?: string;            // markdown
  variations?: Variation[];
  aliases?: string[];
  related?: string[];        // game names
  tags?: string[];
  createdBy?: string;        // markdown
}

type Variation =
  | string                                    // unnamed; markdown
  | { name?: string; description?: string };  // named; description is markdown

type GlossaryRelated =
  | string                                    // a game name
  | { game: string; variation: string }       // a named variation of a game
  | { term: string };                         // another glossary term

interface GlossaryEntry {
  uid: number;                // shares the uid / nextUid counter with games
  term: string;
  definition: string;         // markdown
  aliases?: string[];
  related?: GlossaryRelated[];
}

interface PlaybookFile {
  version: PlaybookVersion;
  contributors?: string[];
  notes?: string;
  license?: string;          // markdown
  nextUid: number;
  games: Game[];
  glossary?: GlossaryEntry[];
  contributers?: string;     // legacy typo, 2001 file only; ignore
}
```

### 3.4 Glossary entry

```jsonc
{
  "term": "Endowment",
  "definition": "Giving another player a trait or fact that they then play.",
  "aliases": ["Endow"],
  "related": [
    "Adjective Scene",
    { "game": "Actor Switch", "variation": "Blind Switch" },
    { "term": "Offer" }
  ],
  "uid": 301
}
```

- Keys are in the order `term, definition, aliases, related, uid`. `aliases` are sorted and de-duplicated; `related` keeps its authored order.
- `uid`s come from the same counter as games, so a uid is unique across games and terms.
- `term` must be unique among terms (a term may share a name with a game).
- `related` refers to games and terms **by name**, and to a variation by its game's name plus the variation's name, so a link survives reordering the variations. UPTime stores these as uids and rewrites the current names on export.

---

## 4. Derived / runtime-only fields

When the database loads, `Playbook.loadFromURL()` adds these to every game in memory. They exist only in memory:

- `anchorName`: `name.replace(/[^A-Za-z0-9]+/g, '').toLowerCase()`. For example, `"Word-at-a-Time Story"` becomes `"wordatatimestory"`. It's used as the card's DOM `id` and as the target of `id:` searches and related-game links.
- `anchorAliases`: the same transform applied to each alias.
- Glossary entries get `anchorName = "term-" + anchor(term)`. The hyphen can't appear in a game's anchor, so term and game ids never clash (`id:term-endowment`).
- `Playbook.termMatcher`: one case-insensitive regular expression over every term and alias, longest first, whole words only.

**⚠ Quirk:** Free-text search looks at *all* string and array fields except `related` and `uid`, and that includes `anchorName` and `anchorAliases`. So searching `monarchgame` finds "Monarch Game". It's mostly harmless. (UPTime's viewer doesn't do this.)

---

## 5. Viewer functionality

### 5.1 Page layout (top to bottom)

1. **Header**: the Unexpected Productions logo (`img/UPLogo.svg`), then the title and version:
   - Title: `The (Online) Living Playbook`, or `The (2001) Living Playbook` when `dbId=2001`.
   - Version line: `Version {year}.{major}.{minor}`, without zero-padding (e.g. `Version 2026.1.3`).
   - Subtitle on the right: `The Unexpected Productions Improv Game List`.
2. **Control pane** (hidden when printing):
   - **Search box** (`type="search"`, placeholder "Search games...").
   - **"Show:"** toggle buttons: Games, Variations and Glossary (see [§5.6](#56-show-games-variations-glossary)). Variations and Glossary are hidden when the edition has no named variations or no glossary; the whole row is hidden when it has neither.
   - **"Filter By Tags"**: a collapsible section, collapsed by default.
   - **"Lists and Favorites"**: a collapsible section, collapsed by default.
3. **Search description bar**: a horizontal rule with a label describing the current query and result count (see [§5.3](#53-search-description)).
4. **Game list**: game cards sorted by name (`localeCompare`), with a letter divider (`A`, `B`, …) before the first game of each new first letter (case-insensitive). With Variations on, entries for named variations are sorted in among them. With Glossary on, a "Glossary" section with its own letter dividers follows the games.
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

When all three are empty, it shows `All Games, Exercises and Formats` (or `The Glossary`, or both, depending on what's shown). It ends with a count of each kind that's shown, e.g. ` (284 games, 68 variations, 12 glossary terms)`.

### 5.4 Collapsible sections

Clicking a section header toggles an `active` class and shows or hides the next sibling element. Both sections start collapsed. The header shows a `+` indicator (via CSS `:after`) that becomes `–` when expanded.

### 5.5 Printing

`@media print` hides the control pane, the card buttons and any open glossary overlay, drops the glossary underline, and keeps each card on one page, so a filtered list prints as a clean game list. With Show set to Glossary only, the page prints just the glossary.

### 5.6 Show: Games, Variations, Glossary

- **Games** lists each matching game under its own name (the default).
- **Variations** also lists each matching game once more under the name of each of its **named** variations. That entry is the full game card, titled with the variation name, with an "A variation of *Game*" link, and with that variation highlighted. It has no DOM `id`, so ids stay unique. Unnamed variations never get their own entry.
- **Glossary** adds the glossary section. The search box filters it too (by term, alias or definition); tag filters don't, since terms have no tags.

The buttons are independent: turning Games off while Variations is on lists games only under their variations' names.

### 5.7 Glossary terms in text

After a card is built, the first appearance on that card of each glossary term (or alias) in its description, notes, variations or definition becomes a `<button class="glossary-term">` with a dashed underline. Text inside links, code and variation names is skipped, and a glossary card never marks its own term. Clicking or tapping one opens a single overlay with the term, its definition, "also called", "see also" links and "Open in the glossary". It closes on Escape, the × button, or a click outside. It sits under the term (kept inside the window) and becomes a bottom sheet on screens narrower than 600px.

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

Any change to the viewer must keep reading this format, so visitors don't lose their existing favorites and lists. It's tied to the site's origin: moving the site to a different domain would make it unreachable.

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
| `show` | yes | yes | What's listed: any of `games`, `variations`, `glossary`, joined with `;` (see [§5.6](#56-show-games-variations-glossary)). Omitted means `games` only, and is left out of the URL in that case. Links in the glossary add what their target needs, e.g. a link to a term adds `glossary`. |
| `edit` | no | removed | Leftover from the old editor. Deleted on write, never set. |
| `list` | no | removed | Leftover. Deleted on write, never set. |

Load priority: `search` > `uid` > `uids`. Tags are always read.

URL writes use `history.pushState`, so every update adds a browser history entry. The app doesn't listen for `popstate`, so the Back button changes the URL without changing what's on screen. (Planned fix: `viewer-cleanup-plan.md` §3.1 #12.)

### 9.2 List share links

`Util.EncodeIntegerSet(set)`:

1. `numBytes = ceil((max(uid) + 1) / 8)`.
2. For each byte `i`, set bit `j` if UID `i*8 + j` is in the set (so UID 0 is bit 0 of byte 0).
3. Turn each byte into a character with `String.fromCharCode(...bytes)` (0–255), then run `encodeURIComponent` on that string. Bytes ≥ 128 end up UTF-8 percent-encoded.

Link format: `{origin}{pathname}?{dbId=… &}uids={encoded}`

`Util.DecodeIntegerSet(str)`: `URLSearchParams.get('uids')` has already percent-decoded the value once, and the code then calls `decodeURIComponent` on it **again** before reading the char codes back into bits.

**⚠ Quirk / bug:** The second decode throws a `URIError` or corrupts the data if any decoded byte is `0x25` (`%`), i.e. UIDs `8k+0, 8k+2, 8k+5` present and `8k+1,3,4,6,7` absent in some byte, and the following characters happen to look like hex. An empty list encodes to `""`, because `Math.max()` of nothing is `-Infinity`. Any fix must keep **decoding existing links**. Dropping the second decode does that (planned: `viewer-cleanup-plan.md` §3.1 #14).

### 9.3 Single-game share (send icon on each card)

This opens a popup with a read-only text box holding `{origin}{pathname}?{dbId=… &}uid={uid}` and a **Copy Link** button, which copies the link and shows an alert "Link copied to clipboard!". Clicking outside closes the popup.

### 9.4 Related-game links

Each related name becomes an `<a href>` to the current URL with `search=id:{anchor(name)}`, so it's a full page navigation. Because `id:` only matches `anchorName`, links to renamed games find nothing. The unused helper `Playbook.getGameIdFromSearchTerm()` does check aliases. (Planned fix: resolve related names against names and aliases at load time, `viewer-cleanup-plan.md` §3.1 #9.)

---

## 10. Game card rendering

`createGameCardDiv(game)` builds each card:

```
┌───────────────────────────────────────────────────────────┐
│ {name}                                 [♥] [+list] [share]│  ← title bar
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
- Markdown fields (`description`, `notes`, each `variation`, `createdBy`) go through `marked` and are inserted with `innerHTML` **without sanitizing**. That was fine for trusted repo data, but content now comes from UPTime proposals written by many users, so it should be sanitized (e.g. DOMPurify, as UPTime does).
- Aliases are pink-bordered chips (`#efbfee`). Tags are green chips (`#cdeedc` background, `#7eaa92` border). Related links are blue-bordered chips (`#888eba`, hover `#a1b7e7`).
- Tag chips on cards are **not** clickable. (Making them toggle the filter would be a cheap improvement.)
- Hovering a card gives it a light grey (`#f0f0f0`) background. Title buttons show their `title` text as a CSS tooltip.

---

## 11. Editor (moved to UPTime)

The viewer used to have a hidden editor (`?edit=1`) that edited games in memory and downloaded a new JSON file or a diff. It was removed once editing moved to UPTime. See UPTime's `docs/living-playbook-editor.md` for the current editor, and this file's git history for the old one's description.

---

## 12. Export and versioning (moved to UPTime)

`living_playbook.json` is written by UPTime's deterministic exporter (`src/utils/playbookSerializer.js`), described in UPTime's `docs/living-playbook-editor.md` §8.1. The resulting format is summarized in §3.1–3.2 above.

**Release process:** an export with changes bumps `minor`. A release bumps `major` and resets `minor` to `0000`, and a new calendar year restarts at `<year>.0001.0000`. Every export PR adds a `CHANGELOG.md` entry drafted by UPTime. A release PR also adds an archive copy `src/living_playbook.<year>.<major>.<minor>.json`.

---

## 13. Diff format (removed)

The old editor's diff download (`living_playbook_diff.json`) was removed along with it. It was never used by anything. UPTime's proposals carry full per-game copies plus a base revision instead of a diff.

---

## 14. Maintenance scripts (removed)

The Python scripts that used to live in `scripts/` (`assign_uids.py`, `generate_changelog.py`, `sort_playbook.py`, `update_game_variations.py`) were deleted. UPTime's exporter and its changelog draft replace them. `sort_playbook.py` and `assign_uids.py` were also unsafe to run by then: they rewrote the 2001 file and the release archives in a non-canonical format. They're in git history if ever needed.

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

Items 8–18 are open; `viewer-cleanup-plan.md` §3 has the planned fixes.

| # | Area | Issue |
|---|---|---|
| 1 | Editor | ~~Renaming a game creates a duplicate instead of renaming, because edits are keyed by name.~~ Removed with the editor. UPTime keys edits by UID. |
| 2 | Editor | ~~There's no UI to add, delete, or reorder games, or to edit contributors or version.~~ Removed with the editor. UPTime has all of these. |
| 3 | Editor | ~~Variations are split on newlines, so a variation can't be multi-paragraph.~~ Removed with the editor. |
| 4 | Export | ~~Variations are sorted alphabetically, so authored order is lost.~~ Fixed: UPTime's exporter keeps authored order. |
| 5 | Export | ~~Each Download Json click increments `minor` again and mutates live data.~~ Removed with the editor. |
| 6 | Diff | ~~`newGames`/`delGames` and `newContributors`/`delContributors` are swapped.~~ Removed with the editor. |
| 7 | Diff | ~~Runtime fields leak into the diff. `applyToPlaybook` is unused and broken for in-memory diffs.~~ Removed with the editor. |
| 8 | Search | `tag:` can't match tags containing spaces, and it's case-sensitive while the URL lower-cases the search. |
| 9 | Search | `id:` ignores aliases, so related links to renamed games return nothing (e.g. "Panel Experts Endowment"). |
| 10 | Search | A query like `foo (bar)` silently drops `foo`. |
| 11 | URL | `uid:N` anywhere in the search replaces the whole search with `uid=N` in the URL. |
| 12 | URL | The `uids` param is never removed. There's no `popstate` handling, and `pushState` runs on every update. |
| 13 | URL | List-button clicks don't update the URL. |
| 14 | Sharing | The bitmask decoder double-decodes and can throw on some UID sets. |
| 15 | Lists | "Add to New List" doesn't dedupe. "Create List From Current Games" overwrites silently. The popup doesn't refresh the panel. |
| 16 | Security | Markdown is rendered with raw `innerHTML` and no sanitizing. (Riskier now that content comes from UPTime proposals.) |
| 17 | Code | `PageMode.Uids` is referenced but never defined. `pageMode` is otherwise unused. |
| 18 | Data | Main file: the duplicate contributor and `tossup` are fixed. One related name is a typo ("Panel Experts Endowment"). 2001 file: duplicate UID 58 ("Experts" / "Panel Experts Endowments"), The Moon's UID (254) no longer matching the main file's 253, two misspelled related names, a duplicate contributor, and the misspelled `contributers` key. See `viewer-cleanup-plan.md` §7. |

---

## 17. The React version (built in UPTime)

This section used to hold recommendations for a React viewer and editor. That was built in UPTime (Documents → Living Playbook) and follows most of them: edits keyed by UID, reviewed proposals with a three-way merge, structured inputs, sanitized Markdown, and deterministic export. See UPTime's `docs/living-playbook-editor.md`. This repo's viewer remains the public site; its planned improvements are in [`viewer-cleanup-plan.md`](viewer-cleanup-plan.md).
