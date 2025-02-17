class TagFilter {
    constructor() {
        this.yesTags = new Set();
        this.noTags = new Set();
    }

    addYesTag(tag) {
        this.yesTags.add(tag);
    }

    addNoTag(tag) {
        this.noTags.add(tag);
    }

    getYesTags() {
        return Array.from(this.yesTags);
    }

    getNoTags() {
        return Array.from(this.noTags);
    }
}

class Playbook {
    constructor(source) {
        this.data = null;
    }

    async loadFromURL(url) {
        try {
            // Load data from URL, avoiding any cache
            const response = await fetch(url, { cache: 'no-store' });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.data = await response.json();

            // Walk through games and add anchorName
            this.data.games.forEach(game => {
                game.anchorName = this.getAnchorName(game.gameName);
                if (game.aliases) {
                    game.anchorAliases = game.aliases.map(alias => this.getAnchorName(alias));
                }
            });

        } catch (error) {
            console.error(`Error loading data from URL: ${error}`);
        }
    }

    loadFromFile(filePath) {
        try {
            this.data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (error) {
            console.error(`Error loading data from file: ${error}`);
        }
    }

    getTags() {
        const tagsSet = new Set();
        if (this.data && this.data.games) {
            this.data.games.forEach(game => {
                if (game.tags && Array.isArray(game.tags)) {
                    game.tags.forEach(tag => tagsSet.add(tag.trim()));
                }
            });
        }
        return Array.from(tagsSet).sort((a, b) => a.localeCompare(b));
    }

    getGamesAlphabetized(filter = null) {
        return this.searchGames('', filter);
    }

    getGameDetailsByName(name) {
        if (this.data && this.data.games) {
            return this.data.games.find(game => game.gameName === name) || null;
        }
        return null;
    }

    getAnchorName(gameName) {
        // // Remove spaces and any non-letter/number characters from name
        return gameName.replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
    }

    getGameIdFromSearchTerm(term) {
        if (!this.data || !this.data.games || !term) {
            return null;
        }

        let lowerTerm = term.toLowerCase();
        if (lowerTerm.startsWith("id:")) {
            lowerTerm = lowerTerm.slice(3);
        }

        const game = this.data.games.find(game => 
            game.anchorName === lowerTerm || 
            (game.anchorAliases && game.anchorAliases.includes(lowerTerm))
        );
        return game ? game.anchorName : null;
    }

    searchGames(term, tagFilter = null) {
        if (!this.data || !this.data.games) {
            return [];
        }

        let lowerTerm = term?.toLowerCase();
        let gameId = this.getGameIdFromSearchTerm(lowerTerm);
       
        return this.data.games
            .filter(game => {
                if (gameId) {
                    return game.anchorName.includes(gameId);
                }

                const matchesTerm = Object.entries(game).some(([key, value]) => {
                    // Always return true if term is empty
                    if (!term)
                        return true;

                    if (key === 'related')
                        return false;

                    if (Array.isArray(value)) {
                        return value.some(item => item.toLowerCase().includes(lowerTerm));
                    } else if (typeof value === 'string') {
                        return value.toLowerCase().includes(lowerTerm);
                    }
                    return false;
                });

                if (!matchesTerm) {
                    return false;
                }

                if (tagFilter) {
                    const yesTags = tagFilter.getYesTags();
                    const noTags = tagFilter.getNoTags();
                    const gameTags = game.tags || [];

                    return yesTags.every(tag => gameTags.includes(tag)) &&
                        noTags.every(tag => !gameTags.includes(tag));
                }

                return true;
            })
        .map(game => game.gameName)
        .sort((a, b) => a.localeCompare(b));
    }

    exportJson() {
        const dataWithoutAnchorNames = JSON.stringify(this.data, (key, value) => {
            if (key.toLowerCase() === 'anchorname' || key.toLowerCase === 'anchoraliases') {
                return undefined;
            }
            return value;
        }, 2);
        return dataWithoutAnchorNames;
    }

    downloadJson() {
        const data = this.exportJson();
        // console log the first 1000 characters of the JSON data
        console.log(data.substring(0, 1000));

        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'living_playbook.json';
        a.click();
        URL.revokeObjectURL(url);
    }
}

const GameField = {
    Name: "name",
    Description: "description",
    Notes: "notes",
    Variations: "variations",
    Aliases: "aliases",
    Related: "related",
    Tags: "tags"
};

class PlaybookPage {
    constructor() {
        this.dbId = null;
        this.filter = new TagFilter();
        this.playbook = new Playbook();
        this.searchTerm = null;
        this.lazyTimer = null;
    }

