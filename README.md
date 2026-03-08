# TC-App Custom (Static)

Static HTML/CSS/JS transaction board for GitHub Pages.

## Files for hosting

- `index.html`
- `styles.css`
- `app.js`
- `.nojekyll`

## Data source

The board calls your Google Apps Script endpoint directly from the browser.

Default endpoint is set in `app.js` and can be changed from **Settings** on the page.

## GitHub Pages setup

1. In GitHub repo settings, open **Pages**.
2. Set source to your deploy branch root (for example `main` `/`).
3. Save and wait for publish.
4. Open the Pages URL.

If you still see markdown content, clear browser cache and confirm `index.html` exists in the published branch root.
