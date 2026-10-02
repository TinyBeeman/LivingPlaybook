# Viewer Cleanup Plan: Strip Editing, Fix Bugs, Polish

**Status:** Proposed (2026-09-27). Nothing here is built yet.

**Context:** All editing of the Living Playbook now happens in UPTime, a private webapp maintained by Unexpected Productions (Documents → Living Playbook). There, signed-in users propose changes, reviewers accept them, and UPTime exports a canonical `living_playbook.json` that is PR'd into this repo. This repo's web app no longer needs its own editor. From now on it is **only the public viewer** at `unexpectedproductions.org/playbook`. It stays the main way people outside UPTime read the playbook, so every viewer feature stays: search, the tag filter, favorites and named lists, share links, permalinks, related-game links, the 2001 edition, and printing.

This plan covers:
1. removing the editor code
2. fixing the viewer bugs listed in [`living-playbook-spec.md`](living-playbook-spec.md) §16, plus several new ones found while reading the current code
3. UX improvements
4. code cleanup

Line numbers are for `src/playbook.js` at commit `69f984d`.

---

## 1. Ground rules

These apply to every phase.

- **Don't break anything a visitor already has.** Existing bookmarks and shared links must keep working, and saved lists must survive:
  - `?search=` (including `id:`, `list:`, `uid:`, `uids:`)
  - `?uid=`
  - `?uids=` (the bitmask list links)
  - `?yesTags=` / `?noTags=`
  - `?dbId=2001`
  - `#anchorname` fragments
  - the `localStorage` `gamelist-*` format (spec §8.1)
- **Keep the search language.** UPTime's viewer uses a different, Google-style syntax, because it had no old links to support. The public site does, so we fix the bugs in the existing language (spec §6) instead of replacing it.
- **Stay static, with no build step.** The deploy workflow rsyncs `src/` straight to the web host, and that simplicity is worth keeping. Plain ES modules (`<script type="module">`) are allowed. A bundler is not.
- **`src/living_playbook_2001.json` must keep its information, not its exact bytes.** The agreement is that the original 2001 playbook stays available. We may fix obvious data bugs (like the duplicate UID 58), normalize its format, and make data changes a viewer improvement needs. We may not change what it says: game names, descriptions, variations, tags, and the original cross-references stay as they were in 2001. No content improvements beyond obvious bugs. See §7.2. UPTime still never imports or exports this file; fixes to it are made by hand in this repo.
- **Anything that reaches `src/` on `main` deploys to production.** Today `.github/workflows/deploy-file.yml` runs on every merged PR. After §5.4 it runs on every push to `main` that touches `src/`. Either way, there's no staging site. Test each PR locally with `python test/server.py` before merging. Keep the PRs small and in the order below.
- UPTime's export PRs (`uptime-export-*`) only touch `src/living_playbook*.json` and `CHANGELOG.md`, so they won't conflict with this work.

---

## 2. Phase 1: Strip the editor (one PR, no visible change for visitors)

This removes about 550 of the 2,023 lines in `playbook.js`. None of it runs unless `?edit=1` is in the URL.

**`src/playbook.js`**

| Remove | Where |
|---|---|
| `GameDiff`, `PlaybookDiff` (including the unused, broken `applyToPlaybook`) | 550–727 |
| `Playbook.getNextUid`, `sanitizeDatabase`, `exportJson`, `downloadJson`, `downloadDiffJson`, `originalUrl` | 827–971 |
| `Playbook.getGameDetailsByName` (used only by the editor) | 771–776 |
| `GameField` enum (used only by the editor) | 429–439 |
| `PlaybookPage.editMode`, `?edit=1` parsing, and the Download Json / Download Diff Json buttons | 982, 1050, 1270–1292 |
| The edit (pencil) button and the `editMode` parameter of `createGameCardDiv` | 1625, 1673–1680, 1404 |
| Every edit overlay method: `fitTextAreaToContent`, `fitAllTextAreasToContent`, `getEditId`, `createEditRow`, `createCommitRow`, `getDetailsFromDocEditFields`, `previewGameEdit`, `createEditDiv`, `createOverlay`, `populatePreviewOverlay`, `showEditOverlay` | 1770–2014 |

