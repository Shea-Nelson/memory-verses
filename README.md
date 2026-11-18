# Memory Verses

Every Bible memory verse shown on the clock, in the Legacy Standard Bible (LSB), with memory games: flash cards, fill in the blank, first letters, word order, reference match, and fade away.

Live: https://shea-nelson.github.io/memory-verses/

## Adding a verse

The list lives in `data/verses.json` (newest first). Each entry:

```json
{ "id": "isaiah-41-10", "reference": "Isaiah 41:10", "text": "…full LSB text…", "translation": "LSB", "source": "https://bible.lockman.org/lsb/isaiah/41/10", "added": "2026-11-18" }
```

The clock routine appends new verses with `add_verse.py` (kept on the box beside the local clone). The page reads the file on load, so a push to `main` is all it takes. Progress is saved only in the browser's localStorage.

Scripture quotations taken from the (LSB®) Legacy Standard Bible®, Copyright © 2021 by The Lockman Foundation. Used by permission. All rights reserved. Managed in partnership with Three Sixteen Publishing Inc. [LSBible.org](https://lsbible.org/) and 316publishing.com.
