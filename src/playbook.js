class Util {

    static BytesToBase64(bytes) {
        const binString = String.fromCodePoint(...bytes);
        return btoa(binString);
    }

    static UrlEncodeByteArray(bytes) {
        return encodeURIComponent(String.fromCharCode(...bytes));
    }

    static EncodeIntegerSet(setInt) {
        // Let's assume setInt is a Set of integers which are > 0 and < 2048.
        // We can use a bitmask to encode the set into a string.
        // The bitmask will be an 8-bit integer, so we can use a single integer
        // to represent each 8-number chunk of the set.
        
        // Get the max value in the set
        const maxVal = Math.max(...setInt);
        // Calculate the number of bitmasks needed
        const numBitmasks = Math.ceil((maxVal + 1) / 8);
        
        // Create a bitmask array of 8-bit integers
        let bitmasks = [];
        for (let range = 0; range < numBitmasks; range++) {
            let i = range * 8;
            let mask = 0;
            for (let j = 0; j < 8; j++) {
                if (setInt.has(i + j)) {
                    mask |= (1 << j);
                }
            }
            bitmasks.push(mask);
        }

        return encodeURIComponent(String.fromCharCode(...bitmasks));
    }

    // encodedString comes from URLSearchParams.get(), which has already undone the
    // encodeURIComponent above. Decoding it a second time corrupted, or threw on, any list
    // whose bitmask contained a '%' byte (0x25).
    static DecodeIntegerSet(encodedString) {
        const bitmasks = Array.from(encodedString).map(char => char.charCodeAt(0));

        let setInt = new Set();
        bitmasks.forEach((mask, index) => {
            for (let j = 0; j < 8; j++) {
                if (mask & (1 << j)) {
                    setInt.add(index * 8 + j);
                }
            }
        });

        return setInt;
    }
}

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
    Uids: "uids",
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
            || this.operator === SearchOp.Uid
            || this.operator === SearchOp.Uids;
    }

    isBinary() {
        return this.operator === SearchOp.And || this.operator === SearchOp.Or;
    }

    isUnary() {
        return this.operator === SearchOp.Not;
    }

    static GameIncludesTerm(game, searchTerm) {
        if (!searchTerm)
            return true;

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
            case SearchOp.Uids:
                if (this.left == null || this.left === '')
                    return false;
                return this.left.includes(game.uid);
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
                searchNodes.push(new SearchNode(SearchOp.Term, match[2]));
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
                    } else if (term.startsWith('uids:')) {
                        searchNodes.push(new SearchNode(SearchOp.Uids, term.slice(5).split(',').map(uid => parseInt(uid))));
                    } else {
                        searchNodes.push(new SearchNode(SearchOp.Term, term));
                    }
                    break;
            }

        }

        // Parse the search terms into a tree structure
        return SearchNode.ParseFromFlatList(searchNodes);
    }

    static GetSearchType(searchString) {
        let rootNode = SearchNode.ParseFromString(searchString);
        return rootNode.operator;
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
        // console.log(this.searchTree.getTreeAsString());
    }

    matchTerm(game) {
        if (this.searchTree) {
            return this.searchTree.match(game);
        }
        return true;
    }

}

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
                if (includeFavorites || key !== 'gamelist-favorites') {
                    let saveObj = this.retrieveItem(key);
                    if (saveObj) {
                        gameListNames.push(saveObj.name);
                    }
                }
            }
        }
        return gameListNames;
    }
}

class GameList {
    constructor(name) {
        this.name = GameList.SanitizeGameName(name);
        this.localStorage = new LocalStore();
        this.games = [];
    }

    static SanitizeGameName(name) {
        name = name.replace(/\s+/g, '-');
        return name.replace(/[^A-Za-z0-9-]+/g, '');
    }

    getStorageName() {
        return "gamelist-" + this.name.toLowerCase();
    }

    static fromLocalStorage(name) {
        const gameList = new GameList(name);
        let saveObj = gameList.localStorage.retrieveItem(gameList.getStorageName());
        if (saveObj) {
            gameList.name = saveObj.name;
            gameList.games = saveObj.games;
        }
        return gameList;
    }

