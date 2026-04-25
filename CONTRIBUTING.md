# Contributing to Atomo

Thank you for your interest in contributing to Atomo! This guide will help you get started.

## 🧪 Testing Requirement

All new code must include tests. Atomo enforces TDD per `protocols/tdd.md`.

### Writing Tests

1. **Co-locate tests**: Create `[filename].test.ts` next to the file you're testing (or in the `tests/` directory)
2. **Use Vitest**: Import `describe`, `it`, `expect` from `vitest`
3. **Coverage target**: Maintain 80%+ coverage (enforced by CI)
4. **Test categories**:
   - **Unit tests**: Test individual functions in isolation
   - **Integration tests**: Test end-to-end workflows with realistic data
   - **Edge cases**: Null values, empty inputs, malformed data

### Running Tests

```bash
npm test                  # Run all tests
npm run test:watch        # Auto-rerun on file changes
npm run test:coverage     # Check coverage percentage
```

### Before Submitting PR

Ensure all checks pass:

```bash
npx tsc --noEmit && npm test
```

See the Reviewer agent test suite (`tests/reviewer.test.ts`) as an example of comprehensive test coverage.

## 📝 Development Workflow

1. **Fork the repository** and create a feature branch from `main`
2. **Make your changes** following the existing code style
3. **Write tests** for your changes (mandatory, not optional!)
4. **Run the verification triple**:
   ```bash
   npx tsc --noEmit  # TypeScript must compile
   npm test          # Tests must pass
   npm run test:coverage  # Coverage must meet thresholds
   ```
5. **Commit your changes** with a clear, descriptive commit message
6. **Push to your fork** and submit a Pull Request

## 🎯 What to Contribute

We welcome contributions in the following areas:

- **New Agents**: Extend Atomo with new specialized agents (e.g., Security Audit Agent, Documentation Agent)
- **Test Coverage**: Add tests for existing agents (Triage, Planner, Dev, PM)
- **Bug Fixes**: Fix reported issues or bugs you discover
- **Documentation**: Improve README, protocol docs, or inline code comments
- **Heuristic Improvements**: Refine categorization matrices and decision logic

## 🚫 What NOT to Contribute

- Changes without tests (will be rejected immediately)
- Breaking changes to core protocols without prior discussion
- Undocumented magic or clever hacks
- Code that violates the Progressive Disclosure Architecture (see `CLAUDE.md`)

## 💬 Communication

- **Issues**: Open an issue for bugs, feature requests, or questions
- **Pull Requests**: Reference related issues in your PR description
- **Discussions**: Use GitHub Discussions for broader architectural questions

## 📚 Additional Resources

- [TDD Protocol](./protocols/tdd.md) - Mandatory testing discipline
- [CLAUDE.md](./CLAUDE.md) - Project architecture rules
- [Protocols](./protocols/) - Detailed agent behavior specifications

---

**Remember**: Atomo is designed to be a lean, disciplined, and well-tested system. Every contribution should uphold these principles.
