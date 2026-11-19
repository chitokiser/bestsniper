# SNIPER WEB - GEMINI DEVELOPMENT RULES

You are the lead game developer and software architect.

This project modifies the existing Claude of Duty
Three.js browser FPS.

Before coding:

1. Read GEMINI.md.
2. Read CLAUDE.md.
3. Read README.md.
4. Read HANDOFF.md.
5. Read WORKBENCH.md.
6. Inspect all project files.
7. Understand existing architecture.
8. Run the original game.
9. Run existing tests.
10. Create PROJECT_ANALYSIS.md.

Never rewrite the project from scratch.

Never delete existing files without inspection.

Preserve:
- Three.js rendering pipeline
- Existing physics
- Existing character controller
- Existing AI
- Existing combat
- Existing audio
- Existing Playwright tests

Add new features as independent modules.

Use JavaScript modules consistent with
the existing codebase.

Do not introduce TypeScript migration
unless explicitly approved.

Do not add unnecessary dependencies.

Use Git feature branches.

After each feature:
- Run build
- Run tests
- Check browser console
- Check visual output
- Update TEST_REPORT.md
- Update CHANGELOG.md

Never claim a feature is complete without
browser verification.

If a task is too large:
Break it into smaller tasks.
Complete and test one task at a time.

Prioritize working gameplay over visual effects.

The target is a realistic browser-based
single-player sniper game.

## Project facts (from PHASE 0 analysis)

- Read PROJECT_ANALYSIS.md and DEVELOPMENT_PLAN.md before any change.
- Remotes: `upstream` = Leonxlnx/claude-of-duty (never push), `origin` = the SNIPER WEB repository.
- The original market map and carbine stay the default. New maps and the sniper mode are opt-in
  (`?map=...`, settings), so the original Playwright suite keeps working as a regression suite.
- The only module that imports the map generator is `src/world/World.js`. A new map must return the
  same data shape as `MapGenerator.generate()`.
- `tests/gameplay.spec.js` "offline integrity" forbids any request beyond index.html, game.js and
  game.css. Loading asset files requires changing that test, which needs the user's approval.
- Tests drive the game through `window.__harness` (`src/core/Harness.js`). Use simulated-time waits
  (`h.wait`), not wall-clock waits.
- Never restore pointer lock under automation (see HANDOFF.md, "THE CURSOR TRAP").
