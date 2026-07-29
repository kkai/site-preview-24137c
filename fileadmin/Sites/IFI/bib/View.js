/**
 * Generates view elements based on publications.
 */
 class PublicationView {

    // Match search directions to font awesome icons.
    sortButtonsIconMapping = {
        "sort_year": {
            "-1": "fa fa-sort-numeric-down",
            "1": "fa fa-sort-numeric-up",
        },
        "sort_title": {
            "-1": "fa fa-sort-alpha-up",
            "0": "fa fa-filter",
            "1": "fa fa-sort-alpha-down",
        },
        "sort_author": {
            "-1": "fa fa-sort-alpha-up",
            "0": "fa fa-filter",
            "1": "fa fa-sort-alpha-down",
        }
    };

    // The current search string
    searchString = "";

    // The first year group created, which will be stickied if enabled
    stickyYearGroupElement;

    // Row of filter checkboxes, also stickied if enabled
    filterContainer;

    /**
     * 
     * @param {Element} rootElement ID of the root element for this view.
     * @param {boolean} showNumbering Wether to show numbering for entries
     * @param {string} bibtexUrl 
     * @param {number} yearSortingDirection 
     * @param {number} titleSortingDirection 
     * @param {number} authorSortingDirection
     * @param {boolean} stickyYearGroup Wether the first year group (which contains the search/sorting elements) should be sticky when scrolling below it
     * @param {string} retain Only keep entries matching specified string
     */
    constructor(
        rootElement = document.body,
        showNumbering = true,
        bibtexUrl = "",
        yearSortingDirection = -1,
        titleSortingDirection = 1,
        authorSortingDirection = 0,
        stickyYearGroup = true,
        retain = "",
        showFilters = true
    ) {
        this.config = {
            showNumbering: showNumbering,
            bibtexUrl: bibtexUrl
        };

        this.filters = {
            "thesis": false,
            "paper-conference": false,
            "chapter": false,
            "book": false,
            "article-journal": false,
        };

        this.yearSortingDirection = yearSortingDirection;
        this.titleSortingDirection = titleSortingDirection;
        this.authorSortingDirection = authorSortingDirection;
        this.stickyYearGroup = stickyYearGroup;

        this.retain = retain;

        this.root = rootElement;

        this.showLoading();
        this.fetch(() => {
            this.draw();
            this.hideLoading();

            if (this.stickyYearGroup) {
                this.updateStickyYeargroup();
                window.addEventListener("scroll", () => this.updateStickyYeargroup());
            }

            if (showFilters) {
                this.generateFilterCheckboxes();
            }

            if (this.stickyYearGroup) {
                this.updateStickyTop();
                window.addEventListener("resize", () => this.updateStickyTop());
            }
        });
    }

    /**
     * Show a loading spinner to indiciate the user that publications are being loaded.
     */
    showLoading() {
        this.spinner = document.createElement("i");
        this.spinner.id = "publications-spinner";
        this.spinner.classList = "fa fa-spinner fa-spin";
        this.root.appendChild(this.spinner);
    }

    /**
     * Hide the loading spinner.
     */
    hideLoading() {
        if (this.spinner) {
            this.root.removeChild(this.spinner);
            this.spinner = undefined;
        }
    }

    /**
     * Check and remove entries that do not match the retain filter.
     */
    checkEntries() {
        this.entries = this.entries.filter(entry => this.matchesSearch(entry, this.retain));
    }

    /**
     * Download relevant data files, initiates the parser and calls
     * further functions to generate the view elements.
     * 
     * @param {Function} done Callback once entries are loaded and parsed
     */
    fetch(done) {
        fetch(this.config.bibtexUrl)
            .then(res => res.text())
            .then(data => {
                this.parser = new BibTeXParser(data, true);
                this.entries = Object.values(this.parser.entries());
                this.checkEntries();
                this.generateNumbering();
            })
            .then(done);
    }

    /**
     * Function to (re)draw the whole table, including
     * all the yeargroups.
     * 
     * Ensures correct sorting before redrawing.
     */
    draw() {
        const previousScrollY = window.scrollY;

        this.sortEntries();

        this.generateTable();
        this.populateTable();
        this.filter();
        this.generateYearGroups();

        // We use requestAnimationFrame to ensure the table has been drawn
        window.requestAnimationFrame(() => window.scrollTo({
            top: previousScrollY,
            behavior: "instant"
        }));
    }

    /**
     * Applies the current search string to all entries.
     * 
     * This will set the `hidden` class on all entries that do not
     * match the search string.
     */
    filter() {
        let i = 1;
        for (const ele of document.getElementsByClassName("entry")) {
            const entry = this.parser.get(ele.getAttribute("id"));
            if (this.matchesSearch(entry, this.searchString) && this.matchesFilters(entry)) {
                ele.classList.remove("hidden");

                if (i % 2 == 0) {
                    ele.classList.add("entry-alternate-background");
                } else {
                    ele.classList.remove("entry-alternate-background");
                }
                i++;
            } else {
                ele.classList.add("hidden");
            }
        }
    }

    /**
     * Generates persistent numbering based on default search directions.
     */
    generateNumbering() {
        this.sortEntries();
        let i = this.entries.length;
        for (const entry of this.entries) {
            entry.number = i--;
        }
    }

    /**
     * Generate a new table element, if none exists.
     */
    generateTable() {
        if (!this.publicationContainer) {
            this.publicationContainer = document.createElement("div");
            this.publicationContainer.className = "publications";
            this.root.appendChild(this.publicationContainer);
        }
    }

    /**
     * Generates the table and publication elements.
     */
    populateTable() {
        // Writing everything into a string and then into DOM
        // is a lot more performant.
        let entryHTML = "";
        for (const entry of this.entries) {
            entryHTML += this.generateEntry(entry);
        }
        this.publicationContainer.innerHTML = entryHTML;

        this.generateClickableEvents();
    }

    /**
     * Sorts entries as specified by provided directions.
     * 1 = ascending, 0 = ignore, -1 = descending
     * 
     * Directions are provided to the constructor when creating a new instance.
     */
    sortEntries() {
        this.entries.sort((a, b) => {
            let yearResult, titleResult, authorResult;

            if (this.yearSortingDirection != 0) {
                const a_date = this.getValidDate(a.date);
                const b_date = this.getValidDate(b.date);

                if (a_date.toString() === "Invalid Date" && !(b_date.toString() === "Invalid Date")) {
                    yearResult = 1;
                } else if (!(a_date.toString() === "Invalid Date") && b_date.toString() === "Invalid Date") {
                    yearResult = -1;
                } else {
                    const a_year = a_date.getFullYear();
                    const b_year = b_date.getFullYear();
                    yearResult = a_year > b_year ? 1 : a_year == b_year ? 0 : -1;
                }
            }

            if (this.titleSortingDirection != 0) {
                titleResult = a.title.localeCompare(b.title);
            }

            if (this.authorSortingDirection != 0) {
                if (a.author && b.author) {
                    authorResult = a.author[0].firstName.localeCompare(b.author[0].firstName);
                } else if (a.author) {
                    authorResult = 1;
                } else {
                    authorResult = -1;
                }
            }

            return this.yearSortingDirection * yearResult
                || this.titleSortingDirection * titleResult
                || this.authorSortingDirection * authorResult;
        });
    }

    /**
     * Returns if given entry matches the exact string (no boolean expressions inside).
     * 
     * @param {object} entry 
     * @param {string} searchString 
     * @returns {boolean}
     */
    exactMatch(entry, searchString) {
        let searchStringLower = searchString.trim().toLowerCase();
        const negate = searchStringLower.startsWith("!");
        if (negate) {
            searchStringLower = searchStringLower.slice(1);
        }
        const searchResult = entry.title.toLowerCase().match(searchStringLower)
            || entry.author && entry.author.some(
                author => (
                    author.firstName && (author.firstName.toLowerCase().match(searchStringLower) || `${author.firstName.toLowerCase()} ${author.lastName.toLowerCase()}`.match(searchStringLower))
                )
                || author.lastName.toLowerCase().match(searchStringLower)
            )
            || entry.publisher && entry.publisher.toLowerCase().match(searchStringLower)
            || entry.keywords && entry.keywords.toLowerCase().match(searchStringLower);

        return (Array.isArray(searchResult) || searchResult) ^ negate;
    }

    /**
     * Returns if given entry matches the current search string.
     * 
     * Matches against title, authors and publisher
     * @param {object} entry 
     * @param {string} searchString
     * @returns {boolean}
     */
    matchesSearch(entry, searchString) {
        if (searchString.length < 3) {
            return true;
        }

        if (searchString.indexOf("&&") >= 0) {
            const parts = searchString.split("&&");
            return parts.every((element) => this.exactMatch(entry, element))
        } else {
            return this.exactMatch(entry, searchString);
        }
        
    }

    matchesFilters(entry) {
        // Only filter if something has been checked
        if (!Object.values(this.filters).some(f => f)) {
            return true;
        }

        return entry.type in this.filters ? this.filters[entry.type] : false;
    }

    /**
     * 
     * @param {object} entry Entry to parse
     * @param {number | string} index Index to show when showNumbering is true
     * @returns {string} HTML for provided entry object
     */
    generateEntry(entry, index) {
        return `
            <div id="${entry.key}" class="entry">
                <div class="entry-numbering">${this.config.showNumbering ? entry.number : ""}</div>
                <div class="entry-data">
                    <span class="entry-title-container">
                        ${entry.url ? `<a href="${entry.url}">` : ``}
                            <span class="entry-title">${entry.title}</span>
                        ${entry.url ? `</a>` : ``}
                    </span>
                    ${entry.author ? `<span class="entry-author">${this.formatAuthor(entry.author)}</span>` : ``}
                    ${entry.booktitle ? `<span class="entry-description">${entry.booktitle}</span>` : ``}
                    ${entry.journaltitle ? `<span class="entry-description">${entry.journaltitle}</span>` : ``}
                    <span class="entry-tags">
                        ${entry.date && this.dateHasMonth(entry.date) ? `<span class="entry-date">${this.formatDate(entry.date)}</span>` : ``}
                        ${entry.type == "thesis" ? `<span class="entry-thesis">PhD thesis, Institut für Informatik, Technische Universität Clausthal</span>` : ``}
                        ${entry.volume ? `<span class="entry-volume">vol ${entry.volume}</span>` : entry.type == "article-journal" ? `<span class="entry-volume">vol 0</span>` : ``}
                        ${entry.pages ? `<span class="entry-pages">page ${entry.pages}</span>` : ``}
                        ${entry.publisher ? `<span class="entry-publisher">${entry.publisher}</span>` : ``}
                        ${entry.editor ? `<span class="entry-editor">${this.formatAuthor(entry.editor)}, eds</span>` : ``}
                    </span>
                    <span class="entry-clickables">
                        <span class="entry-clickable" data-content="${entry.raw}">BibTeX</span>
                        ${entry.isbn ? `<span class="entry-clickable" data-content="${entry.isbn}">ISBN</span>` : ``}
                        ${entry.doi ? `<span class="entry-clickable" data-content="${entry.doi}">DOI</span>` : ``}
                    </span>
                </div>
            </div>
        `;
    }

    /**
     * Generates events for clickable elements like BibTeX, ISBN.
     */
    generateClickableEvents() {
        for (const ele of document.getElementsByClassName("entry-clickable")) {
            ele.addEventListener("click", event => {
                navigator.clipboard.writeText(ele.getAttribute("data-content")).then(
                    () => new Toast(`${ele.textContent} copied`).show(),
                    () => new Toast(`Failed to copy ${ele.textContent}`).show()
                );
            });
        }
    }

    /**
     * Separates entries by years and generates a header for every
     * year.
     */
    generateYearGroups() {
        // Remove old elements
        for (const ele of document.querySelectorAll(".yeargroup")) {
            ele.remove();
        }

        if (this.stickyYearGroup) {
            if (this.stickyYearGroupElement) {
                this.stickyYearGroupElement.remove();
            }

            this.stickyYearGroupElement = document.createElement("div");
            this.stickyYearGroupElement.className = "yeargroup-sticky";

            const firstEle = this.getFirstVisibleElement();

            if (firstEle) {
                const entry = this.parser.get(firstEle.getAttribute("id"));
                const year = this.getDateYear(entry.date);

                this.stickyYearGroupElement.textContent = year;
            } else {
                this.stickyYearGroupElement.textContent = "0000";
            }

            this.stickyYearGroupElement.innerHTML += this.generateSearchInput();
            this.stickyYearGroupElement.innerHTML += this.generateSortButtons();

            this.publicationContainer.prepend(this.stickyYearGroupElement);
        }

        let lastYear = 0;
        for (const ele of document.getElementsByClassName("entry")) {
            if (ele.classList.contains("hidden")) {
                continue;
            }
            const entry = this.parser.get(ele.getAttribute("id"));
            const year = this.getDateYear(entry.date);

            if (year != lastYear) {
                const yearGroupEle = document.createElement("div");
                yearGroupEle.className = "yeargroup";
                if (year == "0") {
                    yearGroupEle.textContent = "Unknown";
                } else {
                    yearGroupEle.textContent = year;
                }
                yearGroupEle.setAttribute("data-year", year);

                // First yeargroup
                if (lastYear == 0 && !this.stickyYearGroup) {
                    yearGroupEle.innerHTML += this.generateSearchInput();
                    yearGroupEle.innerHTML += this.generateSortButtons();
                } else if (lastYear == 0) {
                    yearGroupEle.classList.add("hidden");
                }

                this.publicationContainer.insertBefore(yearGroupEle, ele);

                lastYear = year;
            }
        }

        // Check if no group was generated because everything was hidden
        if (lastYear == 0 && !this.stickyYearGroupElement) {
            const currentYear = new Date().getFullYear();
            const yearGroupEle = document.createElement("div");
            yearGroupEle.className = "yeargroup";
            yearGroupEle.textContent = currentYear;
            yearGroupEle.setAttribute("data-year", currentYear);

            yearGroupEle.innerHTML += this.generateSearchInput();
            yearGroupEle.innerHTML += this.generateSortButtons();

            this.publicationContainer.appendChild(yearGroupEle);
        }

        this.generateSearchInputEvents();
        this.generateSortButtonsEvents();

        if (this.stickyYearGroup) {
            this.updateStickyYeargroup();
            this.updateStickyTop();
        }

        const searchElement = document.getElementById("publications-search");
        searchElement.selectionStart = typeof this.searchIndex !== "undefined" ? this.searchIndex : this.searchString.length;
        searchElement.focus();
    }

    /**
     * Calculate and return the first visible entry element.
     * @returns {HTMLElement | undefined}
     */
    getFirstVisibleElement() {
        for (const ele of document.getElementsByClassName("entry")) {
            if (!ele.classList.contains("hidden")) {
                return ele;
            }
        }
    }

    /**
     * Returns HTML for the search button embedded inside the first year group.
     * @returns {string}
     */
    generateSearchInput() {
        return `
            <form class="form-search" role="search" autocomplete="off">
                <input id="publications-search" type="search" value="${this.searchString}" placeholder="Search" class="form-control" aria-label="Search through publications">
            </form>
        `;
    }

    /**
     * Generates the input event for the search input to trigger filtering.
     */
    generateSearchInputEvents() {
        let searchElement = document.getElementById("publications-search");
        searchElement.addEventListener("input", event => {
            this.searchString = event.target.value;
            this.searchIndex = event.target.selectionStart;

            this.filter();
            this.generateYearGroups();
        });
    }

    /**
     * Returns HTML used to render sort buttons within the first 
     * year group element.
     * @returns {string}
     */
    generateSortButtons() {
        return `
            <span class="sort-buttons-container">
                <span class="btn-sort" id="btn-sort-year" data-direction="${this.yearSortingDirection}">
                    <span class="${this.sortButtonsIconMapping["sort_year"][this.yearSortingDirection]}" aria-hidden="true"></span> Year
                </span>
                <span class="sort-separator"></span>
                <span class="btn-sort" id="btn-sort-title" data-direction="${this.titleSortingDirection}">
                    <span class="${this.sortButtonsIconMapping["sort_title"][this.titleSortingDirection]}" aria-hidden="true"></span> Title
                </span>
                <span class="btn-sort" id="btn-sort-author" data-direction="${this.authorSortingDirection}">
                    <span class="${this.sortButtonsIconMapping["sort_author"][this.authorSortingDirection]}" aria-hidden="true"></span> Author
                </span>
            </span>
        `;
    }

    /**
     * Generates events for previously created sort buttons.
     */
    generateSortButtonsEvents() {
        document.getElementById("btn-sort-year").addEventListener("click", event => {
            this.yearSortingDirection = this.yearSortingDirection ^ -1 | 1;
            this.draw();
        });
        document.getElementById("btn-sort-title").addEventListener("click", event => {
            if (this.titleSortingDirection != 0) {
                this.titleSortingDirection = this.titleSortingDirection ^ -1 | 1;
            } else {
                this.authorSortingDirection = 0;
                this.titleSortingDirection = 1;
            }
            this.draw();
        });
        document.getElementById("btn-sort-author").addEventListener("click", event => {
            if (this.authorSortingDirection != 0) {
                this.authorSortingDirection = this.authorSortingDirection ^ -1 | 1;
            } else {
                this.titleSortingDirection = 0;
                this.authorSortingDirection = 1;
            }
            this.draw();
        });
    }

    /**
     * Generates and appends filter elements to the root element.
     */
    generateFilterCheckboxes() {
        const html = `
            <div class="checkbox-container">
                <input id="thesis" type="checkbox">
                <label for="thesis">Thesis</label>
                <label for="thesis" class="checkbox"></label>
            </div>
            <div class="checkbox-container">
                <input id="paper-conference" type="checkbox">
                <label for="paper-conference">Conference paper</label>
                <label for="paper-conference" class="checkbox"></label>
            </div>
            <div class="checkbox-container">
                <input id="chapter" type="checkbox">
                <label for="chapter">Book chapter</label>
                <label for="chapter" class="checkbox"></label>
            </div>
            <div class="checkbox-container">
                <input id="book" type="checkbox">
                <label for="book">Book</label>
                <label for="book" class="checkbox"></label>
            </div>
            <div class="checkbox-container">
                <input id="article-journal" type="checkbox">
                <label for="article-journal">Journal article</label>
                <label for="article-journal" class="checkbox"></label>
            </div>
        `;
        this.filterContainer = document.createElement("div");
        if (this.stickyYearGroup) {
            this.filterContainer.className = "filter-container-sticky";
        } else {
            this.filterContainer.className = "filter-container";
        }
        this.filterContainer.innerHTML = html;

        this.root.appendChild(this.filterContainer);

        this.generateFilterCheckboxesEvents();
    }

    generateFilterCheckboxesEvents() {
        for (const ele of document.querySelectorAll(".checkbox-container input[type=checkbox]")) {
            ele.addEventListener("change", () => {
                this.filters[ele.id] = !this.filters[ele.id];

                this.filter();
                this.generateYearGroups();
            });
        }
    }

    getValidDate(date) {
        const dateObj = new Date(date);
        if (dateObj.toString() !== "Invalid Date") {
            return dateObj;
        }

        if (date.includes("-")) {
            let [year, month] = date.split("-");
            if (parseInt(month) > 12) {
                return new Date(year);
            }
        }

        return new Date(0);
    }

    /**
     * Parse and format a date string.
     * @param {string} date 
     * @returns {string}
     */
    formatDate(date) {
        const dateObj = this.getValidDate(date);
        if (dateObj.toString() === "Invalid Date") {
            return "";
        }

        // Format functions to convert Date objects to strings
        const dateFormat = new Intl.DateTimeFormat("en-US", {
            month: "long"
        }).format;

        return dateFormat(dateObj);
    }

    /**
     * Checks whether a date string contains a month (by splitting year and month with a -)
     * @param {string} date Date string to check
     * @returns {boolean}
     */
    dateHasMonth(date) {
        return date.includes("-");
    }

    /**
     * Extract year from date string.
     * @param {string} date 
     * @returns {number} 
     */
    getDateYear(date) {
        return Number(date.split("-")[0]);
    }

    /**
     * Parse an author string, split names by ` and ` and output as a
     * comma-separated list with `firstName lastName`.
     * @param {[object]} author 
     * @returns {string}
     */
    formatAuthor(author) {
        return author.map(a => `${a.firstName} ${a.lastName}`).join(", ");
    }

    /**
     * Calculates which year group the user is currently "in" with his
     * scroll position.
     * @returns 
     */
    calculateCurrentYearGroup() {
        /* 
            getBoundingClientRect returns coordinates relative to the current viewport,
            so if we scroll past a yeargroup element, its coordinates will be negative.
            Thus, the element with its top closest to 0, but negative, will be the one
            we are currently inside of.
            The only exception for this is if the viewport is above the publication container,
            in which case the first year group is returned.
        */
        let last = document.getElementsByClassName("yeargroup")[0];
        let lastTop = Number.MIN_SAFE_INTEGER;

        for (const ele of document.getElementsByClassName("yeargroup")) {
            if (ele.classList.contains("hidden")) {
                continue;
            }
            const eleTop = ele.getBoundingClientRect().top;
            if (eleTop < this.stickyYearGroupOffset && eleTop > lastTop) {
                last = ele;
                lastTop = eleTop;
            } else if (eleTop > this.stickyYearGroupOffset) {
                break;
            }
        }

        return last;
    }

    /**
     * Event handler for the scroll event to ensure the sticky yeargroup has the current name set.
     */
    updateStickyYeargroup() {
        const currentYearGroup = this.calculateCurrentYearGroup();
        if (currentYearGroup) {
            this.stickyYearGroupElement.childNodes[0].textContent = currentYearGroup.getAttribute("data-year");
        }
    }

    /**
     * Event handler to update sticky top distance based on current view
     */
    updateStickyTop() {
        let navbar = document.getElementById("nav-primary");
        if (!navbar) {
            let mainNavigation = document.getElementById("mainnavigation");

            if (!mainNavigation) {
                return;
            }

            navbar = mainNavigation.lastElementChild;

            if (!navbar) {
                return;
            }
        }
        let navbarHeight = navbar.getBoundingClientRect().bottom;

        const navbarHeightPx = navbarHeight + "px";
        this.stickyYearGroupOffset = parseFloat(navbarHeight);
        this.stickyYearGroupElement.style.top = navbarHeightPx;

        if (this.filterContainer) {
            this.filterContainer.style.top = navbarHeightPx;
        }
    }
}

const configElement = document.getElementById("pub-config");
const view = new PublicationView(
    document.getElementById("publications-container"),
    configElement.getAttribute("data-show-numbering") === "true",
    configElement.getAttribute("data-bib-url"),
    -1,
    1,
    0,
    configElement.getAttribute("data-sticky-yeargroup") === "true",
    configElement.getAttribute("data-retain") || "",
    configElement.getAttribute("data-show-filters") === "true" || configElement.getAttribute("data-show-filters") === null
);
