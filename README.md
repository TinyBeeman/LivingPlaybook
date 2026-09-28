# The Living Playbook

## Overview
The Living Playbook is a database of improvisational theatre games. The web application allows users to filter and view a list of games based on selected tags. The application features a user-friendly interface with three-state checkboxes for tag selection and dynamically updates the displayed games based on user input.

The public site is at [unexpectedproductions.org/playbook](https://unexpectedproductions.org/playbook/). It's a static page (`src/`), deployed automatically whenever a change under `src/` lands on `main`.

## Contributing
Please feel free to open an issue for any suggestions or improvements, or submit a pull request.

Editing of the playbook itself happens in UPTime, Unexpected Productions' private web app, where proposed changes are reviewed before UPTime exports them here as a pull request. So:

* **`src/living_playbook.json`** is written by UPTime's exporter in a canonical format (2-space indent, fixed key order, games sorted by name). A direct pull request to it is still welcome, and UPTime picks it up on its next import, but please keep that format.
* **`src/living_playbook_2001.json`** is the original 2001 Living Playbook. Its information must stay as it was in 2001, so it only gets fixes for obvious data bugs, never content changes.
* **`src/living_playbook.<year>.<major>.<minor>.json`** files are frozen release snapshots.

See [`docs/living-playbook-spec.md`](docs/living-playbook-spec.md) for how the viewer works and the data format.

## Running locally
`python test/server.py` (or `start_test.bat`) serves `src/` at http://localhost:8000 with caching disabled.

## TODO

* Add better searching  
* Library clean-up
* Reconsider tags and categories.
* Add long form formats

## Licensing

The Online Living Playbook © 2026, maintained by [Tony Beeman](https://tinybeeman.com/), is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/?ref=chooser-v1). Suggestions can be made by filing an issue via the [Github Repository](https://github.com/TinyBeeman/LivingPlaybook).

Because this database originates from The Living Playbook, anyone seeking to distribute any information in this database must abide by the original document's terms. 

> The Living Playbook is Copyright 1995, 2001 by Unexpected Productions. All rights reserved. We fully encourage FREE distribution of this collection but this notice must be left intact. Any distribution, in any form (including, but not limited to, print, CD-ROM, morse code and smoke signals), where profit is being realized without the express written consent of Unexpected Productions is prohibited. Duplication expenses (disks, paper, photocopying) are exempt from this restriction. We want this collection distributed, but only to the advantage of the recipients.

The full context of those terms can be found in the PDF at [Living-Playbook.pdf](src/Living-Playbook.pdf).

