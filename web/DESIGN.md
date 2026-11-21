# FoldClaim web demo, design contract

Primary job of the screen: a judge claims a CashToken from a Merkle proof into their own wallet and sees the proof verify against the root on chain.

Direction: a printed ledger plate on cool drafting vellum. Pale green-grey surface, ink text, one blueprint-blue accent whose only job is the proof path. Every reference studied in design-research/REFS.md is dark; this page is deliberately light so the proof drawing reads like an engraved plate rather than another dark explorer. The warm cream first tried was dropped because it is the default tasteful surface.

Fonts, self-hosted from web/public/fonts (latin subset woff2, no runtime third party):
- Newsreader variable 400 to 700 (display and body, optical sizing on). Reason: a serif with real optical sizes gives the headline weight and the body a ledger tone; none of the references use a serif.
- IBM Plex Mono 400 and 500 (hashes, labels, numbers, buttons). Reason: hashes are the content, so the mono carries the data and uppercase micro labels.

Palette (CSS variables in web/src/style.css, nothing inline):
- 70 percent vellum: --paper #e5eae6, --paper-2 #f1f4f1, --rule #b9c3bb
- 20 percent ink: --ink #17181b, --ink-2 #343c37, --muted #4f5951
- 10 percent accent: --blue #1f3fd0 (path highlight, primary button, links)
- semantic only: --ok #2d7a4d (MATCH, confirmed), --warn #a8670f (pending, audit window), --bad #b3261e (MISMATCH, refusals)

Type scale: 12 / 13 / 15 / 17 / 22 / 34 / 56. Display tracking -0.02em, micro labels uppercase 12px tracking +0.08em. Tabular figures for every number.

Spacing 4 / 8 / 16 / 24 / 40 / 64. Radius: 2px on controls and plates (a ruled paper look, not pills), 0 on rules.

Layout: one column of ruled sections. State strip is a two column summary sheet (label right aligned, value left), stolen from the chain explorer idiom. Claim and lookup panels sit left, the proof plate (SVG) sticks right on desktop and leads on mobile. No card grid, no three feature boxes.

Motion: one orchestrated moment, the proof path drawing and hashing upward when Verify is pressed (stroke draw plus hex fill, 320ms per level). Everything honours prefers-reduced-motion.

Refusals: no gradients, no glow, no glass, no pills, no emoji, no icon above heading, no stat tiles with big number plus small label plus supporting stat, no status words as the only signal (every colour pairs with text).

Structure stolen from: chain explorer transaction summary (chipnet.imaginary.cash) for the state sheet, blockchair for micro label over mono value, linear for negative tracking display type, the rival for listing every txid with an explorer link.
