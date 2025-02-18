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
                game.anchorName = this.getAnchorName(game.name);
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

    getGameDetailsByName(name) {
        if (this.data && this.data.games) {
            return this.data.games.find(game => game.name === name) || null;
        }
        return null;
    }

    getAnchorName(name) {
        // // Remove spaces and any non-letter/number characters from name
        return name.replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
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
        .map(game => game.name)
        .sort((a, b) => a.localeCompare(b));
    }

    sanitizeDatabase() {
        if (!this.data || !this.data.games) {
            return;
        }

        function sanitizeArray(arrayValue) {
            if (arrayValue == null || !Array.isArray(arrayValue))
                return undefined;
    
            return arrayValue.filter(value => value.trim() !== '').sort((a, b) => a.localeCompare(b));
        }

        function sanitizeString(stringValue) {
            return stringValue? stringValue.trim() : undefined;
        }
    
        this.data.games.forEach(game => {
            game.name = sanitizeString(game.name);
            game.description = sanitizeString(game.description);
            game.notes = sanitizeString(game.notes);
            game.variations = sanitizeArray(game.variations);
            game.aliases = sanitizeArray(game.aliases);
            game.related = sanitizeArray(game.related);
            game.tags = sanitizeArray(game.tags);
        });

        this.data.games = this.data.games.sort((a, b) => a.name.localeCompare(b.name));

        let unknownRelatedGames = new Set();
        this.data.games.forEach(game => {
            if (!game.related || game.related.length === 0) {
                return;
            }

            game.related.forEach(relatedGame => {
                if (!this.data.games.some(game => game.name === relatedGame)) {
                    unknownRelatedGames.add(relatedGame);
                }
            });
        });
        console.log('Unknown related games:', Array.from(unknownRelatedGames).sort());
    }

    getVersionString() {
        if (!this.data || !this.data.version) {
            return 'Unknown';
        }

        return `${this.data.version.year}.${this.data.version.major}.${this.data.version.minor}`;
    }

    exportJson() {
        this.sanitizeDatabase();
        // Increment minor version number, maintaining leading zeros
        const minorVersion = parseInt(this.data.version.minor, 10) + 1;
        this.data.version.minor = minorVersion.toString().padStart(4, '0');

        const dataWithoutAnchorNames = JSON.stringify(this.data, (key, value) => {
            if (key.toLowerCase() === 'anchorname' || key.toLowerCase() === 'anchoraliases') {
                return undefined;
            }
            return value;
        }, 2);
        return dataWithoutAnchorNames;
    }

    downloadJson() {
        const data = this.exportJson();

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
        this.editMode = false;
    }

    async onPageLoad() {
        let urlParams = new URLSearchParams(window.location.search);
        this.dbId = urlParams.get('dbId');
        this.searchTerm = urlParams.get('search');
        this.editMode = urlParams.get('edit') === '1';
    
        this.initializeCollapsibles();
        this.initializeSearchBox();
    
        await this.playbook.loadFromURL(this.dbId === "2001" ? 'living_playbook_2001.json' : 'living_playbook.json');
    
        this.populatePageHeader(
            `The (${this.dbId === "2001" ? "2001" : "Online"}) Living Playbook`,
            `The Unexpected Productions Improv Game List ${this.playbook.getVersionString()}`
        );

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
        this.populateFooter();
    }

    populateFooter() {
        const footerHtml = `
            <div class="footer-content">
                <div class="horizontal-rule-with-label">License and Copyright Information</div>
                <p>This webpage includes data from <a href="Living-Playbook.pdf">The Living Playbook</a>. The playbook includes the following Copyright notice, which is reproduced here. This page and the data linked to it are given freely, with the same restrictions.</p>
                <p><span>The Copyright:</span>The Living Playbook is Copyright 1995, 2001 by Unexpected Productions. All rights reserved. We fully encourage FREE distribution of this collection but this notice must be left intact. Any distribution, in any form (including, but not limited to, print, CD-ROM, morse code and smoke signals), where profit is being realized without the express written consent of Unexpected Productions is prohibited. Duplication expenses (disks, paper, photocopying) are exempt from this restriction. We want this collection distributed, but only to the advantage of the recipients.</p>
                <p>The original playbook's games and descriptions can also be found in our <a href="?dbId=2001">2001 version</a> of this database.</p>
            </div>
        `;
        const footerElement = document.querySelector('footer');
        footerElement.innerHTML = footerHtml;
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

        if (this.editMode) {
            const downloadButton = document.getElementById('download-json');
            downloadButton.classList.remove('hidden');
            downloadButton.addEventListener('click', () => {
                this.playbook.downloadJson();
            });
        }
    }

    describeSearch(count) {
        const yesTags = this.filter.getYesTags();
        const noTags = this.filter.getNoTags();
        let searchDescription = '';
        if (this.searchTerm) {
            searchDescription = `Search term: ${this.searchTerm}`;
        }

        if (yesTags.length > 0) {
            if (searchDescription !== '')
                searchDescription += '| ';
            searchDescription += `Tags: ${yesTags.join('; ')}`;
        }

        if (noTags.length > 0) {
            if (searchDescription !== '')
                searchDescription += '| ';
            searchDescription += `Excluded tags: ${noTags.join('; ')}`;
        }

        if (searchDescription === '')
            searchDescription = 'All Games, Exercises and Formats';
        
        searchDescription += ` (${count} entries)`;
        
        return searchDescription;
    }

    populateGameList() {
        
        const games = this.playbook.searchGames(this.searchTerm, this.filter);
        const searchDescription = this.describeSearch(games.length);
        const searchDescriptionElement = document.getElementById('search-desc');
            searchDescriptionElement.textContent = searchDescription;

        const gamesContainer = document.getElementById('games-container');                
        gamesContainer.innerHTML = '';
    
        games.forEach(name => {
            const gameDetails = this.playbook.getGameDetailsByName(name);
            gamesContainer.appendChild(this.createGameCardDiv(gameDetails, this.editMode));
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

        const yesTags = Array.from(this.filter.yesTags).join(';');
        if (yesTags && yesTags.length > 0) {
            url.searchParams.set('yesTags', yesTags);
        } else {
            url.searchParams.delete('yesTags');
        }

        const noTags = Array.from(this.filter.noTags).join(';');
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

    createGameCardDiv(gameDetails, editMode = false) {
        const divGameCard = document.createElement('div');
        divGameCard.classList.add("game-card");
        divGameCard.id = `${gameDetails.anchorName}`;

        const divTitle = document.createElement('div');
        divTitle.classList.add('game-card-title');
        divTitle.textContent = gameDetails.name;
        const divCardContent = document.createElement('div');
        divCardContent.classList.add('game-card-content');
        divGameCard.appendChild(divTitle);
        divGameCard.appendChild(divCardContent);

        this.createGameRow("name", "", gameDetails.name);
        const divDesc = this.createGameRow("desc", "description", this.mdToHtml(gameDetails.description));
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

        if (editMode) {
            const divEditRow = this.createGameRow("edit", "edit game");
            const divEditContainer = this.createGameRowContainer("edit");

            const editButton = document.createElement('button');
            editButton.textContent = 'Edit';
            editButton.classList.add('game-edit-button');
            editButton.onclick = () => this.showEditOverlay(gameDetails);
            divEditContainer.appendChild(editButton);
            divEditRow.appendChild(divEditContainer);
            divCardContent.appendChild(divEditRow);
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

    createCommitRow(gameId,
        commitLabel,
        commitCallback,
        resetLabel,
        resetCallback) {
        let divCommitRow = document.createElement('div');
        divCommitRow.classList.add('game-row');
        let previewButton = document.createElement('button');
        previewButton.id = 'preview-button-' + gameId;
        previewButton.textContent = commitLabel;
        previewButton.onclick = commitCallback;
        divCommitRow.appendChild(previewButton);
        let resetButton = document.createElement('button');
        resetButton.id = 'reset-button-' + gameId;
        resetButton.textContent = resetLabel;
        resetButton.onclick = resetCallback;
        divCommitRow.appendChild(resetButton);
        return divCommitRow;
    }

    getDetailsFromDocEditFields(gameId) {
        const getValue = (id, delim = null) => {
            const value = document.getElementById(id).value.trim();
            if (delim != null)
                return value ? value.split(delim).map(v => v.trim()) : null;
            return value;
        };

        const newDetails = {
            name: getValue(this.getEditId(gameId, GameField.Name)),
            description: getValue(this.getEditId(gameId, GameField.Description)),
            notes: getValue(this.getEditId(gameId, GameField.Notes)),
            variations: getValue(this.getEditId(gameId, GameField.Variations), '\n'),
            aliases: getValue(this.getEditId(gameId, GameField.Aliases), ';'),
            related: getValue(this.getEditId(gameId, GameField.Related), ';'),
            tags: getValue(this.getEditId(gameId, GameField.Tags), ';')
        };

        return newDetails;
    }

    previewGameEdit(newDetails) {
        const overlayElement = this.createOverlay();

        const oldDetails = this.playbook.getGameDetailsByName(newDetails.name);
        const gameId = this.playbook.getAnchorName(newDetails.name);
        this.populatePreviewOverlay(overlayElement, oldDetails, newDetails);
        document.body.appendChild(overlayElement);
    }

    createEditDiv(gameDetails,
        commitLabel = "Commit",
        commitCallback = () => { },
        resetLabel = "Reset",
        resetCallback = () => { }) {
        let gameId = this.playbook.getAnchorName(gameDetails.name);
        let divEditGame = document.createElement('div');
        divEditGame.classList.add('game-edit');
        divEditGame.id = `game-edit-${gameId}`;
        divEditGame.appendChild(this.createEditRow('text', 'Name:', GameField.Name, gameId, gameDetails.name));
        divEditGame.appendChild(this.createEditRow('textarea', 'Description:', GameField.Description, gameId, gameDetails.description));
        divEditGame.appendChild(this.createEditRow('textarea', 'Notes:', GameField.Notes, gameId, gameDetails.notes));
        divEditGame.appendChild(this.createEditRow('textarea', 'Variations (one per line):', GameField.Variations, gameId, (gameDetails.variations || []).join('\n')));
        divEditGame.appendChild(this.createEditRow('text', 'Aliases (semi-colon-separated):', GameField.Aliases, gameId, (gameDetails.aliases || []).join('; ')));
        divEditGame.appendChild(this.createEditRow('text', 'Related Games (semi-color-separated):', GameField.Related, gameId, (gameDetails.related || []).join('; ')));
        divEditGame.appendChild(this.createEditRow('text', 'Tags (semi-colon-separated):', GameField.Tags, gameId, (gameDetails.tags || []).join('; ')));
        divEditGame.appendChild(this.createCommitRow(
            gameId,
            commitLabel,
            commitCallback,
            resetLabel,
            resetCallback));
                
        return divEditGame;
    }

    createOverlay(hidden = false) {
        const overlayElement = document.createElement('div');
        overlayElement.id = 'overlay';
        overlayElement.classList.add('overlay');
        if (hidden)
            overlayElement.classList.add('hidden');
        return overlayElement;
    }

    showOverlay(overlayElement, show = true) {
        if (show) {
            overlayElement.classList.remove('hidden');
        } else {
            overlayElement.classList.add('hidden');
        }
    }

    populatePreviewOverlay(overlayElement, oldDetails, newDetails) {
        const overlayContent = document.createElement('div');
        overlayContent.classList.add('overlay-content');
        overlayElement.appendChild(overlayContent);
        
        const h2 = document.createElement('h2');
        h2.textContent = 'Confirm Changes';
        overlayContent.appendChild(h2);

        const detailsDiv = document.createElement('div');
        detailsDiv.classList.add('preview-details-container');
        overlayContent.appendChild(detailsDiv);

        const newDetailsDiv = document.createElement('div');
        newDetailsDiv.id = 'new-details';
        detailsDiv.appendChild(newDetailsDiv);

        const newDetailsHeader = document.createElement('h3');
        
        newDetailsHeader.textContent = oldDetails ? 'Edited Details' : "New Game";
        newDetailsDiv.appendChild(newDetailsHeader);

        const newDetailsContent = document.createElement('div');
        newDetailsContent.id = 'new-details-content';
        newDetailsContent.appendChild(this.createGameCardDiv(newDetails));
        newDetailsDiv.appendChild(newDetailsContent);

        if (oldDetails) {
            const oldDetailsDiv = document.createElement('div');
            oldDetailsDiv.id = 'old-details';
            detailsDiv.appendChild(oldDetailsDiv);

            const oldDetailsHeader = document.createElement('h3');
            oldDetailsHeader.textContent = 'Old Details';
            oldDetailsDiv.appendChild(oldDetailsHeader);

            const oldDetailsContent = document.createElement('div');
            oldDetailsContent.id = 'old-details-content';
            oldDetailsContent.appendChild(this.createGameCardDiv(oldDetails));
            oldDetailsDiv.appendChild(oldDetailsContent);
        }

        const confirmButton = document.createElement('button');
        confirmButton.id = 'confirm-button';
        confirmButton.textContent = 'Confirm';
        confirmButton.addEventListener('click', () => {
            const name = oldDetails ? oldDetails.name : newDetails.name;
            let gameDetails = this.playbook.getGameDetailsByName(name);
            if (gameDetails == null) {
                gameDetails = {};
                this.playbook.data.games.push(gameDetails);
            }

            const fieldAssign = (value) => {
                // If value is an array...
                if (Array.isArray(value) && value.length === 0)
                    return null;
                // If value is a string...
                if (typeof value === 'string' && value.trim() === '')
                    return null;

                return value;
            }

            gameDetails.name = fieldAssign(newDetails.name);
            gameDetails.description = fieldAssign(newDetails.description);
            gameDetails.notes = fieldAssign(newDetails.notes);
            gameDetails.variations = fieldAssign(newDetails.variations);
            gameDetails.aliases = fieldAssign(newDetails.aliases);
            gameDetails.related = fieldAssign(newDetails.related);
            gameDetails.tags = fieldAssign(newDetails.tags);
            gameDetails.anchorName = this.playbook.getAnchorName(gameDetails.name); 
            gameDetails.anchorAliases = gameDetails.aliases ? gameDetails.aliases.map(alias => this.playbook.getAnchorName(alias)) : null;
            overlayElement.remove();
            this.populateGameList();
        });
        overlayContent.appendChild(confirmButton);

        const cancelButton = document.createElement('button');
        cancelButton.id = 'cancel-button';
        cancelButton.textContent = 'Return to Edit';
        cancelButton.addEventListener('click', () => {
            overlayElement.remove();
            this.showEditOverlay(newDetails);
        });
        overlayContent.appendChild(cancelButton);

        overlayElement.appendChild(overlayContent);
        return overlayContent;
    }


    showEditOverlay(gameDetails) {
        const overlayElement = this.createOverlay();
        const gameId = this.playbook.getAnchorName(gameDetails.name);
        const editDiv = this.createEditDiv(gameDetails,
            "Preview Changes",
            () => {
                const newDetails = this.getDetailsFromDocEditFields(gameId);
                overlayElement.remove();
                this.previewGameEdit(newDetails);
            },
            "Cancel",
            () => { overlayElement.remove(); });

        overlayElement.appendChild(editDiv);
        document.body.appendChild(overlayElement);
        this.fitAllTextAreasToContent();
    }
}

const g_playbookPage = new PlaybookPage();

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { g_playbookPage };
} else {
    window.playbookPage = g_playbookPage;
}
