import json
import os
import glob
from pathlib import Path

def assign_uids():
    # Path to the main living_playbook.json file
    main_file = Path("./src/living_playbook.json")
    
    # Check if main file exists
    if not main_file.exists():
        print(f"Error: Main file {main_file} not found.")
        return
    
    # Load the main file
    with open(main_file, 'r', encoding='utf-8') as f:
        main_data = json.load(f)
    
    # Create a dictionary mapping game names to UIDs
    name_to_uid = {}
    for i, game in enumerate(main_data.get('games', [])):
        if 'name' in game and game['name']:
            # Use the game's UID if available, otherwise use its index
            uid = game.get('uid', i)
            name_to_uid[game['name']] = uid
    
    # Find all other living_playbook*.json files
    playbook_files = glob.glob(str(main_file.parent / "living_playbook*.json"))
    
    # Remove the main file from the list if it's there
    if str(main_file) in playbook_files:
        playbook_files.remove(str(main_file))
    
    # Process each file
    for file_path in playbook_files:
        print(f"Processing {file_path}...")
        
        # Load the file
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Flag to track if we made changes
        changes_made = False
        
        # Assign UIDs to games
        for game in data.get('games', []):
            if 'name' in game and game['name']:
                # Look for the game name in the main file
                uid = name_to_uid.get(game['name'], -1)
                
                # Only set or change UID if needed
                if 'uid' not in game:
                    game['uid'] = uid
                    changes_made = True
                elif game['uid'] != uid:
                    # Output an error
                    print(f"Error: UID mismatch for game '{game['name']}' in {file_path}")
        
        # Save the updated file if changes were made
        if changes_made:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"Updated UIDs in {file_path}")
        else:
            print(f"No changes needed for {file_path}")

if __name__ == "__main__":
    assign_uids()
    print("UID assignment complete.")