    initializeCollapsibles() {
        var collapsibles = document.getElementsByClassName("collapsible-header");    
        Array.from(collapsibles).forEach(collapsible => {
            collapsible.addEventListener("click", function() {
                this.classList.toggle("active");
                var content = this.nextElementSibling;
                if (content.style.display === "block") {
                    content.style.display = "none";
                } else {
                    content.style.display = "block";
                }
            });
        });
    }

    initializeSearchBox() {
        const searchBox = document.getElementById('search-box');
        searchBox.addEventListener('input', (event) => {
            this.searchTerm = event.target.value;
            this.lazyUpdateUrlFromState();
            this.populateGameList();
        });
    
        searchBox.addEventListener('blur', (event) => {
            this.updateUrlFromState();
        });
    }

    async onPageLoad(editMode = false) {
        let urlParams = new URLSearchParams(window.location.search);
        this.dbId = urlParams.get('dbId');
        this.searchTerm = urlParams.get('search');
    
        if (this.dbId === "2001") {
            document.getElementById('page-title').textContent = "The Online Living Playbook: Original 2001 Edition";
        }

        this.initializeCollapsibles();
        this.initializeSearchBox();
    
        await this.playbook.loadFromURL(this.dbId === "2001" ? 'living_playbook_2001.json' : 'living_playbook.json');
    
        const tags = this.playbook.getTags();
        if (this.searchTerm)
        {
            document.getElementById('search-box').value = this.searchTerm;
        }

        const tagsContainer = document.getElementById('tags-container');
        tags.forEach(tag => {
            const button = document.createElement('button');
            button.className = 'tag-button';
            button.textContent = tag;
            button.dataset.state = 'empty';
            button.addEventListener('click', () => {
                this.toggleTagState(button, tag);
                this.populateGameList();
            });
            tagsContainer.appendChild(button);
        });

        tagsContainer.style.display = 'block'; // Ensure tags are visible on load
        this.populateGameList();
    }

    populateGameList() {
        const games = this.playbook.searchGames(this.searchTerm, this.filter);
        const gamesContainer = document.getElementById('games-container');                
        gamesContainer.innerHTML = '';
    
        games.forEach(gameName => {
            const gameDetails = this.playbook.getGameDetailsByName(gameName);
            gamesContainer.appendChild(this.createGameCardDiv(gameDetails));
        });
    }

    createGameRow(class_name, header="", innerHTML="") {
        const divRow = document.createElement('div');
        divRow.classList.add("game-row");
        divRow.classList.add("game-row-" + class_name);
        if (header) {
            const divHeader = document.createElement('div');
            divHeader.classList.add("game-row-header");
            divHeader.textContent = header;
            divRow.appendChild(divHeader);
        }

        if (innerHTML) {
            const divText = this.createGameRowText(class_name, innerHTML);
            divRow.appendChild(divText);
        }
        return divRow;
    }

    createGameRowText(class_name, innerHTML="") {
        const divText = document.createElement('div');
        divText.classList.add("game-row-content");
        divText.classList.add("game-row-text");
        divText.classList.add("game-row-text-" + class_name);
        divText.innerHTML = innerHTML;
        return divText;
    }

