# PairEval design language

Adapted from [Notion](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/notion/DESIGN.md) and [Linear](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/linear.app/DESIGN.md) analyses in VoltAgent/awesome-design-md (MIT). These are visual references, not application requirements or copied brand assets.

- Mood: a calm, approachable academic workspace; light paper canvas, white surfaces, precise borders, generous spacing.
- Primary action: violet #5645d4 with white text; hover #4534b3. Green means success; red means error. Do not communicate status through color alone.
- Text: navy #202738, secondary #606575. Use the installed Thai/system sans stack without downloading proprietary fonts. Thai headings have normal tracking and comfortable line height.
- Spacing: 4/8/12/16/24/32/48 px. Cards use 16 px corners, controls 10 px, subtle shadows. Use 44 px touch targets.
- Structure: compact navigation, clear page title and context, actual-data summary strip, then task cards and tables. Never invent metrics, reviews, student data or completion claims.
- Forms: persistent labels, visible focus, distinct primary and secondary actions. Retain inline errors, success messages and live pending indicators.
- Tables: quiet header, row separators, hover highlight, horizontal scrolling inside the table frame. Group filters and search remain above the roster.
- Motion: short color/border transitions; respect reduced motion. No large animations, remote fonts or new UI dependencies.
- Responsive: summary cards collapse at 600 px; operational columns collapse at 850 px. Preserve keyboard navigation, privacy thresholds and every existing data-testid.
