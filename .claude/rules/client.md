---
paths:
  - "client/**"
  - "e2e/accessibility/**"
---

# Layout and accessibility

- The layout has three sizes of the window (compact below 600 px, medium to 1023 px, expanded from 1024 px) and a minimum window size: new styles use the mixins of `client/styles/breakpoints.scss`, nothing that shows only on hover is hidden for a touch screen, and a touch target is 44 px ([docs/development/responsive-layout.md](docs/development/responsive-layout.md)).
- Accessibility: `eslint-plugin-jsx-a11y` runs in `npm run lint` and axe in `e2e/accessibility/accessibility.spec.ts` (`npm run test:a11y` after `npm run build`, its own CI job on Ubuntu), lint and axe as failures; do not add a new violation ([docs/development/accessibility.md](docs/development/accessibility.md)).
