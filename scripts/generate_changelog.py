import json
import sys

def load_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as file:
        return json.load(file)

def get_game_dict(games):
    return {game['uid']: game for game in games}

def compare_games(old_game, new_game):
    changes = []
    for key in new_game:
        if key not in old_game:
            changes.append(f"- {key.capitalize()} Added")
        elif old_game[key] != new_game[key]:
            if (key == "name"):
                changes.append(f"- Renamed from '{old_game[key]}' to '{new_game[key]}'")
            else:
                changes.append(f"- {key.capitalize()} Updated")
    for key in old_game:
        if key not in new_game:
            changes.append(f"- {key.capitalize()} Removed")
    return changes

def generate_changelog(old_file, new_file):
    old_data = load_json(old_file)
    new_data = load_json(new_file)

    old_games = get_game_dict(old_data['games'])
    new_games = get_game_dict(new_data['games'])

    all_game_uids = sorted(set(old_games.keys()).union(new_games.keys()))

    changelog = [f"Version {old_data['version']['year']}.{old_data['version']['major']}.{old_data['version']['minor']} -> {new_data['version']['year']}.{new_data['version']['major']}.{new_data['version']['minor']}"]
    games_added = []
    games_removed = []

    for game_uid in all_game_uids:
        if game_uid in old_games and game_uid not in new_games:
            games_removed.append(game_uid)
        elif game_uid not in old_games and game_uid in new_games:
            games_added.append(game_uid)
    
    if games_added:
        changelog.append("**Games Added**")
        changelog.extend([f"- {new_games[game_uid]['name']}" for game_uid in games_added])
    if games_removed:
        changelog.append("\n**Games Removed**")
        changelog.extend([f"- {new_games[game_uid]['name']}" for game_uid in games_removed])
    changelog.append("\n**Games Updated**")

    for game_uid in all_game_uids:
        if game_uid in old_games and game_uid in new_games:
            changes = compare_games(old_games[game_uid], new_games[game_uid])
            if changes:
                changelog.append(f"- {new_games[game_uid]['name']}")
                changelog.extend([f"  {change}" for change in changes])
        
    return "\n".join(changelog)

if __name__ == "__main__": 
    if len(sys.argv) != 3:
        print("Usage: python generate_changelog.py <old_file.json> <new_file.json>")
        sys.exit(1)

    old_file = sys.argv[1]
    new_file = sys.argv[2]

    changelog = generate_changelog(old_file, new_file)
    print(changelog)
