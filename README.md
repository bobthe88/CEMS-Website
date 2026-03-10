# CEMS Website

Static website scaffold for a Cadet Emergency Medical Services club, designed to deploy cleanly on GitHub Pages.

## What is included

- `index.html` for the homepage
- `roster.html` for the membership roster
- `calendar.html` for staffing, training, and weekend events
- `signup.html` for SignupGenius links and future automation notes
- `gallery.html` for club photos
- `leadership.html` for the organization chart
- `documents.html` for SOPs and manuals
- `assets/css/styles.css` for the shared visual system
- `assets/js/data.js` for club data you will update
- `assets/js/site.js` for shared page behavior

## Fast customization guide

1. Replace the sample club data in `assets/js/data.js`.
2. Add your real logo and photos to `assets/images`.
3. Add PDFs to `assets/documents` and connect them in `assets/js/data.js`.
4. Replace the placeholder SignupGenius URL in `assets/js/data.js`.
5. Update any placeholder contact information and location text in the page files.

## Suggested image workflow

- Put your main logo in `assets/images`.
- Put your hero image in `assets/images`.
- Add gallery photos in `assets/images` and point the `gallery` items in `assets/js/data.js` at those files.

Example image path:

`assets/images/team-portrait.jpg`

## Suggested document workflow

- Upload files like `cems-sop.pdf` or `new-member-guide.pdf` into `assets/documents`.
- In `assets/js/data.js`, set the matching document `href` to the file path.

Example document path:

`assets/documents/cems-sop.pdf`

## GitHub Pages deployment

1. Push this repository to GitHub.
2. In GitHub, open the repository settings.
3. Open `Pages`.
4. Under `Build and deployment`, choose `Deploy from a branch`.
5. Select the `main` branch and the `/ (root)` folder.
6. Save the settings.

GitHub Pages will publish the site and give you a public URL.

## Important note about SignupGenius sync

GitHub Pages is a static host, so a direct live sync from SignupGenius usually needs a helper step such as:

- Google Sheets plus Apps Script
- a GitHub Action that converts exported data into JSON
- a small serverless function

The current site is ready for that later, but it does not require any backend to look polished right now.
