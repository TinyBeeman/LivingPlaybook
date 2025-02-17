import json
import sys

def load_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as file:
        return json.load(file)

def get_game_dict(games):
    return {game['name']: game for game in games}

def compare_games(old_game, new_game):
    changes = []
    for key in new_game:
        if key not in old_game:
            changes.append(f"- {key.capitalize()} Added")
        elif old_game[key] != new_game[key]:
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

    all_game_names = sorted(set(old_games.keys()).union(new_games.keys()))

    changelog = [f"Version {old_data['version']['year']}.{old_data['version']['major']}.{old_data['version']['minor']} -> {new_data['version']['year']}.{new_data['version']['major']}.{new_data['version']['minor']}"]
    games_added = []
    games_removed = []

    for game_name in all_game_names:
        if game_name in old_games and game_name not in new_games:
            games_removed.append(game_name)
        elif game_name not in old_games and game_name in new_games:
            games_added.append(game_name)
    
    if games_added:
        changelog.append("**Games Added**")
        changelog.extend([f"- {game_name}" for game_name in games_added])
    if games_removed:
        changelog.append("\n**Games Removed**")
        changelog.extend([f"- {game_name}" for game_name in games_removed])
    changelog.append("\n**Games Updated**")

    for game_name in all_game_names:
        if game_name in old_games and game_name in new_games:
            changes = compare_games(old_games[game_name], new_games[game_name])
            if changes:
                changelog.append(f"- {game_name}")
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
