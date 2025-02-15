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

        const game = this.data.games.find(game => game.anchorName.toLowerCase() === lowerTerm);
        return game ? lowerTerm : null;
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
}

class PlaybookGlobals {
    constructor() {
        this.dbId = null;
        this.filter = new TagFilter();
        this.playbook = new Playbook();
        this.searchTerm = null;
        this.lazyTimer = null;
    }
}

const globals = new PlaybookGlobals();

function createGameRow(class_name, header="", textContent="")
{
    const divRow = document.createElement('div');
    divRow.classList.add("game-row");
    divRow.classList.add("game-row-" + class_name);
    if (header) {
        const divHeader = document.createElement('div');
        divHeader.classList.add("game-row-header");
        divHeader.textContent = header;
        divRow.appendChild(divHeader);
    }

    if (textContent) {
        const divText = document.createElement('div');
        divText.classList.add("game-row-content");
        divText.classList.add("game-row-text");
        divText.classList.add("game-row-text-" + class_name);
        divText.textContent = textContent;
        divRow.appendChild(divText);
    }
    return divRow;
}

function createGameRowContainer(class_name)
{
    const divRowContainer = document.createElement('div');
    divRowContainer.classList.add(`game-row-${class_name}-container`);
    divRowContainer.classList.add("game-row-container");        
    return divRowContainer;
}


function updateUrlFromState()
{
    const url = new URL(window.location);
    if (globals.searchTerm) {
        url.searchParams.set('search', globals.searchTerm.trim().toLowerCase());
    } else {
        url.searchParams.delete('search');
    }
    
    const yesTags = Array.from(globals.filter.yesTags).join(',');
    if (yesTags && yesTags.length > 0) {
        url.searchParams.set('yesTags', yesTags);
    } else {
        url.searchParams.delete('yesTags');
    }

    const noTags = Array.from(globals.filter.noTags).join(',');
    if (noTags && noTags.length > 0) {
        url.searchParams.set('noTags', noTags);
    } else {
        url.searchParams.delete('noTags');
    }

    window.history.pushState({}, '', url);
}


function lazyUpdateUrlFromState()
{
    if (!lazyTimer) {
        lazyTimer = setTimeout(() => {
            updateUrlFromState();
            lazyTimer = null;
        }, 1000);
    }
}

async function initializeContent() {
    await globals.playbook.loadFromURL(globals.dbId === "2001" ? 'living_playbook_2001.json' : 'living_playbook.json');
    const tags = globals.playbook.getTags();
    if (globals.searchTerm)
    {
        document.getElementById('search-box').value = globals.searchTerm;
    }

    const tagsContainer = document.getElementById('tags-container');
    tags.forEach(tag => {
        const button = document.createElement('button');
        button.className = 'tag-button';
        button.textContent = tag;
        button.dataset.state = 'empty';
        button.addEventListener('click', () => {
            toggleTagState(button, tag);
            populateGameList();
        });
        tagsContainer.appendChild(button);
    });

    tagsContainer.style.display = 'block'; // Ensure tags are visible on load
    populateGameList();
}

function toggleTagState(button, tag) {
    if (button.dataset.state === 'empty') {
        button.dataset.state = 'checked';
        button.classList.add('checked');
        button.classList.remove('unchecked');
        globals.filter.addYesTag(tag);
        globals.filter.noTags.delete(tag);
    } else if (button.dataset.state === 'checked') {
        button.dataset.state = 'unchecked';
        button.classList.add('unchecked');
        button.classList.remove('checked');
        globals.filter.addNoTag(tag);
        globals.filter.yesTags.delete(tag);
    } else {
        button.dataset.state = 'empty';
        button.classList.remove('checked', 'unchecked');
        globals.filter.yesTags.delete(tag);
        globals.filter.noTags.delete(tag);
    }
    updateUrlFromState();
}


function populateGameList() {
    const games = globals.playbook.searchGames(globals.searchTerm, globals.filter);
    const gamesContainer = document.getElementById('games-container');                
    gamesContainer.innerHTML = '';

    games.forEach(gameName => {
        const gameDetails = globals.playbook.getGameDetailsByName(gameName);
        const divGame = document.createElement('div');
        divGame.classList.add("game-card");
        divGame.id = `${gameDetails.anchorName}`;

        const divTitle = document.createElement('div');
        divTitle.classList.add('game-card-title');
        divTitle.textContent = gameDetails.gameName;
        const divCardContent = document.createElement('div');
        divCardContent.classList.add('game-card-content');
        divGame.appendChild(divTitle);
        divGame.appendChild(divCardContent);

        createGameRow("name", "", gameDetails.gameName);
        const divDesc = createGameRow("desc", "description", gameDetails.gameDetails);
        divCardContent.appendChild(divDesc);
        
        if (gameDetails.notes) {
            const divNotesRow = createGameRow("notes", "notes", gameDetails.notes);
            divCardContent.appendChild(divNotesRow);
        }

        if (gameDetails.aliases) {
            const divAliasesRow = createGameRow("aliases", "aliases");
            const divAliases = createGameRowContainer("aliases");
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
            const divTagsRow = createGameRow("tags", "tags");
            const divTags = createGameRowContainer("tags");
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
            const divRelatedRow = createGameRow("related", "related games");
            const divRelated = createGameRowContainer("related");
            gameDetails.related.forEach(related => {
                const link = document.createElement('a');
                // The link is the current page, including existing parameters,
                // but with the gameId query parameter set to the anchor name.
                const url = new URL(window.location);
                url.searchParams.set('search', `id:${globals.playbook.getAnchorName(related)}`);
                link.href = url;
                link.classList.add('game-related-link');
                link.textContent = related;
                divRelated.appendChild(link);
            });
            divRelatedRow.appendChild(divRelated);
            divCardContent.appendChild(divRelatedRow);
        }

        gamesContainer.appendChild(divGame);
    });
}

async function OnPlaybookPageLoad() {
    
    let urlParams = new URLSearchParams(window.location.search);
    globals.dbId = urlParams.get('dbId');
    globals.searchTerm = urlParams.get('search');

    if (globals.dbId === "2001") {
        document.getElementById('page-title').textContent = "The Online Living Playbook: Original 2001 Edition";
    }

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

    const searchBox = document.getElementById('search-box');
    searchBox.addEventListener('input', (event) => {
        globals.searchTerm = event.target.value;
        lazyUpdateUrlFromState();
        populateGameList();
    });

    searchBox.addEventListener('blur', (event) => {
        updateUrlFromState();
    });

    initializeContent();
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { OnPlaybookPageLoad };
} else {
    window.OnPlaybookPageLoad = OnPlaybookPageLoad;
}
