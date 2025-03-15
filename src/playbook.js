function mdToHtml(markdown) {
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

// Enum for page mode
const SearchOp = {
    Everything: "everything",
    Term: "term",
    And: "and",
    Or: "or",
    Not: "not",
    List: "list",
    Tag: "tag",
    Id: "id",
    Uid: "uid",
    StartGroup: "startGroup",
    EndGroup: "endGroup"
};


class SearchNode {
    constructor(operator, left=null, right=null) {
        this.left = left;
        this.right = right;
        this.operator = operator;
    }

    isTerminal() {
        return this.operator === SearchOp.Term
            || this.operator === SearchOp.List
            || this.operator === SearchOp.Tag
            || this.operator === SearchOp.Id
            || this.operator === SearchOp.Uid;
    }

    isBinary() {
        return this.operator === SearchOp.And || this.operator === SearchOp.Or;
    }

    isUnary() {
        return this.operator === SearchOp.Not;
    }

    static GameIncludesTerm(game, searchTerm) {
        if (!searchTerm || searchTerm.trim() === '') {
            return true;
        }

        const termLowerCase = searchTerm.toLowerCase();
        return Object.entries(game).some(([key, value]) => {
            if (key === 'related'
                || key === 'uid')
                return false;

            if (Array.isArray(value)) {
                return value.some(item => item.toLowerCase().includes(termLowerCase));
            } else if (typeof value === 'string') {
                return value.toLowerCase().includes(termLowerCase);
            }
            return false;
        });
    }

    match(game) {
        switch (this.operator) {
            case SearchOp.And:
                // If an argument is left out, treat it as true, so the other operator is what counts.
                return (this.left?.match(game) ?? true) && (this.right?.match(game) ?? true);
            case SearchOp.Or:
                // If an argument is left out, treat it as false, so the other operator is what counts.
                return (this.left?.match(game) ?? false) || (this.right?.match(game) ?? false);
            case SearchOp.Not:
                // If the argument is left out, return false.
                return !(this.left?.match(game) ?? true);
            case SearchOp.Term:
                // An empty term is like a space, so it matches everything.
                if (this.left == null || this.left === '')
                    return true;
                return SearchNode.GameIncludesTerm(game, this.left);
            case SearchOp.List:
                // Empty list: no match.
                if (this.left == null || this.left === '')
                    return false;
                return GameList.fromLocalStorage(this.left).includes(game.uid);
            case SearchOp.Tag:
                // Empty tag?: no match.
                if (this.left == null || this.left === '')
                    return false;
                return game.tags?.includes(this.left) ?? false;
            case SearchOp.Id:
                if (this.left == null || this.left === '')
                    return false;
                return game.anchorName === this.left;
            case SearchOp.Uid:
                if (this.left == null || this.left === '')
                    return false;
                return Number.parseInt(game.uid) === Number.parseInt(this.left);
            default:
                return true;
        }
    }

    getTreeAsString() {
        if (this.isTerminal()) {
            return `(${this.operator}: "${this.left}")`;
        }
        else {
            if (this.right != null)
                return `(${this.operator}: ${this.left.getTreeAsString()}, ${this.right.getTreeAsString()})`;
            else if (this.left != null) {
                console.log(this);
                console.log(this.left);
                return `(${this.operator}: ${this.left.getTreeAsString()})`;
            }
            else
                return `[${this.operator}]` // Everything or StartGroup
        }
    }

    // Helper function to find operator indices while respecting groups
    static FindOperatorIndex(tokens, opType, groups, start, end) {
        for (let i = end; i >= start; i--) {
            // Skip if this index is inside a group
            if (groups.some(group => i > group.start && i < group.end)) {
                continue;
            }
            
            if (tokens[i].operator === opType) {
                return i;
            }
        }
        return -1;
    }

    // Find the matching end group for a start group
    static FindMatchingEndGroup(tokens, startIndex) {
        let depth = 1;
        for (let i = startIndex + 1; i < tokens.length; i++) {
            if (tokens[i].operator === SearchOp.StartGroup) {
                depth++;
            } else if (tokens[i].operator === SearchOp.EndGroup) {
                depth--;
                if (depth === 0) {
                    return i;
                }
            }
        }
        return -1;
    };

    static ParseExpression(tokens, startIndex, endIndex) {
        if (startIndex > endIndex) {
            return null;
        }

        // Create a tree of ParseNodes from the searchNodes array.
        // Sequences such as "A and B or C" will be parsed as "(A and B) or C)"
        // according to operator precedence. The precedence is:
        // 1. Not (Highest)
        // 2. And
        // 3. Or
        
        // Find parenthesized groups, as we know they belong together.
        const groups = [];
        for (let i = startIndex; i <= endIndex; i++) {
            if (tokens[i].operator === SearchOp.StartGroup) {
                const matchingEnd = SearchNode.FindMatchingEndGroup(tokens, i);
                if (matchingEnd !== -1 && matchingEnd <= endIndex) {
                    groups.push({ start: i, end: matchingEnd });
                }
            }
        }
        
        // Create nodes for OR operators (lowest precedence)
        let orIndex = SearchNode.FindOperatorIndex(tokens, SearchOp.Or, groups, startIndex, endIndex);
        if (orIndex !== -1) {
            const left = SearchNode.ParseExpression(tokens, startIndex, orIndex - 1);
            const right = SearchNode.ParseExpression(tokens, orIndex + 1, endIndex);
            return new SearchNode(SearchOp.Or, left, right);
        }
        
        // Create nodes for AND operators (medium precedence)
        let andIndex = SearchNode.FindOperatorIndex(tokens, SearchOp.And, groups, startIndex, endIndex);
        if (andIndex !== -1) {
            const left = SearchNode.ParseExpression(tokens, startIndex, andIndex - 1);
            const right = SearchNode.ParseExpression(tokens, andIndex + 1, endIndex);
            return new SearchNode(SearchOp.And, left, right);
        }
        
        // Find NOT operators (highest precedence)
        if (tokens[startIndex].operator === SearchOp.Not) {
            const operand = SearchNode.ParseExpression(tokens, startIndex + 1, endIndex);
            return new SearchNode(SearchOp.Not, operand);
        }

        // Handle parenthesized groups
        if (tokens[startIndex].operator === SearchOp.StartGroup && 
            tokens[endIndex].operator === SearchOp.EndGroup) {
            return SearchNode.ParseExpression(tokens, startIndex + 1, endIndex - 1);
        }
        
        // Base case: terminal node
        if (startIndex === endIndex) {
            return tokens[startIndex];
        }

        // If we have a single group, process its contents
        const groupStart = SearchNode.FindOperatorIndex(tokens, SearchOp.StartGroup, [], startIndex, endIndex);
        if (groupStart !== -1) {
            const groupEnd = SearchNode.FindMatchingEndGroup(tokens, groupStart);
            if (groupEnd !== -1 && groupEnd <= endIndex) {
                return SearchNode.ParseExpression(tokens, groupStart + 1, groupEnd - 1);
            }
        }
        
        // Fallback: treat as a sequence of AND operations
        const left = tokens[startIndex];
        const right = SearchNode.ParseExpression(tokens, startIndex + 1, endIndex);
        return new SearchNode(SearchOp.And, left, right);
    };
        
    static ParseFromFlatList(searchNodes) {
        if (searchNodes == null || searchNodes.length == 0) {
            return new SearchNode(SearchOp.Everything);
        }

        return SearchNode.ParseExpression(searchNodes, 0, searchNodes.length - 1);    
    }

    static ParseFromString(searchString) {
        if (!searchString || searchString.trim() === '')
            return new SearchNode(SearchOp.Everything);
        searchString = searchString.trim();

        // Split the search string into terms, consider any whitespace as a
        // separator unless it's inside quotes.
        // Parentheses should be treated as individual terms.
        // Create a list of search nodes from the terms
        let searchNodes = [];

        const regex = /(\(|\)|(?:"([^"]+)"|[^\s()]+))/g;
        let match;
        while ((match = regex.exec(searchString)) !== null) {
            let term = match[1] || match[2];
            term = term.trim();
            let quoted = match[2] !== undefined;

            if (term === '')
                continue;
            
            if (quoted) {
                searchNodes.push(new SearchNode(SearchOp.Term, match[2].trim()));
                continue;
            }

            switch (term.toLowerCase()) {
                case 'and':
                    searchNodes.push(new SearchNode(SearchOp.And));
                    break;
                case 'or':
                    searchNodes.push(new SearchNode(SearchOp.Or));
                    break;
                case 'not':
                    searchNodes.push(new SearchNode(SearchOp.Not));
                    break;
                case '(':
                    searchNodes.push(new SearchNode(SearchOp.StartGroup));
                    break;
                case ')':
                    searchNodes.push(new SearchNode(SearchOp.EndGroup));
                    break;
                default:
                    if (term.startsWith('list:')) {
                        searchNodes.push(new SearchNode(SearchOp.List, term.slice(5)));
                    } else if (term.startsWith('tag:')) {
                        const tag = term.slice(4);
                        searchNodes.push(new SearchNode(SearchOp.Tag, tag));
                    } else if (term.startsWith('id:')) {
                        searchNodes.push(new SearchNode(SearchOp.Id, term.slice(3)));
                    } else if (term.startsWith('uid:')) {
                        searchNodes.push(new SearchNode(SearchOp.Uid, parseInt(term.slice(4))));
                    } else {
                        searchNodes.push(new SearchNode(SearchOp.Term, term));
                    }
                    break;
            }

        }

        // Parse the search terms into a tree structure
        return SearchNode.ParseFromFlatList(searchNodes);
    }
}

class SearchFilter {
    constructor() {
        this.searchTerms = [];
        this.tagFilter = new TagFilter();
        this.searchTree = new SearchNode(SearchOp.Everything);
    }

    static fromSearchString(searchString) {
        let filter = new SearchFilter();
        filter.parseString(searchString);
        return filter;
    }


    parseString(searchString) {
        this.searchTree = SearchNode.ParseFromString(searchString);
        console.log(this.searchTree.getTreeAsString());
    }

    matchTerm(game) {
        if (this.searchTree) {
            return this.searchTree.match(game);
        }
        return true;
    }

}

const DatabaseField = {
    Games: "games",
    Contributors: "contributors",
    NextUid: "nextUid",
    Version: "version"
}

const GameField = {
    Name: "name",
    CreatedBy: "createdBy",
    Description: "description",
    Notes: "notes",
    Variations: "variations",
    Aliases: "aliases",
    Related: "related",
    Tags: "tags",
    Uid: "uid"
};

// Enum for page mode
const PageMode = {
    Default: "default",
    SearchFilter: "searchFilter",
    Uid: "uid",
    List: "list"
};


class LocalStore {
    constructor() {
        this.storage = window.localStorage;
    }

    storeItem(key, value) {
        this.storage.setItem(key, JSON.stringify(value));
    }

    retrieveItem(key) {
        return JSON.parse(this.storage.getItem(key));
    }

    retrieveArray(key) {
        return this.retrieveItem(key) || [];
    }

    forgetItem(key) {
        this.storage.removeItem(key);
    }

    getGameListNames(includeFavorites = true) {
        const gameListNames = [];
        for (let i = 0; i < this.storage.length; i++) {
            const key = this.storage.key(i);
            if (key.startsWith('gamelist-')) {
                if (includeFavorites || key !== 'gamelist-Favorites') {
                    gameListNames.push(key.slice(9));
                }
            }
        }
        return gameListNames;
    }
}

class GameList {
    constructor(name) {
        this.name = name;
        // Replace Spaces With Hyphens
        this.storageName = "gamelist-" + name.replace(/\s+/g, '-');
        this.localStorage = new LocalStore();
        this.games = [];
    }

    static fromLocalStorage(name) {
        const gameList = new GameList(name);
        gameList.games = gameList.localStorage.retrieveArray(gameList.storageName);
        return gameList;
    }

    saveToLocalStorage() {
        localStorage.setItem(this.storageName, JSON.stringify(this.games));
    }

     // Add static method to create a GameList from an array
    addGame(uid) {
        this.games.push(uid);
        this.saveToLocalStorage();
    }

    removeGame(uid) {
        const index = this.games.indexOf(uid);
        if (index > -1) {
            this.games.splice(index, 1);
        }
        this.saveToLocalStorage();
    }

    includes(uid) {
        return this.games.includes(uid);
    }

    getGames() {
        return this.games;
    }

}


class Playbook {
    constructor() {
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

        let termLowerCase = term.toLowerCase();
        if (termLowerCase.startsWith("id:")) {
            termLowerCase = termLowerCase.slice(3);
        }

        const game = this.data.games.find(game => 
            game.anchorName === termLowerCase || 
            (game.anchorAliases && game.anchorAliases.includes(termLowerCase))
        );
        return game ? game.anchorName : null;
    }

    searchGames(searchString, tagFilter = null) {
        if (!this.data || !this.data.games) {
            return [];
        }

        let searchFilter = SearchFilter.fromSearchString(searchString);
       
        return this.data.games
            .filter(game => {
                if (!searchFilter.matchTerm(game)) {
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

    getNextUid(inc=true) {
        // Check if nextUid exists and use its value if it's a number, otherwise default to 1
        const uid = (typeof this.data.nextUid === 'number') ? this.data.nextUid : 1;
        this.data.nextUid = inc ? uid + 1 : uid;
        return uid;
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
    
        // Create a list to hold games which need new uids.
        const gamesWithNoUid = [];
        // Create a set to ensure unique uids.
        const uids = new Set();

        this.data.games.forEach(game => {
            // If a game does not have a unique ID integer in game.uid, give it one.
            if (!game.uid || typeof game.uid !== 'number') {
                gamesWithNoUid.push(game);    
            }
            else
            {
                if (game.uid == -1 || uids.has(game.uid)) {
                    game.uid = undefined;
                    gamesWithNoUid.push(game);
                }
                else {
                    uids.add(game.uid);
                    if (game.uid >= this.data.nextUid) {
                        this.data.nextUid = game.uid + 1;
                    }
                }
            }

            game.name = sanitizeString(game.name);
            game.createdBy = sanitizeString(game.createdBy);
            game.description = sanitizeString(game.description);
            game.notes = sanitizeString(game.notes);
            game.variations = sanitizeArray(game.variations);
            game.aliases = sanitizeArray(game.aliases);
            game.related = sanitizeArray(game.related);
            game.tags = sanitizeArray(game.tags);
        });

        gamesWithNoUid.forEach(game => {
            game.uid = this.getNextUid();
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

        if (unknownRelatedGames.size > 0)
            console.log('Unknown related games:', Array.from(unknownRelatedGames).sort());
    
        // If there is a this.data.contributors array, sort it by the last word in the string (last name).
        if (this.data.contributors) {
            this.data.contributors = this.data.contributors.sort((a, b) => {
                const aName = a.split(' ').pop();
                const bName = b.split(' ').pop();
                return aName.localeCompare(bName);
            });
        }
    }

    getDatabaseValue(databaseField) {
        switch (databaseField) {
            case DatabaseField.Games:
                return this.data.games;
            case DatabaseField.Contributors:
                return this.data.contributors;
            case DatabaseField.NextUid:
                return this.data.nextUid;
            case DatabaseField.Version:
                return this.data.version;
            default:
                return null;
        }
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

class PlaybookPage {
    constructor() {
        this.pageMode = PageMode.Default;
        this.dbId = null;
        this.filter = new TagFilter();
        this.playbook = new Playbook();
        this.searchTerm = null;
        this.lazyTimer = null;
        this.editMode = false;
        this.favoriteList = GameList.fromLocalStorage("Favorites");
    }

    onDatabaseLoad() {
        const version = this.playbook.getDatabaseValue(DatabaseField.Version);
        this.populatePageHeader(
            `The (${this.dbId === "2001" ? "2001" : "Online"}) Living Playbook`,
            `The Unexpected Productions Improv Game List`,
            `Version ${version.major}.${version.minor}` // Add version number
        );

        const tags = this.playbook.getTags();
        if (this.searchTerm)
            document.getElementById('search-box').value = this.searchTerm;

        const tagsContainer = document.getElementById('tags-container');
        tags.forEach(tag => {
            const button = document.createElement('button');
            button.className = 'tag-button';
            button.textContent = tag;
            if (this.filter.yesTags.has(tag)) {
                button.dataset.state = 'checked';
                button.classList.add('checked');
            } else if (this.filter.noTags.has(tag)) {
                button.dataset.state = 'unchecked';
                button.classList.add('unchecked');
            } else {
                button.dataset.state = 'empty';
            }
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
    
    async onPageLoad() {
        let urlParams = new URLSearchParams(window.location.search);
        this.dbId = urlParams.get('dbId');
        this.searchTerm = urlParams.get('search');
        this.filter.yesTags = new Set(urlParams.get('yesTags')?.split(';'));
        this.filter.noTags = new Set(urlParams.get('noTags')?.split(';'));
        this.uid = urlParams.get('uid');
        this.list = urlParams.get('list');

        if (this.searchTerm != null) {
            this.pageMode = PageMode.SearchFilter;
        }
        else if (this.uid != null) {
            this.pageMode = PageMode.Uid;
            this.searchTerm = "uid:" + this.uid;
        }
        else if (this.list != null) {
            this.pageMode = PageMode.List;
        }

        this.editMode = urlParams.get('edit') === '1';
    
        // Populate the control-pane div
        this.populateControlPane();
        this.initializeCollapsibles();
    
        this.playbook.loadFromURL(this.dbId === "2001" ? 'living_playbook_2001.json' : 'living_playbook.json')
            .then(() => {
                this.onDatabaseLoad();
            })
            .catch(error => {
                console.error("Error loading database:", error);
            });
    }

    createTagFilterSection() {
        // Create tag filter section
        const tagHeader = document.createElement('div');
        tagHeader.className = 'collapsible-header';
        tagHeader.textContent = 'Filter By Tags';
        
        const tagContent = document.createElement('div');
        tagContent.className = 'collapsible-content';
        
        const paragraph = document.createElement('p');
        
        const tagsContainer = document.createElement('div');
        tagsContainer.id = 'tags-container';
        paragraph.appendChild(tagsContainer);
        
        const tagInstructions = document.createElement('span');
        
        const includeSpan = document.createElement('span');
        includeSpan.className = 'include-only';
        includeSpan.textContent = 'Green to include only games with this tag.';
        tagInstructions.appendChild(includeSpan);
        
        const space = document.createTextNode(' ');
        tagInstructions.appendChild(space);
        
        const excludeSpan = document.createElement('span');
        excludeSpan.className = 'exclude-only';
        excludeSpan.textContent = 'Red to exclude games with this tag.';
        tagInstructions.appendChild(excludeSpan);
        
        paragraph.appendChild(tagInstructions);
        tagContent.appendChild(paragraph);

        const tagFilterSection = document.createElement('div');
        tagFilterSection.id = 'tag-filter-section';
        tagFilterSection.className = 'tag-filter-section';
        tagFilterSection.appendChild(tagHeader);
        tagFilterSection.appendChild(tagContent);
        return tagFilterSection;
    }

    populateControlPane() {
        const controlPane = document.getElementById('control-pane');
        
        // Create search section
        const searchSection = document.createElement('div');
        searchSection.id = 'search-section';
        searchSection.className = 'search-container';
        
        // Create search box
        const searchBox = document.createElement('input');
        searchBox.type = 'search';
        searchBox.id = 'search-box';
        searchBox.className = 'search-textbox';
        searchBox.placeholder = 'Search games...';
        searchSection.appendChild(searchBox);

        searchBox.addEventListener('input', (event) => {
            this.searchTerm = event.target.value;
            this.lazyUpdateUrlFromState();
            this.populateGameList();
        });
    
        searchBox.addEventListener('blur', (event) => {
            this.updateUrlFromState();
        });

        if (this.editMode) {
            // Create download button (hidden by default)
            const downloadButton = document.createElement('button');
            downloadButton.id = 'download-json';
            downloadButton.className = 'game-edit-button';
            downloadButton.textContent = 'Download Json';
            searchSection.appendChild(downloadButton);
            downloadButton.classList.remove('hidden');
            downloadButton.addEventListener('click', () => {
                this.playbook.downloadJson();
            });
        }
        
                
        // Add all elements to control pane
        controlPane.appendChild(searchSection);
        controlPane.appendChild(this.createTagFilterSection());
    }


    populateFooter() {
        // combine this.data.contributors array into one comma-separated string
        let conStr = "";
        const contributors = this.playbook.getDatabaseValue(DatabaseField.Contributors);
        if (contributors)
        {
            contributors.forEach( (contributor, index) => {
                if (index > 0) {
                    conStr += ", ";
                }
                conStr += contributor;
            });
            conStr += " and ";
        }
        conStr += "many friends, company members, teachers and supporters of Unexpected Productions.";

        const footerHtml = `
            <div class="footer-content">
                <div class="horizontal-rule-with-label">License and Copyright Information</div>
                <p>The Online Living Playbook © 2025, maintained by <a href="https://tinybeeman.com/">Tony Beeman</a>, is licensed under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/?ref=chooser-v1">CC BY-NC-SA 4.0</a>.</p>
                <p>Suggestions can be made by filing an issue via the <a href="https://github.com/TinyBeeman/LivingPlaybook">Github Repository</a>.</p>
                <p>This webpage includes data from the original <a href="Living-Playbook.pdf">Living Playbook</a> document, maintained by Unexpected Productions and Randy Dixon through 2001. The playbook includes the following Copyright notice, which is reproduced here. This page and the data linked to it are given freely, with the same restrictions.</p>
                <p><span>The Copyright:</span>The Living Playbook is Copyright 1995, 2001 by Unexpected Productions. All rights reserved. We fully encourage FREE distribution of this collection but this notice must be left intact. Any distribution, in any form (including, but not limited to, print, CD-ROM, morse code and smoke signals), where profit is being realized without the express written consent of Unexpected Productions is prohibited. Duplication expenses (disks, paper, photocopying) are exempt from this restriction. We want this collection distributed, but only to the advantage of the recipients.</p>
                <p>The original playbook's games and descriptions can also be found in our <a href="?dbId=2001">2001 version</a> of this database.</p>
                <p>Contributors to this database include ${conStr}</p>     
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
        
        searchDescription += count == 1 ? ` (1 entry)` : ` (${count} entries)`;
        
        return searchDescription;
    }

    populateGameList() {
        const games = this.playbook.searchGames(this.searchTerm, this.filter);
        const searchDescription = this.describeSearch(games.length);
        const searchDescriptionElement = document.getElementById('search-desc');
            searchDescriptionElement.textContent = searchDescription;

        const gamesContainer = document.getElementById('games-container');                
        gamesContainer.innerHTML = '';
    
        let lastLetter = '';
        games.forEach(name => {
            const gameDetails = this.playbook.getGameDetailsByName(name);
            if (name[0].toLowerCase() !== lastLetter) {
                lastLetter = name[0].toLowerCase();
                const divLetter = document.createElement('div');
                divLetter.classList.add('game-letter-rule-line');
                divLetter.textContent = lastLetter.toUpperCase();
                gamesContainer.appendChild(divLetter);
            }

            gamesContainer.appendChild(this.createGameCardDiv(gameDetails, this.editMode));
        });
    }

    updateUrlFromState() {
        const url = new URL(window.location);
        url.searchParams.delete('uid');
        url.searchParams.delete('search');
        url.searchParams.delete('yesTags');
        url.searchParams.delete('noTags');
        url.searchParams.delete('list');

        if (this.searchTerm) {
            // If the search term includes uid:[integer] as a substring, set the uid parameter
            const uidMatch = this.searchTerm.match(/uid:(\d+)/);
            if (uidMatch) {
                url.searchParams.set('uid', uidMatch[1]);
            } else {
                url.searchParams.set('search', this.searchTerm.trim().toLowerCase());
            }
        }

        const yesTags = Array.from(this.filter.yesTags).join(';');
        if (yesTags && yesTags.length > 0)
            url.searchParams.set('yesTags', yesTags);

        const noTags = Array.from(this.filter.noTags).join(';');
        if (noTags && noTags.length > 0)
            url.searchParams.set('noTags', noTags);

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

    createFavoriteButton(gameDetails) {
        function updateFavoriteButton(favButton) {
            if (favButton.classList.contains('favorited')) {
                favButton.setAttribute('title', 'Remove from favorites');
            } else {
                favButton.setAttribute('title', 'Add to favorites');
            }
        }

        // Add favorite button
        const favButton = document.createElement('button');
        favButton.classList.add('heart-button');
        favButton.classList.add('card-title-button');
        if (this.favoriteList.includes(gameDetails.uid)) {
            favButton.classList.add('favorited');
        }
        updateFavoriteButton(favButton);
        favButton.addEventListener('click', () => {
            if (favButton.classList.contains('favorited')) {
                this.favoriteList.removeGame(gameDetails.uid);
            } else {
                this.favoriteList.addGame(gameDetails.uid);
            }
            favButton.classList.toggle('favorited');
            
            updateFavoriteButton(favButton);
        });
        return favButton;    
    }

    createAddToListButton(gameDetails) {
        const addToListButton = document.createElement('button');
        addToListButton.classList.add('add-to-list-button');
        addToListButton.classList.add('card-title-button');
        addToListButton.setAttribute('title', 'Add to List');

        addToListButton.addEventListener('click', () => {
            // Show pop-up UI to select a list
            const addToListDiv = document.createElement('div');
            addToListDiv.classList.add('add-to-list-div');
            
            const gameListNames = this.favoriteList.localStorage.getGameListNames(false);

            // Create a list of checkboxes for each game list
            const listSelect = document.createElement('div');
            listSelect.classList.add('add-to-list-menu');


            // Create a button to add to a new list
            const newListButton = document.createElement('button');            
            newListButton.textContent = 'Add to New List...';
            newListButton.onclick = () => {
                const newListName = prompt('Enter a name for the new list:');
                if (newListName) {
                    const newList = GameList.fromLocalStorage(newListName);
                    newList.addGame(gameDetails.uid);
                    newList.saveToLocalStorage();
                    addToListDiv.remove();
                }
            }
            listSelect.appendChild(newListButton);
            
            gameListNames.forEach(listName => {
                const menuItem = document.createElement('div');
                menuItem.classList.add('add-to-list-menu-item');

                const listCheckbox = document.createElement('input');
                listCheckbox.type = 'checkbox';
                listCheckbox.id = `list-${listName}`;
                listCheckbox.value = listName;
                const list = GameList.fromLocalStorage(listName);
                listCheckbox.dataset.list = listName;
                listCheckbox.checked = list.includes(gameDetails.uid);
                const label = document.createElement('label');
                label.htmlFor = `list-${listName}`;
                label.textContent = listName;
                menuItem.appendChild(listCheckbox);
                menuItem.appendChild(label);

                listCheckbox.addEventListener('change', () => {
                    if (listCheckbox.checked) {
                        list.addGame(gameDetails.uid);
                    } else {
                        list.removeGame(gameDetails.uid);
                    }
                });
                listSelect.appendChild(menuItem);
            });
            addToListDiv.appendChild(listSelect);

            // Add addToListDiv so it pops up as a context menu off of the button
            document.body.appendChild(addToListDiv);
            addToListDiv.style.top = `${addToListButton.getBoundingClientRect().top + window.scrollY}px`;
            addToListDiv.style.left = `${addToListButton.getBoundingClientRect().left + window.scrollX}px`;

            // Remove the addToListDiv when clicking outside of it
            const removeAddToListDiv = (event) => {
                if (!addToListDiv.contains(event.target) && event.target !== addToListButton) {
                    addToListDiv.remove();
                    document.removeEventListener('click', removeAddToListDiv);
                }
            };
            document.addEventListener('click', removeAddToListDiv);  
            

        });

        return addToListButton;
    }

    createShareButton(gameDetails) {
        const shareButton = document.createElement('button');
        shareButton.classList.add('share-button');
        shareButton.classList.add('card-title-button');
        shareButton.setAttribute('title', 'Share Game');

        // Create a pop-up with a link to the game, and a button to copy the link.
        // The link's format is the current base url with a uid parameter.
        shareButton.addEventListener('click', () => {
            const shareDiv = document.createElement('div');
            shareDiv.classList.add('share-div');
            const shareLink = document.createElement('input');
            shareLink.type = 'text';
            shareLink.value = `${window.location.origin}?${this.dbId ? 'dbId=' + this.dbId : ''}&uid=${gameDetails.uid}`;
            shareLink.readOnly = true;
            shareDiv.appendChild(shareLink);

            const copyButton = document.createElement('button');
            copyButton.textContent = 'Copy Link';
            copyButton.addEventListener('click', () => {
                shareLink.select();
                // deprecated: document.execCommand('copy');
                navigator.clipboard.writeText(shareLink.value);
                alert('Link copied to clipboard!');
            });
            shareDiv.appendChild(copyButton);

            // Add shareDiv so it pops up as a context menu off of the button
            document.body.appendChild(shareDiv);
            shareDiv.style.top = `${shareButton.getBoundingClientRect().top + window.scrollY}px`;
            shareDiv.style.left = `${shareButton.getBoundingClientRect().left + window.scrollX}px`;

            // Remove the shareDiv when clicking outside of it
            const removeShareDiv = (event) => {
                if (!shareDiv.contains(event.target) && event.target !== shareButton) {
                    shareDiv.remove();
                    document.removeEventListener('click', removeShareDiv);
                }
            };
            document.addEventListener('click', removeShareDiv);  
        });

        return shareButton;
    }

    createGameCardDiv(gameDetails, editMode = false) {

        function createGameRowContainer(class_name) {
            const divRowContainer = document.createElement('div');
            divRowContainer.classList.add(`game-row-${class_name}-container`);
            divRowContainer.classList.add("game-row-container");        
            return divRowContainer;
        }
        
        function createGameRowText(class_name, innerHTML="") {
            const divText = document.createElement('div');
            divText.classList.add("game-row-content");
            divText.classList.add("game-row-text");
            divText.classList.add("game-row-text-" + class_name);
            divText.innerHTML = innerHTML;
            return divText;
        }

        function createGameRow(class_name, header="", innerHTML="") {
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
                const divText = createGameRowText(class_name, innerHTML);
                divRow.appendChild(divText);
            }
            return divRow;
        }
    
        const divGameCard = document.createElement('div');
        divGameCard.classList.add("game-card");
        divGameCard.id = `${gameDetails.anchorName}`;

        const divTitle = document.createElement('div');
        divTitle.classList.add('game-card-title');
        divTitle.textContent = gameDetails.name;

        divTitle.appendChild(this.createFavoriteButton(gameDetails));
        divTitle.appendChild(this.createAddToListButton(gameDetails));
        divTitle.appendChild(this.createShareButton(gameDetails));

        if (editMode) {
            const editButton = document.createElement('button');
            editButton.classList.add('edit-button');
            editButton.classList.add('card-title-button');
            editButton.onclick = () => this.showEditOverlay(gameDetails);
            editButton.setAttribute('title', 'Edit Game');
            divTitle.appendChild(editButton);
        }

        const divCardContent = document.createElement('div');
        divCardContent.classList.add('game-card-content');
        divGameCard.appendChild(divTitle);
        divGameCard.appendChild(divCardContent);

        createGameRow("name", "", gameDetails.name);
        const divDesc = createGameRow("desc", "description", mdToHtml(gameDetails.description));
        divCardContent.appendChild(divDesc);

        if (gameDetails.notes) {
            const divNotesRow = createGameRow("notes", "notes", mdToHtml(gameDetails.notes));
            divCardContent.appendChild(divNotesRow);
        }

        if (gameDetails.variations) {
            const divVariationsRow = createGameRow("variations", "variations");
            gameDetails.variations.forEach(variation => {
                divVariationsRow.appendChild(createGameRowText("variation", mdToHtml(variation)));
            });
            divCardContent.appendChild(divVariationsRow);
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

        if (gameDetails.createdBy) {
            const divCreatedByRow = createGameRow("createdBy", "createdBy", mdToHtml(gameDetails.createdBy));
            divCardContent.appendChild(divCreatedByRow);
        }

        return divGameCard;
    }

    populatePageHeader(title = "The (Online) Living Playbook",
        subtitle = "The Unexpected Productions Improv Game List",
        version = "") {

        const headerHtml = `<img class="logo" src="img/UPLogo.svg" alt="Unexpected Productions Improv Logo">
            <div id="page-title" class="page-title">
                <span>${title}</span>
                <span class="page-subtitle">${version}</span>
            </div>
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
            tags: getValue(this.getEditId(gameId, GameField.Tags), ';'),
            createdBy: getValue(this.getEditId(gameId, GameField.CreatedBy))
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
        divEditGame.appendChild(this.createEditRow('textarea', 'Created By:', GameField.CreatedBy, gameId, gameDetails.createdBy));
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
            gameDetails.createdBy = fieldAssign(newDetails.createdBy);
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
