# Third-party notices

`panel/` adapts ideas and material from **PhoneBox** (<https://github.com/ersinkoc/phonebox>),
MIT licence, reproduced below. The code here is a rewrite in React + TypeScript against this repo's
hub; no PhoneBox source file is copied verbatim. Adapted:

- the 12 × 6 grid page model and the widget catalogue shape (`widgets.json`: type, category, name,
  icon, desc, default and minimum size, options)
- the template idea and several template layouts (`templates.json`: Home, Dashboard, System, Music,
  Shortcuts, Feeds)
- the editor's placement rules (`src/editor/grid.ts`: `overlaps`, `freeSpot`) and its layout
  (page list, phone canvas, inspector, searchable palette, Revert/Save, Shortcuts and Webhooks tabs)
- the webhook surface (`push` / `notify` / `goto` and the push payload fields) and the calm page
  switch with a countdown
- the visual style: rounded tiles, ring gauges, tinted keys

---

MIT License

Copyright (c) 2026 Ersin KOÇ

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
