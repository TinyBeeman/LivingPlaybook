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

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { TagFilter, Playbook };
} else {
    window.TagFilter = TagFilter;
    window.Playbook = Playbook;
}