    createGameRowContainer(class_name) {
        const divRowContainer = document.createElement('div');
        divRowContainer.classList.add(`game-row-${class_name}-container`);
        divRowContainer.classList.add("game-row-container");        
        return divRowContainer;
    }

    updateUrlFromState() {
        const url = new URL(window.location);
        if (this.searchTerm) {
            url.searchParams.set('search', this.searchTerm.trim().toLowerCase());
        } else {
            url.searchParams.delete('search');
        }

        const yesTags = Array.from(this.filter.yesTags).join(',');
        if (yesTags && yesTags.length > 0) {
            url.searchParams.set('yesTags', yesTags);
        } else {
            url.searchParams.delete('yesTags');
        }

        const noTags = Array.from(this.filter.noTags).join(',');
        if (noTags && noTags.length > 0) {
            url.searchParams.set('noTags', noTags);
        } else {
            url.searchParams.delete('noTags');
        }

        window.history.pushState({}, '', url);
    }

    lazyUpdateUrlFromState() {
        if (!this.lazyTimer) {
            this.lazyTimer = setTimeout(() => {
                this.updateUrlFromState();
                this.lazyTimer = null;
            }, 1000);
        }
    }

    toggleTagState(button, tag) {
        if (button.dataset.state === 'empty') {
            button.dataset.state = 'checked';
            button.classList.add('checked');
            button.classList.remove('unchecked');
            this.filter.addYesTag(tag);
            this.filter.noTags.delete(tag);
        } else if (button.dataset.state === 'checked') {
            button.dataset.state = 'unchecked';
            button.classList.add('unchecked');
            button.classList.remove('checked');
            this.filter.addNoTag(tag);
            this.filter.yesTags.delete(tag);
        } else {
            button.dataset.state = 'empty';
            button.classList.remove('checked', 'unchecked');
            this.filter.yesTags.delete(tag);
            this.filter.noTags.delete(tag);
        }
        this.updateUrlFromState();
    }

    createGameCardDiv(gameDetails) {
        const divGameCard = document.createElement('div');
        divGameCard.classList.add("game-card");
        divGameCard.id = `${gameDetails.anchorName}`;

        const divTitle = document.createElement('div');
        divTitle.classList.add('game-card-title');
        divTitle.textContent = gameDetails.gameName;
        const divCardContent = document.createElement('div');
        divCardContent.classList.add('game-card-content');
        divGameCard.appendChild(divTitle);
        divGameCard.appendChild(divCardContent);

        this.createGameRow("name", "", gameDetails.gameName);
        const divDesc = this.createGameRow("desc", "description", this.mdToHtml(gameDetails.gameDetails));
        divCardContent.appendChild(divDesc);

        if (gameDetails.notes) {
            const divNotesRow = this.createGameRow("notes", "notes", this.mdToHtml(gameDetails.notes));
            divCardContent.appendChild(divNotesRow);
        }

        if (gameDetails.variations) {
            const divVariationsRow = this.createGameRow("variations", "variations");
            gameDetails.variations.forEach(variation => {
                divVariationsRow.appendChild(this.createGameRowText("variation", this.mdToHtml(variation)));
            });
            divCardContent.appendChild(divVariationsRow);
        }

        if (gameDetails.aliases) {
            const divAliasesRow = this.createGameRow("aliases", "aliases");
            const divAliases = this.createGameRowContainer("aliases");
            gameDetails.aliases.forEach(alias => {
                const divAlias = document.createElement('div');
                divAlias.classList.add('game-alias');
                divAlias.textContent = alias;
                divAliases.appendChild(divAlias);
            });
            divAliasesRow.appendChild(divAliases);
            divCardContent.appendChild(divAliasesRow);
        }

        if (gameDetails.tags) {
            const divTagsRow = this.createGameRow("tags", "tags");
            const divTags = this.createGameRowContainer("tags");
            gameDetails.tags.forEach(tag => {
                const divTag = document.createElement('div');
                divTag.classList.add('game-tag');
                divTag.textContent = tag;
                divTags.appendChild(divTag);
            });
            divTagsRow.appendChild(divTags);
            divCardContent.appendChild(divTagsRow);
        }

        if (gameDetails.related) {
            const divRelatedRow = this.createGameRow("related", "related games");
            const divRelated = this.createGameRowContainer("related");
            gameDetails.related.forEach(related => {
                const link = document.createElement('a');
                const url = new URL(window.location);
                url.searchParams.set('search', `id:${this.playbook.getAnchorName(related)}`);
                link.href = url;
                link.classList.add('game-related-link');
                link.textContent = related;
                divRelated.appendChild(link);
            });
            divRelatedRow.appendChild(divRelated);
            divCardContent.appendChild(divRelatedRow);
        }

        return divGameCard;
    }