    saveToLocalStorage() {
        let saveObj = {
            name: this.name,
            games: this.games
        };
        localStorage.setItem(this.getStorageName(), JSON.stringify(saveObj));
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

    static GetAllGameListNames() {
        const localStore = new LocalStore();
        return localStore.getGameListNames();
    }
}

class Playbook {
    constructor() {
        this.data = null;
    }

    // Throws if the file can't be fetched or parsed, so the page can say so.
    async loadFromURL(url) {
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
        .sort((a, b) => a.name.localeCompare(b.name));
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
        this.favoriteList = GameList.fromLocalStorage("Favorites");
        this.currentGames = [];
    }

    onDatabaseLoad() {
        const version = this.playbook.data.version;
        this.populatePageHeader(
            `The (${this.dbId === "2001" ? "2001" : "Online"}) Living Playbook`,
            `The Unexpected Productions Improv Game List`,
            `Version ${version.year}.${Number(version.major)}.${Number(version.minor)}`
        );

        const tags = this.playbook.getTags();
        this.dropUnknownTags(tags);
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

    // A link can name a tag that no longer exists (renamed or merged since, or from the other
    // edition). With no button for it, it would filter out every game and couldn't be turned
    // off, so ignore it, say so, and fix the URL.
    dropUnknownTags(knownTags) {
        const known = new Set(knownTags);
        const dropped = [];
        for (const set of [this.filter.yesTags, this.filter.noTags]) {
            for (const tag of Array.from(set)) {
                if (!known.has(tag)) {
                    set.delete(tag);
                    if (tag !== '')
                        dropped.push(tag);
                }
            }
        }
        if (dropped.length === 0)
            return;

        const url = new URL(window.location);
        for (const [param, set] of [['yesTags', this.filter.yesTags], ['noTags', this.filter.noTags]]) {
            const value = Array.from(set).join(';');
            if (value)
                url.searchParams.set(param, value);
            else
                url.searchParams.delete(param);
        }
        window.history.replaceState({}, '', url);

        const plural = dropped.length === 1 ? 'tag' : 'tags';
        this.showNotice(`This link used the ${plural} “${dropped.join('”, “')}”, which ${dropped.length === 1 ? "isn't" : "aren't"} in this playbook any more, so ${dropped.length === 1 ? 'it was' : 'they were'} ignored.`);
    }

    showNotice(text, isError = false) {
        const notice = document.getElementById('page-notice');
        notice.textContent = text;
        notice.classList.toggle('page-notice-error', isError);
        notice.setAttribute('role', isError ? 'alert' : 'status');
        notice.hidden = false;
    }

    onDatabaseLoadFailed(error) {
        console.error("Error loading database:", error);
        this.populatePageHeader(
            `The (${this.dbId === "2001" ? "2001" : "Online"}) Living Playbook`,
            `The Unexpected Productions Improv Game List`);
        document.getElementById('search-desc').textContent = '';
        this.showNotice("Sorry, the playbook couldn't be loaded. Please check your connection and reload the page.", true);
    }

    async onPageLoad() {
        let urlParams = new URLSearchParams(window.location.search);
        this.dbId = urlParams.get('dbId');
        this.searchTerm = urlParams.get('search');
        this.filter.yesTags = new Set(urlParams.get('yesTags')?.split(';'));
        this.filter.noTags = new Set(urlParams.get('noTags')?.split(';'));
        this.uid = urlParams.get('uid');
        // An empty uids= (e.g. a link to an empty list) is treated as no list at all.
        const uidsParam = urlParams.get('uids');
        this.uids = uidsParam ? Array.from(Util.DecodeIntegerSet(uidsParam)) : null;

        if (this.searchTerm != null) {
            this.pageMode = PageMode.SearchFilter;
        }
        else if (this.uid != null) {
            this.pageMode = PageMode.Uid;
            this.searchTerm = "uid:" + this.uid;
        }
        else if (this.uids != null) {
            this.pageMode = PageMode.Uids;
            this.searchTerm = "uids:" + this.uids.join(',');
        }

        // Populate the control-pane div
        this.populateControlPane();
        this.initializeCollapsibles();
    
        this.playbook.loadFromURL(this.dbId === "2001" ? 'living_playbook_2001.json' : 'living_playbook.json')
            .then(() => {
                this.onDatabaseLoad();
            })
            .catch(error => {
                this.onDatabaseLoadFailed(error);
            });
    }

    createTagFilterSection() {
        // Create tag filter section
        const tagHeader = document.createElement('div');
        tagHeader.className = 'collapsible-header';
        tagHeader.textContent = 'Filter By Tags';
        
        const tagContent = document.createElement('div');
        tagContent.className = 'collapsible-content';
        
        // const paragraph = document.createElement('p');
        
        const tagsContainer = document.createElement('div');
        tagsContainer.id = 'tags-container';
        tagContent.appendChild(tagsContainer);
        
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
        
        //paragraph.appendChild(tagInstructions);
        tagContent.appendChild(tagInstructions);

        const tagFilterSection = document.createElement('div');
        tagFilterSection.id = 'tag-filter-section';
        tagFilterSection.className = 'tag-filter-section';
        tagFilterSection.appendChild(tagHeader);
        tagFilterSection.appendChild(tagContent);
        return tagFilterSection;
    }

    populateListsDiv(listsDiv = null) {
        if (listsDiv == null)
            listsDiv = document.getElementById('lists-container');

        let listName = null;
        if (this.searchTerm && this.searchTerm.startsWith("list:")) {
            if (SearchNode.GetSearchType(this.searchTerm) == SearchOp.List) {
                listName = this.searchTerm.slice(5);
            }
        }
        listsDiv.innerHTML = '';

        const listNames = GameList.GetAllGameListNames();
        // Move "Favorites" to the front of the list
        const favoritesIndex = listNames.indexOf("Favorites");
        if (favoritesIndex > -1) {
            listNames.splice(favoritesIndex, 1);
            listNames.unshift("Favorites");
        }

        if (listNames.length === 0) {
            const listRow = document.createElement('div');
            listRow.className = 'row';
            listsDiv.appendChild(listRow);

            const noListsMessage = document.createElement('div');
            noListsMessage.className = 'no-lists-message';
            noListsMessage.textContent = "You don't have any lists or favorited games. Click some 💖's, add a game to a new list, or create a list from a search using the button below.";
            listRow.appendChild(noListsMessage);
            return;
        }
        else {
            listNames.forEach(name => {
                const listRow = document.createElement('div');
                listRow.className = 'row';
                listsDiv.appendChild(listRow);

                const listButton = document.createElement('button');
                listButton.className = 'tag-button';
                listButton.textContent = name;
                if (listName != null && name.toLowerCase() === listName.toLowerCase()) {
                    listButton.classList.add('checked');
                }

                listButton.addEventListener('click', () => {
                    const game = GameList.fromLocalStorage(name);
                    if (listButton.classList.contains('checked')) {
                        this.updateSearchString("", true);
                    }
                    else
                    {
                        this.updateSearchString("list:" + name, true);
                    }
                    this.populateListsDiv(listsDiv);
                });


                listRow.appendChild(listButton);
                if (name !== "Favorites") {
                    const deleteListButton = document.createElement('button');
                    deleteListButton.classList.add('list-delete-button');
                    deleteListButton.classList.add('list-button');
                    deleteListButton.attributes['title'] = 'Delete List';
                    deleteListButton.addEventListener('click', (event) => {
                        event.stopPropagation();
                        const gameList = GameList.fromLocalStorage(name);

                        // Prompt for confirmation before deleting
                        if (!confirm(`Are you sure you want to delete the list "${name}"?`))
                            return;
                        gameList.localStorage.forgetItem(gameList.getStorageName());
                        this.populateListsDiv(listsDiv);
                    });
                    listRow.appendChild(deleteListButton);
                }

                const shareListButton = document.createElement('button');
                shareListButton.classList.add('list-share-button');
                shareListButton.classList.add('list-button');
                shareListButton.attributes['title'] = 'Share List';
                shareListButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const gameList = GameList.fromLocalStorage(name);
                    if (gameList.games.length === 0) {
                        alert(`"${name}" is empty, so there's nothing to share yet.`);
                        return;
                    }

                    let gamesSet = new Set(gameList.games);
                    // Encode gamesSet to a UTF-8 string
                    const gamesSetString = Util.EncodeIntegerSet(gamesSet);

                    const shareLink = `${window.location.origin}${window.location.pathname}?${this.dbId ? 'dbId=' + this.dbId + '&' : ''}uids=${gamesSetString}`;
                    navigator.clipboard.writeText(shareLink).then(() => {
                        alert(`Shared link copied to clipboard: ${shareLink}`);
                    }).catch(err => {
                        console.error('Error copying link: ', err);
                    });
                });
                listRow.appendChild(shareListButton);
            });
        }
    }

