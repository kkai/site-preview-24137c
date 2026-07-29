/**
 * Display a toast notification with a given string and duration.
 * CSS classes are `toast` and `-show`, `-hide` (for the fadein/out animations),
 * as well as `toast-container`.
 * 
 * Containers will be reused for subsequent toasts.
 */
class Toast {

    /**
     * 
     * @param {string} message
     * @param {number} duration Duration in milliseconds
     */
    constructor(message, duration = 2500) {
        this.message = message;
        this.duration = duration;
    }

    show() {
        // Try to reuse existing containers to allow correct stacking behavior
        if (document.getElementsByClassName("toast-container").length > 0) {
            this.container = document.getElementsByClassName("toast-container")[0];
        } else {
            this.container = document.createElement("div");
            this.container.classList = "toast-container";
            document.body.appendChild(this.container);
        }

        this.element = document.createElement("div");
        this.element.textContent = this.message;
        this.element.classList = "toast toast-show";

        this.container.appendChild(this.element);

        setTimeout(this.#hide.bind(this), this.duration);
    }

    #hide() {
        this.element.classList = "toast toast-hide";
        setTimeout(
            () => this.container.removeChild(this.element),
            500
        );
    }
}