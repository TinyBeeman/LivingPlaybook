import json

# Load the JSON data
with open('living_playbook.json', 'r', encoding='utf-8') as file:
    data = json.load(file)

# Update gameName and gameDetails to be strings instead of arrays
for game in data['games']:
    if isinstance(game['gameName'], list) and len(game['gameName']) == 1:
        game['gameName'] = game['gameName']
    if isinstance(game['gameDetails'], list) and len(game['gameDetails']) == 1:
        game['gameDetails'] = game['gameDetails']

# Save the updated JSON data
with open('living_playbook.json', 'w') as file:
    json.dump(data, file, indent=4)
