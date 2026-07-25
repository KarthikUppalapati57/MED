# Accessibility Statement

**Last updated:** July 24, 2026
**Source of truth:** [code/src/modules/public/pages/AccessibilityStatement.jsx](../../src/modules/public/pages/AccessibilityStatement.jsx) (route `/accessibility`) — update both if either changes.

## 1. Our Commitment

Restops aims to make the platform usable by the widest practical range of people, including people with disabilities. Accessibility is an ongoing effort rather than a one-time project.

## 2. Standards We Target

We use the Web Content Accessibility Guidelines (WCAG) 2.1, Level AA, as our working guideline. We have not yet completed a formal third-party accessibility audit or certification, and do not claim full conformance at this time.

## 3. Measures Taken

The Platform's interface is built on accessibility-focused component primitives (Radix UI) that provide keyboard navigation, focus management, and screen-reader semantics out of the box, and we follow semantic HTML and color-contrast practices in our own design system on top of them.

On July 25, 2026, we ran an automated scan (axe-core via Playwright, WCAG 2.0/2.1 A & AA rules) against the sign-in, sign-up, and all 13 legal/policy pages, and fixed what it found: scrollable content regions were not reachable by keyboard (fixed by making the scroll viewport focusable), and cross-reference links inside body text relied on color alone to be distinguishable, with insufficient contrast against surrounding text (fixed by underlining links by default instead of only on hover). All 16 scanned routes now pass with zero critical or serious violations.

## 4. Known Limitations

The July 25, 2026 scan covered only public/unauthenticated routes (sign-in, sign-up, legal pages) using automated tooling, which catches a meaningful subset of accessibility issues but not all of them — manual keyboard-only and screen-reader testing has not been performed, and the authenticated application (dashboards, forms, data tables across ~20+ modules) has not been scanned at all. A full manual audit and authenticated-route coverage remain on the roadmap; this section will be updated as that work is completed.

## 5. Feedback

If you encounter an accessibility barrier using the Platform, tell us the page and what happened at [SUPPORT CONTACT EMAIL]. We will work to address reported issues.

## 6. Ongoing Efforts

A formal accessibility audit is on our roadmap. This statement will be updated as that work is completed.