Two smaller changes in the same file:
- Replace `DatabaseField` / `getDatabaseValue` with direct reads (`data.version`, `data.contributors`). Its only remaining callers are the header and the footer.
- Add `edit` to the params that `updateUrlFromState()` deletes (next to the leftover `list`), so old `?edit=1` bookmarks clean themselves up.

**`src/styles.css`:** remove `--font-size-game-edit-button`, `.game-edit-button`, `.game-edit`, `.field_edit`, `.preview-details-container`, `.overlay`, `.overlay-content`, `.edit-button`, and `.edit-button:hover`.

**`src/img/icons/`:** delete `edit-black.svg` and `edit-gray.svg`.

**`scripts/`:** delete the whole folder. Each script has either been superseded by UPTime or is actively dangerous now:
- **`sort_playbook.py`** rewrites both the main file and the 2001 file as 4-space JSON in Python's sort order. That would undo the canonical format UPTime exports.
- **`assign_uids.py`** matches UIDs by exact name only, so it gets renamed games wrong. It also rewrites the release archives, which should never change. §7.2's UID fixes are made by hand instead.
- **`generate_changelog.py`** is superseded by UPTime's export dialog, which drafts the changelog. It also crashes whenever a game was removed.
- **`update_game_variations.py`** was a one-time migration that has already been done.

Git history keeps all four if anyone needs them.

**Docs:** do these in the same PR; see §6.

**Verify:** load `/`, `?dbId=2001`, `?uid=113`, a `?uids=` link, and `?search=list:favorites`. Check that favorites, lists, sharing and printing behave exactly as before, and that the browser console shows no errors.

---

## 3. Phase 2: Viewer bug fixes

### 3.1 Bugs from spec §16 that are still live

Items 1–7 in §16 were editor, export and diff bugs. They go away with Phase 1. The rest still need fixing:

| Spec # | Bug | Fix |
|---|---|---|
| 8 | `tag:` can't match tags that contain spaces, and it's case-sensitive. | Tokenize `prefix:"quoted value"` as one token (for example, `tag:"blank challenge"`). Compare tags case-insensitively. |
| 9 | `id:` ignores aliases, so related links to renamed games find nothing. | At load time, resolve each `related` name to a UID: match a game name first, then an alias, case-insensitively. This is the same rule UPTime's importer uses. Render related links as `uid:N`, and render names that don't resolve as plain text instead of dead links. Keep `id:` working for old links, now also checking aliases. The unused `getGameIdFromSearchTerm()` (783) already does this. |
| 10 | In `foo (bar)`, `foo` is silently dropped. | In `ParseExpression` (299–306), stop parsing only the first group. Treat a group as one operand of the implicit AND. |
| 11 | A `uid:N` anywhere in the search replaces the whole search with `uid=N` in the URL. | Write `uid=N` only when the whole search is exactly `uid:N`. Otherwise write `search=`. Also stop lower-casing the saved search. |
| 12 | `uids` is never removed from the URL, Back/Forward don't work, and every update adds a history entry. | Drop `uids` once the user changes the search. Use `replaceState` while typing, and `pushState` for deliberate actions (a tag click, a list click, a related link). Add a `popstate` handler that re-reads state from the URL and re-renders. |
| 13 | Clicking a list button doesn't update the URL. | Route it through the same URL writer, with `pushState`. |
| 14 | The share-link decoder decodes twice and can throw. | Remove the second `decodeURIComponent` (40). `URLSearchParams` has already decoded the value, and because a correctly decoded link has no leftover escapes, the second decode is at best a no-op. Removing it fixes every old link and breaks none. |
| 15 | "Add to New List" doesn't dedupe. "Create List From Current Games" silently overwrites. The add-to-list menu doesn't refresh the Lists panel. | Make `addGame` a no-op for UIDs already in the list. Ask before overwriting an existing list. Refresh the panel after every change made in the menu. |
| 16 | Markdown is inserted with `innerHTML` and no sanitizing. | This matters more now, because content can come from any UPTime beta tester's proposal. A reviewer approves it, but one might not spot an `<img onerror=…>` buried in Markdown. Vendor `purify.min.js` next to `marked.min.js` and sanitize everything `mdToHtml()` returns, the same way UPTime's `playbookMarkdown.js` does. Also build the header with `textContent` instead of `innerHTML`. |
| 17 | `PageMode.Uids` is referenced but never defined. | Delete `PageMode` and `pageMode`. Nothing reads them. |

