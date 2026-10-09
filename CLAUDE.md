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
- Adding an app: create its directory, add a card to the root `index.html`
  (copy an existing block) and a row to the README table.
- Asset URLs use `?v=dev`; the Pages workflow rewrites them to the commit SHA.
- Pure-JS apps keep their engine DOM-free and unit-tested with
  `node tests/engine.test.mjs`.
