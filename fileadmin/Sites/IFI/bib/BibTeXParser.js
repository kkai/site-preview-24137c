// Source: pandoc:src/Text/Pandoc/Citeproc/BibTeX.hs:1309
const typeReplacements = {
    "article": "article-journal",
    "book": "book",
    "booklet": "pamphlet",
    "bookinbook": "chapter",
    "collection": "book",
    "dataset": "dataset",
    "electronic": "webpage",
    "inbook": "chapter",
    "incollection": "chapter",
    "inreference": "entry-encyclopedia",
    "inproceedings": "paper-conference",
    "manual": "book",
    "mastersthesis": "thesis",
    "misc": "misc",
    "mvbook": "book",
    "mvcollection": "book",
    "mvproceedings": "book",
    "mvreference": "book",
    "online": "webpage",
    "patent": "patent",
    "periodical": "article-journal",
    "phdthesis": "thesis",
    "proceedings": "book",
    "reference": "book",
    "report": "report",
    "software": "book",
    "suppbook": "chapter",
    "suppcollection": "chapter",
    "suppperiodical": "article-journal",
    "techreport": "report",
    "thesis": "thesis",
    "unpublished": "manuscript",
    "www": "webpage",
    "artwork": "graphic",
    "audio": "song",
    "commentary": "book",
    "image": "graphic",
    "jurisdiction": "legal_case",
    "legislation": "legislation",
    "legal": "treaty",
    "letter": "personal_communication",
    "movie": "motion_picture",
    "music": "song",
    "performance": "speech",
    "review": "review",
    "standard": "legislation",
    "video": "motion_picture",
    "data": "dataset",
    "letters": "personal_communication",
    "newsarticle": "article-newspaper",
};

/**
 * Parses specified BibTeX into a JS object.
 * 
 * NOTE: If a date entry exists, it will *NOT* be a Date object, because there is no way to
 * indicate wether the original entry had specified a month. Therefore, entries will either
 * be in `YYYY-MM` or just `YYYY`.
 */
class BibTeXParser {
    #entries = {};
    #pos = 0;
    #data;
    #replaceTypes = false;

    /**
     * 
     * @param {string} bibtex BibTeX string to parse
     * @param {bool} replaceTypes Replace BibTeX types like inproceedings with
     *                            types specified by pandoc.
     */
    constructor(bibtex, replaceTypes = false) {
        this.#data = bibtex;
        this.#replaceTypes = replaceTypes;

        this.#parse();
    }

    /**
     * Get a single entry by its key.
     * @param {string} key 
     * @returns {object}
     */
    get(key) {
        return this.#entries[key];
    }

    /**
     * Returns all entries.
     * @returns {[object]}
     */
    entries() {
        return Object.values(this.#entries);
    }

    /**
     * Main parsing function. Searches for entries and calls
     * relevant functions to extract data.
     */
    #parse() {
        while (true) {
            if (!this.#findStart()) {
                break;
            }

            const rawStart = this.#pos;

            const type = this.#getType();
            if (type === undefined) {
                break;
            } else if (type === "string" || type == "preamble" || type == "comment") {
                continue;
            }
            const id = this.#getId();
            if (id === undefined) {
                break;
            }

            const data = this.#parseEntry();
            const rawEnd = this.#pos;
            data["type"] = type;
            data["key"] = id;
            data["raw"] = this.#data.substring(rawStart, rawEnd + 1);

            const entry = this.#formatEntry(data);

            this.#entries[id] = entry;
        }
    }

    /**
     * Parse a single BibTeX entry.
     * @returns
     */
    #parseEntry() {
        const entry = {};
        while (true) {
            this.#skipWhitespace();
            if (this.#data[this.#pos] === "}") {
                break;
            }

            const key = this.#getKey();
            if (key === undefined) {
                break;
            }
            const value = this.#getValue();
            if (value === undefined) {
                break;
            }

            entry[key] = value;

            // The last Key-Value pair is allowed to end with a , as well
            if (this.#data[this.#pos] === ",") {
                this.#pos++;
            }

            this.#skipWhitespace();
            if (this.#data[this.#pos] === "}") {
                break;
            }
        }

        if (entry["date"] === undefined) {
            if ("year" in entry) {
                entry.date = entry.year;
            } else {
                entry["date"] = "0";
            }
        }

