import json

def load_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as file:
        return json.load(file)

def save_json(filepath, data, encoding='utf-8'):
    with open(filepath, 'w') as file:
        json.dump(data, file, indent=4)

def update_game_variations(old_data, new_data):
    old_games = {game['name']: game for game in old_data['games']}
    for game in new_data['games']:
        game_name = game['name']
        if game_name in old_games and 'gameVariations' in old_games[game_name]:
            game['gameVariations'] = old_games[game_name]['gameVariations']
    return new_data

def main():
    old_filepath = '../src/living_playbook_2001.json'
    new_filepath = '../src/living_playbook.json'

    old_data = load_json(old_filepath)
    new_data = load_json(new_filepath)

    updated_data = update_game_variations(old_data, new_data)

    save_json(new_filepath, updated_data)

if __name__ == "__main__":
    main()
