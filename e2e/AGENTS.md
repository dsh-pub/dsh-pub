# E2E Engineering Rules

This directory owns deterministic checks across assembled application and template boundaries. Its stable command is:

```bash
npm run e2e
```

## Layout

- `template/`: lifecycle checks owned by this product template, including project initialization and quality-baseline behavior
- `support/`: runner-neutral helpers that are reused by at least two E2E callers
- `apps/web/e2e/`: Playwright journeys and HTTP/API checks after the web stack is selected
- `apps/cli/e2e/`: subprocess tests and optional PTY tests after the CLI is implemented
- `apps/ios/*UITests/`: XCTest plus XCUIAutomation UI journeys owned by the Xcode project
- `apps/android/src/androidTest/`: Espresso, Compose, or UI Automator checks owned by Gradle

Do not put app-specific page objects, native drivers, or framework configuration in the root `e2e/` directory. Keep them close to the app that owns the behavior.

## Test Contract

- Describe behavior through public process, HTTP, filesystem, accessibility, or UI boundaries.
- Keep the root `npm run e2e` command as a thin orchestrator. Add stack-specific runners behind explicit subcommands only when their app slot is active.
- Give product journeys stable IDs such as `onboarding.first-success`. Put browser, operating-system, device, and runtime dimensions in a separate variant ID.
- Do not call paid model APIs here. Real-model quality checks belong under `evals/`; mocked model behavior belongs in unit or deterministic integration tests.
- Use disposable state and guarantee cleanup, including after failures.

## Evidence

Write generated evidence beneath `.cache/test-results/e2e/<runner>/`. Preserve each runner's native artifacts, such as Playwright HTML and traces, CLI transcripts, Xcode `.xcresult`, or Android HTML/XML. JUnit is an optional CI summary, not a replacement for richer native evidence.

Do not add Allure, Cucumber, Maestro, Appium, or another aggregation/automation layer until a real product requirement justifies its maintenance cost.
