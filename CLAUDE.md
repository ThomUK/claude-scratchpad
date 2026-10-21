# claude-scratchpad

A collection of small, self-contained toy web apps, each in its own directory,
deployed to GitHub Pages from `main`.

## Working rules

- **Always merge finished work to `main` and push it.** This is a toy-models
  project: there is no review gate, and Pages only deploys from `main`. Do the
  work on the session branch if one is assigned, then fast-forward or merge it
  into `main` and push `main`. Do not leave work sitting on a side branch or
  open a pull request unless asked.
- **Commit and merge as Claude, never as the repo owner.** Author and
  committer must be `Claude <noreply@anthropic.com>` (the session's default
  git identity); prefer fast-forward merges so no merge commit is created
  under another name. The owner wants unreviewed work clearly attributed.
- **`global-explorer/` is a published copy: never edit it here.** The app is
  developed in a private repository, and an automated publish replaces this
  folder wholesale on every release, so any change made here is lost. If asked
  to change Global Explorer from this repo, say so instead of editing. Its card
  in `index.html`, its README row and the `world-borders/` redirect live here
  and may still be edited.
- **`synthetic-hospital-datastructure/` is only a redirect.** The project
  moved to `ThomUK/synthetic-hospital-data`; work on it there.
- Adding an app: create its directory, add a card to the root `index.html`
  (copy an existing block) and a row to the README table.
- Asset URLs use `?v=dev`; the Pages workflow rewrites them to the commit SHA.
- Pure-JS apps keep their engine DOM-free and unit-tested with
  `node tests/engine.test.mjs`.
