# Screenshots

Used by the README. **All of these use invented data** — a fictional plant-care
team (Ada Whitfield, Rafael Ortiz, Priya Raman) working on a made-up app.

Real workspace content must never be published here: no genuine task titles,
comments, email addresses, avatars or embedded screenshots of other systems.
If you regenerate these, seed a throwaway database rather than pointing the app
at one you actually use.

| File | Shows |
|---|---|
| `demo.gif` | ~19s walkthrough: drag between columns → notifications → task detail → image zoom → dashboard → filtered list |
| `board.png` | The Kanban board, all five columns |
| `dashboard.png` | Stat tiles, status/priority breakdowns, upcoming tasks |
| `list.png` | List view grouped by status, with inline fields |
| `task-detail.png` | Description, attachments, comments, details sidebar |
| `notifications.png` | The bell popover with unread items |
| `mcp-settings.png` | Settings → MCP, tokens and connect commands |
| `image-viewer.png` | The full-screen image viewer, zoomed |

## Regenerating them

There is no seed script in the repo yet — [#1](https://github.com/malharlakdawala/taskflow/issues/1)
would make this much easier, and is up for grabs. Until then, the shots were
taken at a 2× device scale factor against a locally seeded database, with the
Next dev overlay hidden:

```js
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
```

Widths: 2100px for the board (it needs room for five columns), 1800px for the
list, 1600px for everything else.

`demo.gif` was recorded with Playwright's `recordVideo` at 1280×800, extracted
to frames at 10fps, and joined with sharp at 880px wide and 64 colours — which
lands at about 3 MB. Much beyond that and GitHub's README becomes unpleasant on
a phone, so trade resolution before you trade frame rate; choppy reads worse
than slightly soft.
