# CLAUDE.md

Guidance for Claude Code when working with this repository.

## §1 Project Identity

```yaml
name: 業者見積データベース (Vendor Quote Database)
type: Static SPA (no build step)
purpose: Search and analyze construction vendor quotes
```

## §2 Tech Stack

```yaml
css: Bootstrap 5.3.3 (CDN)
charts: Chart.js 4.4.1 (CDN)
language: JavaScript (ES6+)
```

## §3 Bootstrap 5 Rules

```yaml
ALWAYS:
  - Use utility classes before custom CSS
  - Combine utilities on elements (e.g., "d-flex align-items-center gap-3")
  - Use responsive variants (e.g., "d-lg-flex", "mb-md-4")

NEVER:
  - Write custom CSS for spacing (use m-*, p-*, gap-*)
  - Write custom CSS for flexbox (use d-flex, align-items-*, justify-content-*)
  - Use inline styles for Bootstrap-supported properties

reference: https://getbootstrap.com/docs/5.3/utilities/api/
```