    mdToHtml(markdown) {
        if (typeof marked !== 'undefined') {
            if (markdown.indexOf('\n') === -1) {
                return marked.parseInline(markdown);
            } else {
                return marked.parse(markdown);
            }
        } else {
            console.error('Marked library is not loaded.');
            return '';
        }
    }

    loadGameDetails() {
        const gameName = document.getElementById('game-select').value;
        const gameDetails = this.playbook.getGameDetailsByName(gameName);

        const divGameEdit = document.getElementById('game-edit');
        divGameEdit.innerHTML = '';
        divGameEdit.appendChild(this.createEditDiv(gameDetails));


        this.fitAllTextAreasToContent();
    }


    populateGameSelect(selectElement) {
        const games = this.playbook.getGamesAlphabetized();
        games.forEach(gameName => {
            const option = document.createElement('option');
            option.value = gameName;
            option.textContent = gameName;
            selectElement.appendChild(option);
        });

        selectElement.addEventListener('change', () => this.loadGameDetails());
    }

    populatePageHeader(title = "The (Online) Living Playbook",
        subtitle = "The Unexpected Productions Improv Game List") {

        const headerHtml = `<img class="logo" src="img/UPLogo.svg" alt="Unexpected Productions Improv Logo">
            <div id="page-title" class="page-title"><span>${title}</span></div>
            <div class="logo-counterbalance"><span class="page-subtitle">${subtitle}</span></div>`
        let headerElement = document.getElementById('page-header');
        headerElement.classList.add('page-header');
        headerElement.innerHTML = headerHtml;

    }

    fitTextAreaToContent(textArea) {
        textArea.style.height = 'auto';
        textArea.style.height = (textArea.scrollHeight) + 'px';
    }

    fitAllTextAreasToContent() {
        const textareas = document.querySelectorAll('.field_edit');
        textareas.forEach(textarea => { this.fitTextAreaToContent(textarea); }); 
    }

    async initializeEditPage() {
        
        this.populatePageHeader('Living Playbook Editor', 'Edit Living Playbook Games');

        await this.playbook.loadFromURL('living_playbook.json');
        this.populateGameSelect(document.getElementById('game-select'));
        
        document.getElementById('download-button').addEventListener('click', () => {
            this.playbook.downloadJson();
        });
    
        document.querySelectorAll('.field_edit').forEach(textarea => {
            textarea.addEventListener('input', () => this.fitTextAreaToContent(textarea));
        });

        this.loadGameDetails();
    }


    getEditId(gameId, field) {
        return `edit-${gameId}-${field}`;
    }