    createListSection() {
        const listHeader = document.createElement('div');
        listHeader.className = 'collapsible-header';
        listHeader.textContent = 'Lists and Favorites';

        const listContent = document.createElement('div');
        listContent.className = 'collapsible-content';

        const listsContainer = document.createElement('div');
        listsContainer.className = 'lists-container';
        listsContainer.id = 'lists-container';
        this.populateListsDiv(listsContainer);
        listContent.appendChild(listsContainer);

        const createListFromCurrentBtn = document.createElement('button'); 
        createListFromCurrentBtn.className = 'tag-button';
        createListFromCurrentBtn.textContent = 'Create List From Current Games';

        createListFromCurrentBtn.addEventListener('click', () => {
            const listName = prompt('Enter a name for the new list:');
            if (listName) {
                const gameList = new GameList(listName);
                gameList.games = this.currentGames.map(game => game.uid);
                gameList.saveToLocalStorage();
                this.populateListsDiv();
            }
        });

        listContent.appendChild(createListFromCurrentBtn);

        const listSection = document.createElement('div');
        listSection.id = 'list-section';
        listSection.className = 'list-section';
        listSection.appendChild(listHeader);
        listSection.appendChild(listContent);
        return listSection;
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

        // Add all elements to control pane
        controlPane.appendChild(searchSection);
        controlPane.appendChild(this.createTagFilterSection());
        controlPane.appendChild(this.createListSection());
    }


