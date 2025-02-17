import json
import os

def sort_playbook(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        data = json.load(file)
    
    sorted_games = sorted(data['games'], key=lambda x: x['name'])
    data['games'] = sorted_games
    
    with open(file_path, 'w', encoding='utf-8') as file:
        json.dump(data, file, ensure_ascii=False, indent=4)

if __name__ == "__main__":
    base_path = '../src'
    files_to_sort = ['living_playbook.json', 'living_playbook_2001.json']
    
    for file_name in files_to_sort:
        file_path = os.path.join(base_path, file_name)
        sort_playbook(file_path)
        print(f"Sorted {file_name}")