    createEditRow(field_type,
        field_label,
        game_field,
        game_id,
        initialValue = null)
    {
        let divRow = document.createElement('div');
        divRow.classList.add('game-row');
        let label = document.createElement('label');
        label.textContent = field_label;
        divRow.appendChild(label);

        switch (field_type) {
            case 'text':
                let input = document.createElement('input');
                input.type = 'text';
                input.id = this.getEditId(game_id, game_field);
                input.classList.add('field_edit');
                input.value = initialValue || '';
                divRow.appendChild(input);
                break;
            case 'textarea':
                let textarea = document.createElement('textarea');
                textarea.id = this.getEditId(game_id, game_field);
                textarea.classList.add('field_edit');
                divRow.appendChild(textarea);
                textarea.oninput = () => this.fitTextAreaToContent(textarea);
                textarea.value = initialValue || '';
                break;
        }

        return divRow;
    }

    createCommitRow(gameId, previewCallback, resetCallback) {
        let divCommitRow = document.createElement('div');
        divCommitRow.classList.add('game-row');
        let previewButton = document.createElement('button');
        previewButton.id = 'preview-button-' + gameId;
        previewButton.textContent = 'Preview Changes';
        previewButton.onclick = previewCallback;
        divCommitRow.appendChild(previewButton);
        let resetButton = document.createElement('button');
        resetButton.id = 'reset-button-' + gameId;
        resetButton.textContent = 'Reset Changes';
        resetButton.onclick = resetCallback;
        divCommitRow.appendChild(resetButton);
        return divCommitRow;
    }

    showPreviewOverlay(oldDetails, newDetails) {
        // Create the above HTML tree via document.createElement
        const overlayElement = document.createElement('div');
        overlayElement.id = 'overlay';
        overlayElement.classList.add('overlay');
        // overlayElement.classList.add('hidden');
        
        const overlayContent = document.createElement('div');
        overlayContent.classList.add('overlay-content');
        overlayElement.appendChild(overlayContent);
        
        const h2 = document.createElement('h2');
        h2.textContent = 'Confirm Changes';
        overlayContent.appendChild(h2);

        const newDetailsDiv = document.createElement('div');
        newDetailsDiv.id = 'new-details';
        overlayContent.appendChild(newDetailsDiv);

        const newDetailsHeader = document.createElement('h3');
        newDetailsHeader.textContent = 'New Details';
        newDetailsDiv.appendChild(newDetailsHeader);

        const newDetailsContent = document.createElement('div');
        newDetailsContent.id = 'new-details-content';
        newDetailsContent.appendChild(this.createGameCardDiv(newDetails));
        newDetailsDiv.appendChild(newDetailsContent);

        const oldDetailsDiv = document.createElement('div');
        oldDetailsDiv.id = 'old-details';
        overlayContent.appendChild(oldDetailsDiv);

        const oldDetailsHeader = document.createElement('h3');
        oldDetailsHeader.textContent = 'Old Details';
        oldDetailsDiv.appendChild(oldDetailsHeader);

        const oldDetailsContent = document.createElement('div');
        oldDetailsContent.id = 'old-details-content';
        oldDetailsContent.appendChild(this.createGameCardDiv(oldDetails));
        oldDetailsDiv.appendChild(oldDetailsContent);

        const confirmButton = document.createElement('button');
        confirmButton.id = 'confirm-button';
        confirmButton.textContent = 'Confirm';
        confirmButton.addEventListener('click', () => {
            const gameName = oldDetails.gameName;
            const gameDetails = this.playbook.getGameDetailsByName(gameName);
        
            gameDetails.gameName = newDetails.gameName;
            gameDetails.gameDetails = newDetails.gameDetails;
            gameDetails.notes = newDetails.notes;
            gameDetails.variations = newDetails.variations;
            gameDetails.aliases = newDetails.aliases;
            gameDetails.related = newDetails.related;
            gameDetails.tags = newDetails.tags;
            gameDetails.anchorName = this.playbook.getAnchorName(gameDetails.gameName); 
            gameDetails.anchorAliases = gameDetails.aliases.map(alias => this.playbook.getAnchorName(alias));
            this.removeOverlay();
        });
        overlayContent.appendChild(confirmButton);

        const cancelButton = document.createElement('button');
        cancelButton.id = 'cancel-button';
        cancelButton.textContent = 'Return to Edit';
        cancelButton.addEventListener('click', () => {
            this.removeOverlay();
        });
        overlayContent.appendChild(cancelButton);

        // Append the overlay to the body
        document.body.appendChild(overlayElement);
    }