        return entry;
    }

    #formatEntry(entry) {
        if ("author" in entry) {
            const authors = [];
            for (let author of entry.author.split(" and ")) {
                let [firstName, lastName] = author.split(", ").reverse();
                if (lastName === undefined) {
                    // Name is not split by ,
                    let parts = author.split(" ");
                    firstName = parts.slice(0, parts.length - 1).join(" ");
                    lastName = parts.slice(parts.length - 1)[0];
                }
                authors.push({firstName: firstName, lastName: lastName});
            }
            entry.author = authors;
        }

        if ("editor" in entry) {
            const editors = [];
            for (let editor of entry.editor.split(" and ")) {
                let [firstName, lastName] = editor.split(", ").reverse();
                if (lastName === undefined) {
                    // Name is not split by ,
                    let parts = editor.split(" ");
                    firstName = parts.slice(0, parts.length - 1);
                    lastName = parts.slice(parts.length - 1);
                }
                editors.push({firstName: firstName, lastName: lastName});
            }
            entry.editor = editors;
        }

        if ("date" in entry) {
            if (entry.date.includes(" ")) {
                entry.date = entry.date.split(" ")[1];
            }
        }

        return entry;
    }

    /**
     * Searches forward until specified symbol is found.
     * @param {string | RegExp} symbol 
     * @returns {boolean} false if symbol was not found, and the end of the document was reached
     */
    #find(symbol) {
        const regex = new RegExp(symbol);
        while (regex.exec(this.#data[this.#pos]) === null && this.#pos < this.#data.length) {
            this.#pos++;
        }
        return this.#pos != this.#data.length;
    }

    /**
     * Search until @.
     * @returns 
     */
    #findStart() {
        return this.#find(/@/);
    }

    /**
     * Skip until non-whitespace character is found.
     * @returns 
     */
    #skipWhitespace() {
        return this.#find(/[^ \n\r]/);
    }

    /**
     * Searches forward and returns everything until specified match is found.
     * @param {string} match String to stop searching when found
     * @returns {string}
     */
    #getUntilString(match) {
        const start = this.#pos;
        if (!this.#find(match)) {
            return undefined;
        }
        return this.#data.substring(start, this.#pos++).trim();
    }

    /**
     * Extracts the type (@inproceedings, etc.).
     * @returns {string}
     */
    #getType() {
        this.#pos++;
        let type = this.#getUntilString(/{/).toLowerCase();
        if (this.#replaceTypes && type in typeReplacements) {
            type = typeReplacements[type];
        }
        return type;
    }

    /**
     * Extracts the ID.
     * @returns {string}
     */
    #getId() {
        return this.#getUntilString(/,/);
    }

    /**
     * Get the key from a Key-Value pair.
     * @returns {string}
     */
    #getKey() {
        return this.#getUntilString(/=/).toLowerCase();
    }

    /**
     * Get the value from a Key-Value pair.
     * @returns {string}
     */
    #getValue() {
        let start = this.#pos;
        const parts = [];
        let depth = [];
        while (this.#pos < this.#data.length) {
            // Values can include strings in both " " and { }, so
            // we need to track them.
            if (this.#data[this.#pos] === "\"" && depth.length == 0) {
                parts.push(this.#data.substring(start, this.#pos++));
                depth.push("\"");
                start = this.#pos;
            } else if (this.#data[this.#pos] === "{" && !depth.includes("\"")) {
                parts.push(this.#data.substring(start, this.#pos++));
                depth.push("}");
                start = this.#pos;
            } else if (depth.length > 0 && this.#data[this.#pos] === depth[depth.length - 1] && this.#data[this.#pos - 1] !== "\\") {
                parts.push(this.#data.substring(start, this.#pos++));
                depth.pop();
                start = this.#pos;
            // A value ends once a , is found without being in " " or { }
            } else if (this.#data[this.#pos] === "," && depth.length == 0) {
                parts.push(this.#data.substring(start, this.#pos++));
                break;
            } else if (this.#data[this.#pos] === "}") {
                break;
            } else {
                this.#pos++;
            }
        }
        // Do some formatting/cleanup as well
        return parts.length == 0
            ? undefined
            : parts
                .join("")
                .replaceAll(/\\n/g, " ")    // Replace newlines with spaces
                .replaceAll(/\\textbackslash/g, "\\")
                .replaceAll(/--/g, "–")     // Replace double dashes with en dash (U+2013)
                .replaceAll(/\\'e/g, "é")
                .replaceAll(/\\'o/g, "ó")
                .replaceAll(/\\'u/g, "ú")
                .replaceAll(/\\'a/g, "á")
                .replaceAll(/\\'i/g, "í")
                .replaceAll(/\\~n/g, "ñ")
                .replaceAll(/\\/g, "")      // Remove lone backslashes
                .trim();
    }
}