### 3.2 New bugs found while reading the code

| Bug | Repro | Fix |
|---|---|---|
| **`?uids=` with an empty value blanks the page.** | Share an empty list. An empty Favorites list survives after un-hearting everything, and `EncodeIntegerSet` of an empty set returns `""`. Open the link: `onPageLoad` calls `"".join(',')` (1047) and throws before anything renders. | Treat an empty `uids` as absent. Disable Share for empty lists. |
| **A tag in the URL that no longer exists shows 0 results, and the visitor can't clear it.** | `?yesTags=pop-culture`. That tag was renamed to `pop culture` in 2026.0001.0001, so old bookmarks now do this. No button exists for the tag, so there's nothing to click to turn it off. | When the data loads, drop any URL tag that isn't in the tag list. Rewrite the URL too. |
| **A failed data load leaves a blank page with no message.** | Serve the page with the JSON missing. `loadFromURL` swallows the error, then `onDatabaseLoad` throws on `null.version`, which is only logged to the console. | Show an inline "Couldn't load the playbook, try reloading" message. |
| **The footer's license text ignores the data file.** | The file's `license` field says © 2026 (changed in 2026.0001.0001, "License updated"). The footer hard-codes © 2025 (1321). Metadata edits made in UPTime never reach the site. | Render the footer's license paragraph from `data.license` (as sanitized Markdown), keeping the hard-coded text as a fallback. The 2001 notice and the PDF link stay as they are. |
| **The version is shown without the year.** (Requested by the maintainer.) | The header reads `Version 0001.0003` (`${major}.${minor}`, 992). Versions now restart every year: 2025.0002.0002 was followed by 2026.0001.0000. So the site's version number went *down* from 0002.0002 to 0001.0000 with no visible reason, and a number like `0001.0003` doesn't say which year it belongs to. The zero-padding is also noise. | Show `Version 2026.1.3`: the year, then major and minor without padding. The 2001 edition then reads `Version 2001.1.1`. `CHANGELOG.md` headings keep the padded `2026.0001.0003` form, and that's fine, because the two parse to the same numbers. |
| **Popups stack.** | Click "Add to List" or Share twice. Each click adds another popup, because the outside-click handler deliberately ignores clicks on the button itself (1566, 1614). | Clicking the button again closes its popup. Only one popup is ever open, and Escape closes it. |
| **The delete-list and share-list buttons have no tooltip.** | `deleteListButton.attributes['title'] = …` (1168, 1185) sets a property on the attribute map, not an attribute. | Use `setAttribute('title', …)` plus an `aria-label`. |
| **The favicon is a 404.** | `index.html` line 11 links `android-chrome-192x192.png`, but the file is `favicon-192x192.png`. | Fix the path. |
| **Invalid HTML.** | `<footer>` sits outside `<body>`. | Move it inside `.inner-body`, or at least inside `<body>`. |
| **A `list:` search reads `localStorage` once per game.** | `SearchNode.match` calls `GameList.fromLocalStorage` for each of the 284 games on every keystroke (172). | Resolve each `list:` term's UID set once per search. |

---

## 4. Phase 3: UX improvements

These are ordered by value for effort. Each one can be its own small PR, and any of them can be dropped.

