## Version 2026.0001.0002

**Games Added**
- My Ball

**Games Removed**
- The Moon

**Games Updated**
- Piano Torture
  - Renamed from 'Sing Speak' to 'Piano Torture'
  - Aliases Updated
- Sounds Like a Song
  - Renamed from 'Song Cue' to 'Sounds Like a Song'
  - Aliases Updated

## Version 2026.0001.0001

**Games Added**
- My Ball

**Games Updated**
- Accepting Game
  - Tags Updated
- At The Movies
  - Notes Added
  - Variations Updated
  - Aliases Added
- Word Ball
  - Variations Added
  - Related Added
  - Tags Updated

**Tags Renamed**
- 'animal' to 'animals'
- 'pop-culture' to 'pop culture'
- 'yes-and' to 'yes and'

**Tags Merged**
- 'tossup' into 'toss-up'

**Other Changes**
- License updated

## Version 2026.0001.0000

**Technical Improvements**
- Normalized `living_playbook.json` to one canonical format, so future edits (including exports from UPTime's Living Playbook editor) produce small, reviewable diffs:
  - Every game's fields now appear in the same order: name, description, notes, variations, aliases, related, tags, createdBy, uid.
  - Removed a duplicate "Paul Killam" from the contributors list.
  - Removed a tag listed twice on a game: "directed" on Advance and Expand, and "styles" on List Endowment.
- No games were added, removed, or changed in content.

## Version 2025.0002.0000

**User-Friendly Features**
- **Major Improvements To Search**
  - can use 'and', 'or', and 'not' between words
    - *Example*: justification and not animal
  - can use parenthesis
    - emotion or attitude and game
      - This would return all games with emotion along with any games that have both attitude and game (because "and" has precendence over "or")...
    - (emotion or attitude) and game
      - This is probably what you wanted: anything with both game and either emotion or attitude.
  - can put phrases in "quotes"
    - yes and
      - This returns any game with both 'yes' and 'and' in it.
    - "yes and"
      - This returns any game where "yes and" appears as a whole string.
  - can use tag:tag-name
    - *Example*: tag:audience and not tag:justification
- **Added the Ability to Add Favorites and Create Lists**
    - Each game has a heart icon that can used to select favorites.
    - Favorites shows up as a list under the new Lists and Favorites section.
    - You can also add a game to a new or existing list.
    - You can also create a list from a search result.
    - You can use lists in search via the "list:name-of-list" search term.
    - You can share a list from the "lists and favorites" section, which will copy a URL to your clipboard that you can share or bookmark.
- Added ability to add createdBy field to games, when we know who created a game.
  - A lot of work needed to document game creators.
- Added contributors (listed at the bottom) and included all the contributors listed in the original living playbook.

**Technical Improvements**
- Added unique identifiers to games, to enable features where links still work when the name of a game is changed.
- Additional search stuff:
  - list:Favorites
    - ...and other list names
  - uid:#
    - Useful for creating an easy permalink to a game.
  - id:AnchorName
    - Obsolete, but still used by related game links.

**Games Added**
- The Moon (Split off from Pivot)

**Games Updated**
- Advance and Expand
  - Tags Updated
- Before or After
  - Tags Updated
- Black Box
  - Tags Updated
- Chance of a Lifetime
  - Description Updated
- Consciences
  - Tags Updated
- Crime Endowments
  - Description Updated
- Experts
  - Related Updated
- Family Dinner
  - Description Updated
- Famous Person Endowments
  - Description Updated
  - Notes Added
- Five Things Endowment
  - Renamed from 'Five Things' to 'Five Things Endowment'
  - Description Updated
  - Notes Added
- Gibberish Reunion
  - Tags Updated
- Monarch Game
  - Renamed from 'King Game' to 'Monarch Game'
  - Description Updated
  - Notes Added
  - Aliases Added
- Kitty Wants a Corner
  - Description Updated
- List Endowment
  - Aliases Updated
- Making Faces
  - Description Updated
- Marriage Counselor Endowments
  - Description Updated
  - Variations Added
- Moving Bodies
  - Variations Updated
- Murder Endowments
  - Description Updated
- Narrated Scene
  - Description Updated
- Party Quirks
  - Description Updated
- Pecking Order
  - Createdby Added
- Pivot
  - Variations Updated
- Rapid Musicals
  - Createdby Added
  - Tags Updated
- Rapid Scenes
  - Createdby Added
- Sideways Scene
  - Tags Updated
- Story Story Die
  - Description Updated

## Version 2025.0001.0000

**Games Added**
- Called Movie
- List Endowment
- Meanwhile
- Rapid Musicals
- Rapid Scenes
- Soap Opera
- Song in a Style
- Step-Word
- Word Ball
- Word-at-a-Time Expert

**Games Removed**
- 50's Song

**Games Renamed**
- One Word Story -> Word-at-a-Time Story
- Directed Movie -> Called Movie
- Lists -> List Endowment
- Panel Experts Endowments -> Panel Expert Endowment
- Paper -> Paper Chase

**Games Updated**
- Accepting Game
- Actor Switch
- Adjective Scene
- Advance and Expand
- Airplane
- Alliances
- Alliteration
- Alphabet Game
- Animal People
- Arms
- Asides
- Ballet
- Beyond Words
- Black Box
- Chain Murder Endowment
- Confession
- Crime Endowments
- Director
- Environment Endowments
- Experts
- Family Dinner
- Famous Person Endowments
- Foreign Vacation
- In A _____, With A ____, While _____
- Kick It
- Lecture Endowments
- Madrigal
- Marriage Counselor Endowments
- Moving Bodies
- Murder Endowments
- Nightmare
- Object Endowments
- Occupation Endowments
- Oratorio
- Party Quirks
- Poetic Speak
- Proverbs/Word Endowments
- Psychic Endowments
- Radio Stations
- Return Department
- Secret Word Endowments
- Secrets Endowments
- Should Have Said
- Standing, Sitting, Kneeling, Lying Down
- Superhero Endowments
- Town Meeting
- Wallpaper Drama
- What Comes Next?
