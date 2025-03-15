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
  - can put things in quotes
    - yes and
      - This returns any game with both 'yes' and 'and' in it.
    - "yes and"
      - This returns any game where "yes and" appears as a whole string.
    - can use tag:tag-name
      - *Example*: tag:audience and not tag:justification
- **Added the Ability to Add Favorites and Create Lists**
    - These are stored locally in a cookie, so they aren't available from another device. I'll eventually add the ability to share lists.
- Added ability to add createdBy field to games, when we know who created a game.
- Added contributors (listed at the bottom) and included all the contributors listed in the original living playbook.

**Technical Updates**
- Added unique identifiers to games, to enable features where links still work when the name of a game is changed.
- Search strings now support...
  - quotes around strings
    - yes and
        - returns games that include both words, anywhere
    - "yes and"
        - return games where the two words appear together
  - list:Favorites
    - ...and other list names
  - uid:#
    - Allows permalinks to games, even if they are renamed, also used when saving lists.

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