1. **Clickable tag chips on cards.** Clicking a tag on a card toggles it in the filter, cycling the same three states (the spec already suggests this in §10). Tony's Review of this: I don't know about this: what happens when I turn off the chip? I think clicking a tag should take us to a filtered view of just that tag, in a new tab.
2. **Search help.** Add a small "?" next to the search box that opens a popover listing the syntax: `and`/`or`/`not`, parentheses, `"phrases"`, `tag:`, `list:`. Right now the search language is powerful but invisible.
3. **"Suggest a change" link on each card.** Visitors have no way to propose an edit, now that editing has left this site. The link opens a new GitHub issue pre-filled with the game's name and UID (`…/issues/new?title=…&body=…`). This also matches the footer's existing "file an issue" wording.
4. **Friendlier shared lists.** When the page is opened from a `?uids=` link, show a banner ("A shared list of 12 games") with a **Save as list** button, instead of making the recipient find "Create List From Current Games".
5. **Better share UX.** Use `navigator.share()` where it's available (phones), and fall back to copying the link. Replace the `alert()` calls with a short inline "Copied!" confirmation.
6. **Tag filter polish.** Show a count on each tag button, and add a **Clear filters** button that resets both the search and the tags.
7. **Related links navigate in place.** Instead of a full page reload, a related link does a `pushState` and a re-render, then scrolls the target card into view. It needs the `popstate` work from §3.1.
8. **Title for permalinks.** On `?uid=`, set `document.title` to the game's name, so bookmarks and browser history are readable. Add a `<meta name="description">`. Real per-game Open Graph cards would need server rendering, which is out of scope.
9. **Accessibility.**
   - Make the collapsible headers `<button aria-expanded>`.
   - Tag buttons get an `aria-pressed` equivalent, or a visually hidden "included"/"excluded" label.
   - Icon buttons get `aria-label`s.
   - Add a visible focus style.
10. **Phone check.** The page has no mobile media queries. Check the title-bar buttons and popups at about 375px wide and fix whatever breaks. Popups positioned at the button can run off-screen on the right.

---

## 5. Phase 4: Code cleanup, tests, and CI guards

### 5.1 Split `playbook.js` into modules (behavior-preserving)

Do this **before** the Phase 2 bug fixes, so the fixes land in testable modules with regression tests. No build step is needed:

```
src/js/search.js       tokenizer, parser, evaluator (pure)
src/js/shareCodec.js   uids bitmask encode/decode (pure)
src/js/lists.js        GameList / localStorage (storage injected, so it's testable)
src/js/playbook.js     load, anchors, related-name → UID resolution, tags
src/js/page.js         all DOM code
src/main.js            entry point: <script type="module" src="main.js">
```

`marked.min.js` and `purify.min.js` stay as ordinary global scripts. ES modules need a real HTTP server, but that's already true, because `fetch` of the JSON needs one; `test/server.py` covers it.

Delete this dead code during the split:
- `Util.BytesToBase64` and `UrlEncodeByteArray`
- `SearchFilter`'s unused `searchTerms`/`tagFilter`, and the wrapper itself
- `GetSearchType`, which re-parses the search just to read the root operator
- the `console.log` calls in `getTreeAsString`
- the trivial `TagFilter` wrapper
- the unused `onPageLoad(false)` argument
- the `module.exports` shim (2019–2023)
- the `LocalStore` constructed per `GameList`

### 5.2 Tests (no dependencies)

Use Node's built-in runner: `node --test test/`. There's no `package.json` and no `node_modules`. Cover:
- **Search:** every example in spec §6.4, plus regression cases for #8, #10 and `id:`-via-alias.
- **Share codec:** round-trips, the empty set, and a fixture of **old** `uids=` links, including one whose bitmask contains a `0x25` byte, the case the double decode broke.
- **Lists:** dedupe, the overwrite prompt path, and the sanitized-name keys, using a fake `localStorage`.
- **Related resolution:** name first, then alias. `At The Movies` is both a game and an alias of Movie Critics, and must resolve to the game.

### 5.3 CI

