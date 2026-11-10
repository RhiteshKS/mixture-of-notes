# Mixture of Notes

A static blog generator with no dependencies. It turns Markdown files into one HTML page per post, each with its own title, description and link-preview tags. Needs Node 18 or newer.

## Quick start

```
node build.js          # builds the site into dist/
node build.js serve    # builds, then serves http://localhost:8080
```

`serve` rebuilds on every page load, so you can edit a post and refresh.

## Write a post

Add a file to `content/posts/`. The filename becomes the URL, so `my-post.md` is served at `/posts/my-post/`.

```
---
title: Your post title
dek: One sentence that appears under the title and in link previews.
date: 2026-11-20
series: moe-inference-on-8gb
part: 2
tags: [MoE, memory]
status: published
---

Your Markdown here.
```

- `series` and `part` are optional. Leave both out for a standalone post.
- `status: planned` shows the post in its series as "Planned" and creates no page. A planned post needs no date and no body.
- A published post needs a `date` (YYYY-MM-DD) and a body, or the build stops with a clear error.

Supported Markdown: `##` and `###` headings, lists, tables, `**bold**`, `*italic*`, `` `code` ``, links, blockquotes, fenced code, and callouts.

````
```python title=train.py
print("hello")
```

:::note Optional title
Callout text. Use :::tip for the green variant.
:::
````

Python and bash code blocks are syntax highlighted. Other languages render as plain monospace.

## Add a series

Add an object to `series` in `site.config.json`, then point posts at it with `series: your-slug`.

`color` names a CSS variable. The three built in are `--s-ft`, `--s-inf` and `--s-pap`. For a new colour, define a token for light and dark mode in `assets/style.css` (search for `--s-pap`) and use its name.

## Before you publish

1. Replace the sample posts. Delete the files in `content/posts/` and write your own.
2. Edit `site.config.json`: author, about text, links, headline and intro.
3. Set `url` to your final address (for example `https://yourname.dev`). This turns on canonical links, `sitemap.xml` and the RSS feed at `/feed.xml`.
4. Run `node build.js`.

## Deploy

Upload the contents of `dist/`. Any static host works.

- **Netlify:** drag the `dist` folder onto Netlify Drop.
- **Cloudflare Pages:** create a project and use direct upload.
- **GitHub Pages:** see the next section. It builds and deploys automatically.

## Deploy automatically with GitHub Pages

The repo includes `.github/workflows/deploy.yml`. Every push to `main` builds the site and publishes it, so you never run the build by hand or commit `dist/`.

One-time setup:

1. Create a GitHub repo and push this project to the `main` branch.
2. In the repo, open Settings, then Pages, and set Source to **GitHub Actions**.
3. Edit `site.config.json`:
   - Project site at `username.github.io/repo`: set `"basePath": "/repo"` and `"url": "https://username.github.io"`.
   - Repo named `username.github.io`, or a custom domain: leave `basePath` empty and set `url` to the final address.
4. Push. The first deploy takes about a minute. Progress shows in the Actions tab.

After that, writing a post is: add a `.md` file in `content/posts/`, commit, push.

## Notes

- Link previews (WhatsApp, LinkedIn, X) will show the title and description. To also show an image, add an `og:image` tag in the `shell()` function of `build.js` pointing at a PNG or JPG, since these sites do not accept SVG.
- Each post header shows its word count and reading time. Prose is counted at 200 words per minute, code blocks are left out of the word count, and each non-empty line of code adds 3 seconds. Change `WORDS_PER_MINUTE` and `SECONDS_PER_CODE_LINE` at the top of `build.js` to tune it.
- Fonts load from Google Fonts. Everything else is self-contained.
- The loss curve on the home page is illustrative. Edit the numbers in `assets/site.js` or remove the chart section in `build.js`.