    populateFooter() {
        // combine this.data.contributors array into one comma-separated string
        let conStr = "";
        const contributors = this.playbook.data.contributors;
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

    updateSearchString(searchString, updateGames=false)
    {
        const searchBox = document.getElementById('search-box');
        searchBox.value = searchString;
        this.searchTerm = searchString;
        if (updateGames)
            this.populateGameList();
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
        this.currentGames = this.playbook.searchGames(this.searchTerm, this.filter);
        const searchDescription = this.describeSearch(this.currentGames.length);
        const searchDescriptionElement = document.getElementById('search-desc');
            searchDescriptionElement.textContent = searchDescription;

        const gamesContainer = document.getElementById('games-container');                
        gamesContainer.innerHTML = '';
    
        let lastLetter = '';
        this.currentGames.forEach(gameDetails => {
            if (gameDetails.name[0].toLowerCase() !== lastLetter) {
                lastLetter = gameDetails.name[0].toLowerCase();
                const divLetter = document.createElement('div');
                divLetter.classList.add('game-letter-rule-line');
                divLetter.textContent = lastLetter.toUpperCase();
                gamesContainer.appendChild(divLetter);
            }

            gamesContainer.appendChild(this.createGameCardDiv(gameDetails));
        });
    }

    updateUrlFromState() {
        const url = new URL(window.location);
        url.searchParams.delete('uid');
        url.searchParams.delete('search');
        url.searchParams.delete('yesTags');
        url.searchParams.delete('noTags');
        url.searchParams.delete('list');
        url.searchParams.delete('edit');

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
            this.populateListsDiv();
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
            shareLink.value = `${window.location.origin}${window.location.pathname}?${this.dbId ? 'dbId=' + this.dbId + '&' : ''}uid=${gameDetails.uid}`;
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

    createGameCardDiv(gameDetails) {

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
}

const g_playbookPage = new PlaybookPage();

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { g_playbookPage };
} else {
    window.playbookPage = g_playbookPage;
}