Add a `pull_request` workflow, separate from deploy, that:
1. runs `node --test`
2. sanity-checks **both** `src/living_playbook.json` and `src/living_playbook_2001.json`: each parses, UIDs are unique, `nextUid` is greater than the largest UID, and every game has a name and a description. A direct hand-edited PR can still happen (and UPTime's three-way re-import accepts one for the main file), but it shouldn't be able to ship a file that breaks the viewer.
3. checks that the two editions' UIDs agree: a UID used in both files must mean the same game. The check can't know that "King Game" and "Monarch Game" are the same game, so it reads a small allowlist of known renames. It fails on an unexplained mismatch, so a new duplicate like UID 58 can't slip in.
4. fails if a PR deletes or renames `src/living_playbook_2001.json` (edits are fine), or changes any archived `src/living_playbook.<year>.<major>.<minor>.json`. Those are frozen release snapshots.

**Security fixes, recommended but separable:**
- **Pin the server's host key.** Store the known host line as a secret (for example `SFTP_KNOWN_HOSTS`) and write it to `~/.ssh/known_hosts`, instead of running `ssh-keyscan` inside the job.
- **Switch from `sshpass` to an SSH deploy key**, if the host allows key logins. The job then never holds the account password.

Both need a one-time secrets setup on GitHub (and a key installed on the host), so they're a separate PR from the trigger change. The deploy-key switch is deferred for now.

**Done (2026-09-28):**
- The trigger change merged as [#9](https://github.com/TinyBeeman/LivingPlaybook/pull/9).
- A follow-up moved to `actions/checkout@v7` (v4 still declared Node 20, which GitHub now warns about).
- The same follow-up installs `rsync`/`sshpass` explicitly instead of assuming the runner image has them. `ubuntu-latest` moves to Ubuntu 26 on 2026-10-19, and nothing guarantees `sshpass` is preinstalled there.

---

## 6. Documentation updates

- **`docs/living-playbook-spec.md`.** Turn it from "reference for building a React viewer and editor" into "public viewer and data-format spec":
  - Replace §11 (Editor), §12 (Export) and §13 (Diff) with one-line stubs pointing to UPTime's `docs/living-playbook-editor.md`. Keep the headings so section numbers stay stable, because UPTime's editor doc cites this spec as "spec §N" throughout.
  - Replace §14 (scripts) with a stub, since the scripts are deleted.
  - In §16, mark each item fixed or removed as the phases land.
  - Drop §17's editor half.
  - Refresh the stats in §2–3: the file is now 2026.0001.0003 with a canonical key order, and the tag vocabulary has changed.
- **`README.md`:**
  - Say that editing happens in UPTime.
  - Say that `src/living_playbook.json` is written by UPTime's exporter in a canonical format, so direct PRs to it should keep that format.
  - State the 2001 rule from §1: the file keeps its information, and fixes and format changes are allowed. It is edited by hand here, never through UPTime.
  - Document `python test/server.py` and `node --test`.
  - Remove the stale TODO list.
- **UPTime's `docs/living-playbook-editor.md`.** Its §7 says the public site keeps favorites, lists and sharing. That's still true. If §6's stubs keep the spec's numbering, none of its "spec §N" references break. **Do** reword its 2001 lines (§1's table, §8.1 and §11), which say the file must stay "unchanged". UPTime's own rule doesn't change: it never imports, exports or writes that file, and `playbook:stage` keeps refusing it. What changes is the reason: the file isn't frozen, it's simply maintained by hand in this repo.

---

## 7. Data fixes

### 7.1 Main file: make these in UPTime

`src/living_playbook.json` is UPTime's export target, so fix it through UPTime proposals and then an export PR. Don't hand-edit the JSON.

- **Experts** → related `"Panel Experts Endowment"` is a typo for the real game **Panel Expert Endowment**. UPTime has it as an unresolved plain string, so pick the real game in the related picker.
- **Name/alias collisions:** At The Movies and Movie Critics each list the other as an alias, and List Endowment is both a game and an alias of Adjective Scene. Decide whether these should be separate games at all.
- **Song in a Style** is the only game with no tags.

### 7.2 The 2001 file: make these by hand in this repo

UIDs are meant to identify the same game in both editions (spec §2), and favorites and lists are stored by UID. A mismatched UID is therefore a visible viewer bug, not just untidy data: a game hearted in one edition doesn't show as hearted in the other.

**Normalize the format first, in its own PR with no content changes,** so the fix PRs have readable diffs. Today the file:
- has CRLF line endings
- writes non-ASCII characters as `\u` escapes (836 of them)
- orders keys differently from the main file

Change it to the main file's canonical format: LF, literal UTF-8, the same key order, 2-space indent, and no trailing newline. The main file's rules then apply to both, and CI (§5.3) can check both the same way.

**Then the bug fixes:**

| Problem | Fix |
|---|---|
| **Duplicate UID 58:** "Experts" and "Panel Experts Endowments" both use it. | Give Panel Experts Endowments UID **159**. That's the main file's Panel Expert Endowment, the same game, and 159 is unused in the 2001 file. Experts keeps 58, which matches the main file. |
| **The Moon has UID 254**, which the main file's dedupe removed (the main file kept 253). | Change it to **253**, which is unused in the 2001 file. |
| **Related links that are typos:** Experts → `"Panel Expert Endowments"` (the game is "Panel Experts Endowments"), and Moving Bodies → `"Moon"` (the game is "The Moon"). | Correct the spelling so they resolve. This is an obvious link repair, not a content change. |
| **Two related links resolve only through an alias:** Nightmare → `"Experience"`, and Playbook → `"Paper Chase"`. | No data change needed. They start working once §3.1 #9 resolves related names through aliases. |
| **Experts → `"Word at a Time Expert"`** points at a game that isn't in the 2001 file at all. | Leave it. It's part of the original text, and after §3.1 #9 it renders as plain text instead of a dead link. |
| **The legacy `contributers` key** (misspelled) holds the only record that Randy Dixon was the original author/editor. | Move that information into `contributors`, e.g. `"Randy Dixon (original author/editor)"`, and then drop the key. Deleting the key without moving it would lose information. |
| **"Paul Killam" is listed twice** in `contributors`. | Dedupe. |

**Keep these as they are, because they're 2001 content:** the original game names ("King Game", "Sing Speak", "Spotlight", and the rest), descriptions, variations, and the "(Post 2001 Technical Updates)" annotations on contributors.

**Tags are 2001 content too, so they stay as they are**, including `animal` and `pop-culture`, which the main file later renamed to `animals` and `pop culture`. More generally, the 2001 file gets bug fixes only, never content improvements.

**A viewer improvement this enables:** an edition switcher in the header that keeps the current search, tags and list selection when moving between editions, instead of the footer's plain `?dbId=2001` link. It relies on the UIDs lining up. When a selected tag doesn't exist in the other edition (like `animals` vs `animal`), it's dropped, using the same unknown-tag handling as §3.2. The switcher should say so briefly rather than silently showing different results.

---

## 8. Suggested PR order

0. **§5.4 deploy trigger change.** It goes first, so the docs-only and CI-only PRs below don't redeploy the site. This PR itself touches no `src/` file, so merging it won't deploy. Use "Run workflow" once afterward to confirm the new workflow works.
1. **Phase 1**, plus the §6 doc updates: the editor removed, no visible change.
2. **§7.2 format normalization of the 2001 file:** no content change.
3. **§7.2 fixes to the 2001 file:** the UIDs, related-link typos and contributors.
4. **§5.1 module split and §5.2 test scaffolding:** no behavior change.
5. **Phase 2 fixes**, each with a regression test. First the two blank-page bugs, the unclearable-tag bug, and the version-year display, because visitors can hit them today. The version display is a one-line change and could even go in with Phase 1.
6. **§5.3 CI guards.**
7. **Phase 3 improvements**, one or two per PR, including the edition switcher.

## 9. Open questions

- **New share-link format?** Fixing the decoder (§3.1 #14) makes the current `uids=` format safe. It's still long, because it percent-encodes raw bytes. A base64url encoding of the same bitmask, under a new param name that doesn't collide with `uids`, would roughly halve link length. Old links would still be decoded. Is that worth doing?
- **Where should "Suggest a change" go?** A GitHub issue (proposed above), an email address, or eventually UPTime itself once it's open to more than beta testers?
- **Module split (§5.1):** OK to move from one script to ES modules, still with no build step? Or keep a single file and accept that it can't be unit-tested?
