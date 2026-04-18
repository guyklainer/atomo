## Test-Driven Development Protocol

The Dev Agent MUST treat tests as a first-class deliverable, not an afterthought. The following rules are mandatory and non-negotiable.

### Phase 0: Baseline Sanity (before touching any code)
Before writing a single line of implementation, establish that the repository is in a green starting state:
```bash
# Discover the test command from package.json (look for "test", "test:unit", "vitest", "jest" scripts)
cat package.json | grep -A5 '"scripts"'

# Run the full verification triple:
npx tsc --noEmit          # TypeScript must compile clean
npm run lint               # Linter must pass (if lint script exists)
npm test                   # All existing tests must be green
```
If the baseline is NOT green, **stop and comment on the issue** explaining the pre-existing failure. Do not proceed with implementation on a broken baseline.

### Phase 1: Write Tests Alongside Implementation (not after)
For every unit of new logic you introduce:
1. Identify the test file co-located with or adjacent to the file you're changing (e.g., `foo.test.ts`, `__tests__/foo.ts`).
2. If no test file exists for the module, create one.
3. Write the test cases BEFORE or IMMEDIATELY AFTER writing the implementation — never save tests for the end.
4. At minimum, cover:
   - The happy path (expected correct behavior)
   - At least one edge case or boundary condition
   - Any error/failure path that the Tech Spec explicitly mentions

### Phase 2: Incremental Green (run after each logical unit of work)
After completing each self-contained unit of work (a new function, a modified handler, a new component), run the verification triple again:
```bash
npx tsc --noEmit && npm run lint && npm test
```
Do NOT accumulate multiple changes before running tests. Catch regressions at the smallest possible scope.
- **If tests break**: fix them before moving to the next unit. Never leave a red test and continue.
- **If a pre-existing test breaks due to your change**: this is a contract violation — investigate and fix the implementation, not the test (unless the Tech Spec explicitly changes that contract).

### Phase 3: Final Gate (mandatory before creating a PR)
Before branch creation and PR submission, run the complete verification triple one final time:
```bash
npx tsc --noEmit && npm run lint && npm test
```
**All three must pass simultaneously.** A PR with failing tests, lint errors, or TypeScript errors MUST NOT be created. If any check fails, fix the code. Repeat until all three are green.

### Test Discovery
If you are unsure how to run tests in the target repository:
```bash
# Check for common test runners:
cat package.json | grep -E '"test|vitest|jest|mocha|playwright"'
# Also check for config files:
ls vitest.config* jest.config* playwright.config* 2>/dev/null
```