    removeOverlay() {
        const overlay = document.getElementById('overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    previewCallback(gameDetails) {
        const gameId = gameDetails.anchorName;

        const getValue = (id, delim = null) => {
            const value = document.getElementById(id).value.trim();
            if (delim != null)
                return value ? value.split(delim).map(v => v.trim()) : [];
            return value;
        };

        const newDetails = {
            gameName: getValue(this.getEditId(gameId, GameField.Name)),
            gameDetails: getValue(this.getEditId(gameId, GameField.Description)),
            notes: getValue(this.getEditId(gameId, GameField.Notes)),
            variations: getValue(this.getEditId(gameId, GameField.Variations), '\n'),
            aliases: getValue(this.getEditId(gameId, GameField.Aliases), ','),
            related: getValue(this.getEditId(gameId, GameField.Related), ','),
            tags: getValue(this.getEditId(gameId, GameField.Tags), ',')
        };

        this.showPreviewOverlay(gameDetails, newDetails);
    }

    createEditDiv(gameDetails) {
        let gameId = gameDetails.anchorName;
        let divEditGame = document.createElement('div');
        divEditGame.id = `game-edit-${gameId}`;
        divEditGame.appendChild(this.createEditRow('text', 'Name:', GameField.Name, gameId, gameDetails.gameName));
        divEditGame.appendChild(this.createEditRow('textarea', 'Description:', GameField.Description, gameId, gameDetails.gameDetails));
        divEditGame.appendChild(this.createEditRow('textarea', 'Notes:', GameField.Notes, gameId, gameDetails.notes));
        divEditGame.appendChild(this.createEditRow('textarea', 'Variations (one per line):', GameField.Variations, gameId, (gameDetails.variations || []).join('\n')));
        divEditGame.appendChild(this.createEditRow('text', 'Aliases (comma-separated):', GameField.Aliases, gameId, (gameDetails.aliases || []).join(', ')));
        divEditGame.appendChild(this.createEditRow('text', 'Related Games (comma-separated):', GameField.Related, gameId, (gameDetails.related || []).join(', ')));
        divEditGame.appendChild(this.createEditRow('text', 'Tags (comma-separated):', GameField.Tags, gameId, (gameDetails.tags || []).join(', ')));
        divEditGame.appendChild(this.createCommitRow(gameId));
        
        const previewButton = divEditGame.querySelector(`#preview-button-${gameId}`);
        previewButton.addEventListener('click', () => {
            const gameName = document.getElementById('game-select').value;
            const gameDetails = this.playbook.getGameDetailsByName(gameName);
    
            const getValue = (gameField, delim = null) => {
                const id = this.getEditId(gameId, gameField);
                const value = document.getElementById(id).value.trim();
                if (delim != null)
                    return value ? value.split(delim).map(v => v.trim()) : [];
                return value;
            };
    
            const newDetails = {
                gameName: getValue(GameField.Name),
                gameDetails: getValue(GameField.Description),
                notes: getValue(GameField.Notes),
                variations: getValue(GameField.Variations, '\n'),
                aliases: getValue(GameField.Aliases, ','),
                related: getValue(GameField.Related, ','),
                tags: getValue(GameField.Tags, ',')
            };

            this.showPreviewOverlay(gameDetails, newDetails);
        });
    
        const resetButton = divEditGame.querySelector(`#reset-button-${gameId}`);
        resetButton.addEventListener('click', () => {
            this.loadGameDetails();
        });
        
        return divEditGame;
    }

}

const g_playbookPage = new PlaybookPage();

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { g_playbookPage };
} else {
    window.playbookPage = g_playbookPage;
}
