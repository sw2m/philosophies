# Multi-Word Symbols Category (Phase 3)

When reviewing multi-word symbols (camelCase, snake_case per MEMORY.md §IX), output clusters in a fenced YAML block. Each cluster groups symbols that share a single architectural smell, missed abstraction, or naming pattern.

## Required Output Format

You MUST emit clusters inside a `yaml`-tagged fenced code block:

````
```yaml
clusters:
  - id: <short-slug>
    justification: <40+ char sentence describing the single architectural smell, missed abstraction, or naming pattern that ties these symbols>
    symbols:
      - {file: <path>, line: <N>, name: <symbol>}
      - ...
  - ...
```
````

The post-processor extracts only the FIRST `yaml` fenced block. Text outside the fence is ignored. If you omit the fence, parse fails and per-symbol fallback applies (higher cost).

## Anti-Gaming Rules

The following clusters will be **rejected** and each symbol counted individually (per-symbol penalty):

1. **Catch-all by scope.** Justification matches "all multi-word ... in this PR/file/repo/diff/commit".

2. **Vague justification.** Justification is shorter than 40 characters OR is a generic phrase like "verbose names", "bad naming", "inconsistent", "messy", "unclear".

3. **Trivial single-change bypass.** Clusters with >8 symbols require a `single change:` sentinel in the justification with at least 5 whitespace-separated tokens AND at least 30 characters after the sentinel describing a concrete architectural action.

4. **Oversized without sentinel.** Clusters with >8 symbols missing the `single change:` sentinel.

5. **Empty cluster.** Clusters with zero symbols.

## Per-Symbol Penalty Warning

Rejected clusters do NOT vanish from the count. Each symbol in a rejected cluster counts as one blocker. A rejected catch-all of 12 symbols counts as 12 blockers (worst case). An honest 12-symbol cluster with valid `single change:` sentence counts as 1 blocker.

Gaming is strictly worse than honest clustering.

## Exceptions (per §IX)

Do NOT cluster:

- **PascalCase** names (classes, interfaces, type aliases) unless clearly redundant.
- **Serde-leak fields** where the runtime symbol intentionally matches the at-rest representation.
- **External library symbols** from third-party dependencies.

These are excluded at your discretion per MEMORY.md §IX rules.

## Zero Multi-Word Symbols

If the diff contains no multi-word symbols requiring review, emit:

```yaml
clusters: []
```
