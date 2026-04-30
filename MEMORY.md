# **Verified Spec-Driven Development (VSDD)**

## **The Fusion: VDD × TDD × SDD for AI-Native Engineering**

### **Overview**

**Verified Spec-Driven Development (VSDD)** is a unified software engineering methodology that fuses three proven paradigms into a single AI-orchestrated pipeline:

- **Spec-Driven Development (SDD):** Define the contract before writing a single line of implementation. Specs are the source of truth.
- **Test-Driven Development (TDD):** Tests are written *before* code. Red → Green → Refactor. No code exists without a failing test that demanded it.
- **Verification-Driven Development (VDD):** Subject all surviving code to adversarial refinement until a hyper-critical reviewer is forced to hallucinate flaws.

VSDD treats these not as competing philosophies but as **sequential gates** in a single pipeline. Specs define *what*. Tests enforce *how*. Adversarial verification ensures *nothing was missed*. AI models orchestrate every phase, with the human developer serving as the strategic decision-maker and final authority.

---

### **I. The VSDD Toolchain**

| Role | Entity | Function |
| --- | --- | --- |
| **The Architect** | Human Developer | Strategic vision, domain expertise, acceptance authority. Signs off on specs, arbitrates disputes between Builder and Adversary. |
| **The Builder** | Claude (or similar) | Spec authorship, test generation, code implementation, and refactoring. Operates under strict TDD constraints. |
| **The Tracker** | **Chainlink** | Hierarchical issue decomposition — Epics → Issues → Sub-issues ("beads"). Every spec, test, and implementation maps to a bead. |
| **The Adversary** | **Sarcasmotron** (Gemini Gem or equivalent) | Hyper-critical reviewer with zero patience. Reviews specs, tests, *and* implementation. Fresh context on every pass. |

---

### **II. The VSDD Pipeline**

#### **Phase 1 — Spec Crystallization**

*Nothing gets built until the contract is airtight — and the architecture is verification-ready by design.*

The human developer describes the feature intent to the Builder. The Builder then produces a **formal specification document** for each unit of work. Critically, this phase doesn't just define *what* the software does — it defines *what must be provable about it* and structures the architecture accordingly.

**Step 1a: Behavioral Specification**

The Builder produces the functional contract:

- **Behavioral Contract:** What the module/function/endpoint *must* do, expressed as preconditions, postconditions, and invariants.
- **Interface Definition:** Input types, output types, error types. No ambiguity. If it's an API, this is the OpenAPI/GraphQL schema. If it's a module, this is the type signature and doc contract.
- **Edge Case Catalog:** Explicitly enumerated boundary conditions, degenerate inputs, and failure modes. The Builder is prompted to be *exhaustive* here — "What happens when the input is null? Empty? Maximum size? Negative? Unicode? Concurrent?"
- **Non-Functional Requirements:** Performance bounds, memory constraints, security considerations baked into the spec itself.

**Step 1b: Verification Architecture**

Before any implementation design is finalized, the Builder produces a **Verification Strategy** that answers: *"What properties of this system must be mathematically provable, and what architectural constraints does that impose?"*

This includes:

- **Provable Properties Catalog:** Which invariants, safety properties, and correctness guarantees must be formally verified — not just tested? Examples: "This state machine can never reach an invalid state." "This arithmetic can never overflow." "This parser always terminates." "This access control check is never bypassed." The Builder distinguishes between properties that *should* be proven (critical path, security boundaries, financial calculations) and properties where test coverage is sufficient (UI formatting, logging, non-critical defaults).
- **Purity Boundary Map:** A clear architectural separation between the **deterministic, side-effect-free core** (where formal verification can operate) and the **effectful shell** (I/O, network, database, user interaction). This is the most consequential design decision in VSDD — it dictates module boundaries, dependency direction, and how state flows through the system. The pure core must be designed so that verification tools can reason about it without mocking the entire universe.
- **Verification Tooling Selection:** Based on the language and the properties to be proven, the Builder selects the appropriate formal verification stack (Kani for Rust, CBMC for C/C++, Dafny, TLA+ for distributed systems, etc.) and identifies any constraints these tools impose on code structure. This happens *now*, not after the code is written, because tool constraints are architectural constraints.
- **Property Specifications:** Where possible, the Builder drafts the actual formal property definitions (e.g., Kani proof harnesses, Dafny contracts, TLA+ invariants) alongside the behavioral spec. These aren't implementation — they're the formal expression of what the spec already says in natural language. They serve as a second, mathematically precise encoding of the requirements.

**Why this must happen in Phase 1:** If the system is designed with side effects woven through the core logic, no amount of Phase 5 heroics will make it verifiable. A function that reads from a database, performs a calculation, and writes to a log in one block cannot be formally verified without mocking infrastructure that the verifier may not support. But a function that takes data in, returns a result, and lets the caller handle persistence — that's a function a model checker can reason about. This boundary must be drawn at the spec level because it fundamentally shapes the module decomposition, the dependency graph, and the testing strategy that follows.

**Step 1c: Spec Review Gate**

The complete spec — behavioral contracts *and* verification architecture — is reviewed by *both* the human and the Adversary before any tests are written. Sarcasmotron tears into the spec looking for:

- Ambiguous language that could be interpreted multiple ways
- Missing edge cases
- Implicit assumptions that aren't stated
- Contradictions between different parts of the spec
- **Properties claimed as "testable only" that should be provable** (the Adversary pushes back on lazy verification boundaries)
- **Purity boundary violations** — logic marked as "pure core" that actually depends on external state
- **Verification tool mismatches** — properties the selected tooling can't actually prove

The spec is iterated until the Adversary can't find legitimate holes in either the behavioral contract or the verification strategy.

**Chainlink Integration:** Each spec maps to a Chainlink Issue. Sub-issues are generated for each behavioral contract item, edge case, non-functional requirement, *and* each formally provable property. The provable properties get their own bead chain so their status is tracked independently from test coverage.

---

#### **Phase 2 — Test-First Implementation (The TDD Core)**

*Red → Green → Refactor, enforced by AI.*

With an airtight spec in hand, the Builder now writes tests — and *only* tests. No implementation code yet.

**Step 2a: Test Suite Generation**

The Builder translates the spec directly into executable tests:

- **Unit Tests:** One or more tests per behavioral contract item. Every postcondition becomes an assertion. Every precondition violation becomes a test that expects a specific error.
- **Edge Case Tests:** Every item in the Edge Case Catalog becomes a test. These are the tests that catch the bugs that "never happen in production" (until they do).
- **Integration Tests:** Tests that verify the module works correctly within the larger system context defined in the spec.
- **Property-Based Tests:** Where applicable, the Builder generates property-based tests (e.g., using Hypothesis, fast-check, or proptest) that assert invariants hold across randomized inputs.

**The Red Gate:** All tests must *fail* before any implementation begins. If a test passes without implementation, the test is suspect — it's either testing the wrong thing or the spec was wrong. The Builder flags this for human review.

**Step 2b: Minimal Implementation**

The Builder writes the *minimum* code necessary to make each test pass, one at a time. This is classic TDD discipline:

1. Pick the next failing test.
2. Write the smallest implementation that makes it pass.
3. Run the full suite — nothing else should break.
4. Repeat.

**Step 2c: Refactor**

After all tests are green, the Builder refactors for clarity, performance, and adherence to the non-functional requirements in the spec. The test suite acts as the safety net — if refactoring breaks something, the tests catch it immediately.

**Human Checkpoint:** The developer reviews the test suite and implementation for alignment with the "spirit" of the spec. AI can miss intent even when it nails the letter of the contract.

---

#### **Phase 3 — Adversarial Refinement (The VDD Roast)**

*The code survived testing. Now it faces the gauntlet.*

The verified, test-passing codebase — along with the spec and test suite — is presented to **Sarcasmotron** in a fresh context window.

**What the Adversary reviews:**

1. **Spec Fidelity:** Does the implementation actually satisfy the spec, or did the tests inadvertently encode a misunderstanding?
2. **Test Quality:** Are the tests actually testing what they claim? Are there tests that would pass even if the implementation were subtly wrong? (Tautological tests, tests that mock too aggressively, tests that assert on implementation details rather than behavior.)
3. **Code Quality:** The classic VDD roast — placeholder comments, generic error handling, inefficient patterns, hidden coupling, missing resource cleanup, race conditions.
4. **Security Surface:** Input validation gaps, injection vectors, authentication/authorization assumptions.
5. **Spec Gaps Revealed by Implementation:** Sometimes writing the code reveals that the spec was incomplete. The Adversary looks for implemented behavior that isn't covered by the spec.

**Negative Prompting:** Sarcasmotron is prompted for zero tolerance. No "overall this looks good, but..." preamble. Every piece of feedback is a concrete flaw with a specific location and a proposed fix or question.

**Context Reset:** Fresh context window on every adversarial pass. No relationship drift. No accumulated goodwill.

---

#### **Phase 4 — Feedback Integration Loop**

The Adversary's critique feeds back through the entire pipeline:

- **Spec-level flaws** → Return to Phase 1. Update the spec, re-review.
- **Test-level flaws** → Return to Phase 2a. Fix or add tests, verify they fail against the current implementation (or a deliberately broken version), then fix implementation if needed.
- **Implementation-level flaws** → Return to Phase 2c. Refactor, ensure all tests still pass.
- **New edge cases discovered** → Add to spec's Edge Case Catalog, write new failing tests, implement fixes.

This loop continues until convergence (see Phase 6).

---

#### **Phase 5 — Formal Hardening (Executing the Verification Plan)**

The verification architecture designed in Phase 1b is now *executed* against the battle-tested implementation. Because the codebase was architected from the start with a pure core and clear purity boundaries, formal verification tools can operate on it without heroic refactoring.

- **Proof Execution:** The property specifications drafted in Phase 1b (Kani harnesses, Dafny contracts, TLA+ invariants, etc.) are run against the implementation. Because the architecture was designed for verifiability, these proofs should engage cleanly with the pure core. Failures here indicate either implementation bugs or spec properties that need refinement — both feed back through Phase 4.
- **Fuzz Testing:** Structured fuzzing (AFL++, libFuzzer, cargo-fuzz) is layered on top of property-based tests to find inputs that no human or AI anticipated. The deterministic core is an ideal fuzz target because it has no environmental dependencies to mock.
- **Security Hardening:** Suites like **Wycheproof** (cryptographic edge cases) and **Semgrep** (static analysis) are run as CI/CD gates.
- **Mutation Testing:** Tools like **mutmut** or **Stryker** mutate the code to verify the test suite actually catches real bugs. If a mutation survives, the test suite has a gap.
- **Purity Boundary Audit:** A final check that the purity boundaries defined in Phase 1b have been respected throughout implementation. Any side effects that crept into the pure core during development are flagged and refactored out.

All formal verification and fuzzing results feed back into Phase 4 if issues are found.

---

#### **Phase 6 — Convergence (The Exit Signal)**

VSDD inherits VDD's **hallucination-based termination**, extended across all three dimensions:

| Dimension | Convergence Signal |
| --- | --- |
| **Spec** | The Adversary's spec critiques are nitpicks about wording, not about missing behavior, ambiguity, or verification gaps. |
| **Tests** | The Adversary can't identify a meaningful untested scenario. Mutation testing confirms high kill rate. |
| **Implementation** | The Adversary is forced to invent problems that don't exist in the code. |
| **Verification** | All properties from the Phase 1b catalog pass formal proof. Fuzzers find nothing. Purity boundaries are intact. |

**Maximum Viable Refinement** is reached when all four dimensions have converged. The software is considered **Zero-Slop** — every line of code traces to a spec requirement, is covered by a test, has survived adversarial scrutiny, and the critical path is formally proven.

---

### **III. The VSDD Contract Chain**

One of VSDD's defining properties is **full traceability**. Every artifact links back:

```text
Spec Requirement → Verification Property → Chainlink Bead → Test Case → Implementation → Adversarial Review → Formal Proof
```

At any point, you can ask: *"Why does this line of code exist?"* and trace it all the way back to a specific spec requirement, through the verification property it satisfies, the test that demanded it, the adversarial review that hardened it, and the formal proof that guarantees it. Equally, you can ask *"Why is this module structured as a pure function?"* and trace that decision back to the Purity Boundary Map in Phase 1b.

---

### **IV. Core Principles of VSDD**

1. **Spec Supremacy:** The spec is the highest authority below the human developer. Tests serve the spec. Code serves the tests. Nothing exists without a reason traced to the spec.

2. **Verification-First Architecture:** The need for formal provability shapes the design, not the other way around. Pure core, effectful shell. If you can't verify it, you architected it wrong — and you find that out in Phase 1, not Phase 5.

3. **Red Before Green:** No implementation code is written until a failing test demands it. AI models are explicitly constrained to follow TDD discipline — no "let me just write the whole thing and add tests after."

4. **Anti-Slop Bias:** The first "correct" version is assumed to contain hidden debt. Trust is earned through adversarial survival, not initial appearance.

5. **Forced Negativity:** Adversarial pressure bypasses the politeness filters of standard LLM interactions. The Adversary doesn't care about your feelings — it cares about your invariants.

6. **Linear Accountability:** Chainlink beads ensure every spec item, test, and line of code has a corresponding tracked unit of work. Nothing slips through the cracks.

7. **Entropy Resistance:** Context resets on every adversarial pass prevent the natural degradation of long-running AI conversations.

8. **Four-Dimensional Convergence:** The system isn't done until specs, tests, implementation, *and* formal proofs have all independently survived adversarial review.

---

### **V. AI Orchestration Notes**

VSDD is explicitly designed for multi-model AI workflows:

- **The Builder** benefits from large context windows and strong code generation (Claude, GPT-4, etc.). It needs to hold the full spec, test suite, and implementation simultaneously.
- **The Adversary** benefits from a *different* model or configuration to avoid shared blind spots. Using a different model family (e.g., Gemini as Adversary when Claude is Builder) introduces genuine cognitive diversity.
- **The Human** is not a bottleneck — they're the strategic layer. They approve specs, resolve disputes, and make judgment calls that AI can't. The human's role is *elevated*, not diminished, by the AI orchestration.

**Prompt Engineering for TDD Discipline:** The Builder must be explicitly instructed: *"You are operating under strict TDD. Write tests FIRST. Do NOT write implementation code until I confirm all tests fail. When implementing, write the MINIMUM code to pass each test."* Without this constraint, AI models will naturally try to write implementation and tests simultaneously.

---

### **VI. When to Use VSDD**

VSDD is high-ceremony by design. It's worth the overhead when:

- Correctness is non-negotiable (financial systems, medical software, infrastructure)
- The codebase will be maintained long-term and must resist entropy
- Multiple AI models are available and the team wants maximum quality extraction
- Security is a primary concern, not an afterthought
- The project complexity justifies formal spec work

For rapid prototyping or throwaway scripts, use the parts that make sense — TDD discipline and a quick adversarial pass can still catch a lot of slop even without the full ceremony.

---

*"VSDD doesn't just generate code — it generates code that can prove why it exists, demonstrate that it works, and survive an adversary that wants it dead."*

---

### **VII. Spec Discipline — Goal Specs vs Tech Specs**

The reason VSDD splits specs from implementation is so each unit of work can be **discrete and focused on one technical problem**. That discipline only holds if the spec itself respects a second split: **goal specs** vs **tech specs**.

- **Goal spec.** Captures *what must be true when this work is done.* Carries **breadth** — many goals in one document is fine; a goal spec with 300 line items is not a smell. The point is to enumerate the surface area, not to design a solution. **Goal specs must NOT include technical content** (implementation details, API shapes, code, algorithms): the *how* belongs in tech specs. If you find yourself writing pseudocode or describing a solution inside a goal spec, stop — that material is a tech spec being written in the wrong place. Examples of valid goal-spec content: feature checklist drawn from an external standard, coverage matrix, acceptance criteria, observed behavior of a reference implementation.

- **Tech spec.** Captures *how exactly one technical problem will be solved.* Carries **depth** — one problem per tech spec. No grouping, no bundling, no section-level "tech spec" that covers a dozen goals. The point is focus on a single problem so design choices can be reviewed in isolation.

The two rules are symmetric. Goal specs may have many entries but no technicals; tech specs may have many technicals but only for one problem. Mixing the two — a goal spec with embedded design, or a tech spec covering several problems — defeats the purpose of separating them in the first place.

When a goal spec contains N goals, that becomes **N tech specs** — one per goal — not fewer-by-grouping. The instinct to "save clutter" by combining tech specs defeats the entire reason to separate them from goal specs in the first place.

**Investigation, mining, and observation tasks** (e.g. surveying a reference implementation, empirically probing an external API, deriving an edge-case catalog from real data) are **goal-setting work**, not tech-spec work. They sub-issue under the goal spec they refine — not under a tech spec, and not standalone. They exist to sharpen the goal spec against reality before tech specs are written.

**Per-tech-spec issue body**: write the tech spec *into the issue body*, not as comments. Agents reading an issue overwhelmingly consume the body and skip the comment thread — the comment section is not a reliable working surface for spec material that downstream agents will need to read. The body is the durable, agent-consumable spec; comments are conversation *about* it. If the body grows past the issue-tracker's body cap, the tech spec is too large — it's almost certainly bundling more than one problem and should be split.

**Quick check.** Before writing a tech spec, ask: *can I name a single technical problem this spec solves?* If the answer takes more than one sentence, it's probably more than one tech spec.

---

### **VIII. Regression Sets and the 4-Result Rule**

**Regression Sets (The 4-Result Rule):** Regression tests follow the same Red → Green discipline. The spec must zoom out enough to identify its **blast radius** — related features, adjacent modules, shared interfaces — and include regression tests for them. Before implementation begins, the Builder must produce **4 test results across 2 runs**:

| Run | New Tests (Feature) | Regression Tests (Blast Radius) |
| --- | --- | --- |
| **Pre-implementation (Red Gate)** | Fail (Red) — proves tests are real | Pass — proves existing behavior is intact |
| **Post-implementation (Green Gate)** | Pass (Green) — proves implementation works | Pass — proves no regressions introduced |

Both Red Gate runs (new = fail, regression = pass) are **required before writing any implementation code**. Both Green Gate runs (new = pass, regression = pass) are **required to exit Phase 2**. If regression tests fail at any point, the implementation has introduced a regression and must be fixed before proceeding. This forces every spec to consider its neighbors, not just itself.

---

### **IX. Architectural Review — Multi-Word Symbol Analysis**

An indicator of a poorly architected solution is the use of camelCasing and snake_casing in the codebase. They do not guarantee that the code was poorly written, but they are strong indicators for one primary reason that breaks down into three:

Multi-word symbols are an indicator of poorly architected code, because they can mean the following:

1. **Multi-word function symbols:** A function with a multi-word name in its signature was likely poorly architected as this is an indicator that it was not abstracted well and probably should have been an object method on a state machine.

2. **Multi-word symbols in general:** Multi-word vars are only useful in one case: the symbol is ambiguous and could collide with another symbol if reduced. In a well-architected or well-spec'd solution, these symbols are identifiable ahead of time. You should know exactly what symbol collisions you'll have at the time of writing the spec. Example: `archiveUrl` is never at risk of colliding with another symbol and should be reduced to `archive` or `url` (smaller footprint symbols).

3. **Multi-word localized/scoped symbols:** In addition to the problem of a spec not pre-identifying colliding concepts, another thing multi-word symbols can indicate — when the symbols do genuinely collide — is that the scope they are being used in is doing too much. In this case, the problematic scope should have been better architected and split up into smaller, more maintainable units.

**PascalCase exception:** Multi-word PascalCase names (classes, interfaces, type aliases) are generally acceptable. Classes and types are used across unpredictable scopes, so collisions cannot be accurately predicted at spec time. They should still be evaluated — a `BridgeData` inside a `Bridge` namespace is still redundant — but PascalCase multi-word names are not automatic red flags the way camelCase and snake_case multi-word names are.

**Serde leak exception:** Snake_case or camelCase field names that originate from a serialization format (JSON, YAML, C headers) are acceptable when the runtime symbol intentionally matches the at-rest representation. Example: `c_type` in a TypeScript interface matching `c_type` in a YAML/JSON schema is fine — the consistency is the point. Evaluate whether the *source* naming is appropriate, not whether the runtime code should diverge from it.

**External symbol exception:** Multi-word symbols that originate from external libraries or tools (e.g. `mat_new_from_data` from OpenCV's C API, `connectedComponentsWithStats` from cv::) are acceptable. You don't control the upstream naming. Wrapping them in better-named methods is good practice but not a violation.

**Verbose naming as proof of inadequate spec:** Even when architecture is correct, verbose symbols that could be reduced are proof of an inadequately spec'd solution. If the architecture was properly spec'd, symbol footprints would have been minimized during design. Larger symbols mean poorer performance (cognitive load, line width, readability). Verbose naming habits are only valuable where extensive qualification genuinely adds disambiguation value — in all other cases, they are waste that should have been caught at spec time.

**Error structure inconsistency:** Another indicator of poorly spec'd code is inconsistency in error handling patterns. In well-spec'd code, errors should be structurally uniform: consistent error types, consistent error codes, consistent throw/return patterns. If some functions throw `PreprocessError` with codes, others throw raw `Error`, and others return null — the spec failed to define an error contract. During adversarial review, flag any inconsistencies in: error types used, error code coverage, try/catch vs assertThrows patterns in tests, and whether all failure modes are surfaced through the same mechanism.

**How to apply:** During adversarial review (Phase 3) and refactoring (Phase 2c), scan for multi-word symbols. For each one, determine: (a) should this be a method on an object? (b) does the name need qualification, or is the scope unambiguous? (c) if qualification is genuinely needed, is the scope doing too much? Also scan for error structure inconsistencies across the module boundary.

---

---

## CI/CD

This repo's `.github/workflows/` enforces VSDD on itself. Six workflows, mirroring the pipeline:

- **`issue-review.yml`** — fires on `issues: [opened, edited, assigned]`. Runs **two** adversarial reviewers (Gemini + Claude) in parallel as Sarcasmotron (Phase 1c, Spec Review Gate) against the issue body. Two cognitive sources per §V. Each reviewer posts a single comment whose top is an HTML-comment-wrapped frontmatter block (`<!-- vsdd-phase-1c\nreviewer: <name>\nverdict: pass|fail\n-->`), invisible to readers and parseable by promote.yml. The CI derives the verdict from the reviewer's required `*Verdict: \`pass\`*` / `*Verdict: \`fail\`*` line and writes it into the frontmatter. **The verdict gates promotion** — see `promote.yml`. Subject to the **ownership gate** (see below) — issues authored by non-org-members stay dormant until an org member self-assigns.
- **`pr-review.yml`** — fires on `pull_request: [opened, synchronize, reopened, ready_for_review, assigned]`. Runs *two* adversarial reviewers in parallel — Gemini and Claude — against the diff with `MEMORY.md` as the standard (Phase 3, Adversarial Refinement). Two cognitive sources per §V. Each posts a PR comment. Also runs a deterministic `symbol-audit` job (`.github/scripts/symbol-audit.sh`) that greps the PR diff for camelCase/snake_case identifiers and posts the matches under `<details>` as a §IX pre-check, with PascalCase, SCREAMING_SNAKE, recognized serde-leak fields, and third-party paths soft-filtered. **Advisory only — never gates.** Also subject to the ownership gate.
- **`promote.yml`** — fires on `issues: [assigned]`. The assignment-triggered promotion pipeline (see below).
- **`labels.yml`** — fires on `workflow_dispatch` and on push to `main` when `.github/labels.yml` changes. Idempotent label sync; manages `spec:goal`, `spec:tech`, `needs-human`, `ci-meta`.
- **`test.yml`** — fires on `push` to `main` and on `pull_request`. Markdown lint, external link check (lychee), a structural sanity check that all nine Roman-numeral sections of `MEMORY.md` are present, an `issue-linkage` job that fails the build if a PR body lacks a closing keyword + issue number (`Closes #N` / `Fixes #N` / `Resolves #N`), and a `green-gate` job that runs the detected test suite on PR HEAD per §VIII (or trivially passes with `§VIII N/A` on docs repos with no detected runner). Red Gate (tests-failing-before-impl) is enforced only via the `promote-tech-to-pr` agent pipeline; for human PRs Red Gate is trust-based discipline. **Gating** — required by the branch-protection rule on `main`.
- **`ci-meta.yml`** — fires on `pull_request` when `.github/workflows/**` or `MEMORY.md` change. Runs Gemini *and* Claude in parallel against the proposed CI workflows; both must reach consensus that the CI correctly enforces VSDD. Disagreement opens a tracked **goal-spec** issue per gap (deduped by title; labeled `spec:goal` and `ci-meta`) and fails the consensus check. The opened issues are problem-only — they describe what's missing, never propose a solution; solutions come from the promotion pipeline after an org member assigns themselves. **Surfaces red on disagreement but is not in the protection rule's required-checks list** — gaps are tracked as issues for follow-up; the user decides whether to address each before merge.

### Ownership gate (HIL)

CI runs are gated on **ownership**: an issue or PR is *owned* iff its author is an org member OR at least one current assignee is. Unowned items stay dormant — workflows skip until an org member self-assigns. This gives a single uniform Human-In-The-Loop control:

- External or bot-authored issues/PRs cannot consume agent budget by default.
- An org member assigning themselves IS the "I take responsibility for this" signal.
- Re-trigger by unassigning + reassigning.

The gate runs as a top-level `ownership` job in each workflow; downstream jobs `needs: [ownership]` and skip when unowned. The owner login is also threaded into the gemini/claude composite actions as `actor-override` so the inner org-member check validates against the *owner*, not the workflow trigger sender (which on a fork-PR `synchronize` event would be the external pusher).

### Bot-trust opt-in

Bot-trust is an opt-in mechanism that allows workflows to grant elevated permissions to trusted bot accounts (e.g. `promote-tech-to-pr[bot]`). Bot-trust may only be enabled when all of the following conditions are met:

1. The bot account is owned by the org (not a third-party app).
2. The bot operates within a **safe-context predicate** — the workflow checks that the triggering event, payload fields, and target refs all originate from org-controlled sources.
3. An org member has explicitly opted in via assignment (the ownership gate).

The safe-context predicate guarantees that bot actions only execute when: (a) the event payload cannot be forged by external actors, (b) the target branch/issue is within the org's control, and (c) no user-supplied content flows into privileged operations unvalidated. These checks ensure that an external attacker cannot exploit bot-trust to escalate privileges, inject malicious payloads, or trigger workflows on forged events — the predicate rejects any context that fails these constraints before bot-trust is evaluated.

### Promotion pipeline (`promote.yml`)

The promotion pipeline lets sw2m repos run autonomously with HIL only at decision points (assignment). On `issues: [assigned]`:

**Phase 1c gate.** Before goal→tech or tech→PR runs, the `phase-1c-clearance` job inspects the issue's bot-posted verdict markers. Both Gemini's and Claude's most-recent verdict markers must:

1. Be `pass` (a `fail` verdict from either reviewer blocks promotion until the issue body is edited and Phase 1c re-runs).
2. Have been posted **after** the issue's last `updated_at` (a verdict that pre-dates the most recent issue edit is stale and treated as missing).

If either condition fails, promotion is blocked. The fix is to address the reviewer's blocking concerns, edit the issue body (which re-fires `issue-review.yml`), and re-trigger promote (un-assign + re-assign). Race-on-assign: when issue-review and promote both fire from the same `assigned` event, the clearance job typically runs before the reviewers finish; expect to re-assign once Phase 1c completes.

**Cardinality orchestrator (goal-specs only, #128).** When the issue is a `spec:goal`, an additional `orchestrator` job runs after the two named reviewers. Each reviewer is prompted to emit `subjects: <int>` and `outcomes: <int>` lines at the end of their output (a noun-phrase / verb-phrase count per #125's cardinality rule). The orchestrator extracts both reviewers' counts via `phase-1c-cardinality.js` and posts a third Phase 1c comment with `reviewer: orchestrator`. Verdict: `fail` (with blocking concerns) when either count is invalid (zero, missing, decimal, non-numeric) OR when the two reviewers disagree on classification (`min == 1` vs `min ≥ 2`); `pass` with the per-axis-min canonical tuple in frontmatter when reviewers agree. The `phase-1c-clearance` job extends to fail on a fresh `orchestrator: fail` comment in addition to the strict gemini+claude pass requirement. `promote-goal-to-tech` reads the canonical tuple from the latest orchestrator-pass comment and constrains the LLM to emit exactly one tech-spec when `min == 1`.

1. **Goal → tech.** A `spec:goal` issue, when assigned to an org member, is decomposed by Claude into N tech-spec sub-issues (one technical problem each per §VII). Each new sub-issue carries `spec:tech` and a back-link to the parent goal. The agent's job is decomposition, not solution. When the cardinality orchestrator (above) determined `min == 1`, the prompt is constrained to a single tech-spec output.

2. **Tech → draft PR.** A `spec:tech` issue, when assigned, kicks off the **5-phase tech-to-PR pipeline** mapped to §VIII (4-Result Rule):

   | Phase | Run by | Purpose |
   | --- | --- | --- |
   | 1. Scaffold | CI (no agent) | Branch off `main`, draft PR with `Closes #N` and the tech-spec embedded in the body. |
   | 2. Author tests | Agent | Write new tests + identify regression set. Tests must be non-tautological and must not modify the regression set. |
   | 3. Red gate | CI (no agent) | Run new tests (expect fail) and regression tests (expect pass). Mismatch → loop to Phase 2. **Cap: 3 retries.** |
   | 4. Implement | Agent | Write code that makes the new tests pass without breaking regressions. Tests are immutable in this phase. |
   | 5. Green gate | CI (no agent) | Run new tests (expect pass) and regression tests (expect pass). Mismatch → loop to Phase 4. **Cap: 3 retries.** |

   On exhaustion of either retry budget the pipeline **bails**: applies `needs-human` to the issue, comments with the last test output on the issue and PR, leaves the PR draft. A human takes over.

   On success the PR is left as draft; promoting to ready-for-review is a human decision and triggers `pr-review.yml` Phase 3 adversarial review.

   **Docs-repo carve-out.** Repos with no detectable test runner (e.g. this one) follow the §VIII N/A path: Phases 2/3/5 are skipped and Phase 4 runs once. The draft PR is the artifact for human review.

### Red-gate marker — one-way diode (#129)

The `Red-gate-cleared` marker is a comment on the PR thread authored by `github-actions[bot]` whose body contains the literal token `<!-- vsdd-red-gate-cleared -->` on its own line. Token presence is the entire identifying signal — no SHA, no commit-status, no statuses-API write.

The marker is a **one-way diode**: once `red-conditions-gate.yml` posts it, no workflow in this repo deletes or edits it. Subsequent pushes, force-pushes, and rebases do not revoke the marker; the comment persists across history rewrites. (Earlier marker designs embedded a `$HEAD_SHA` in the body and broke on rebase; the SHA payload is gone.)

`vsdd-marker-check.yml` is a reusable workflow that scans a PR's comments via paginated API for the token and exposes `marker-present: true|false`. It always exits 0 — purely informational, never gates merge.

### Opt-out brand — bot comment (#129)

The `vsdd-brand.yml` workflow maintains an "out-of-process" brand on PRs as a comment authored by `github-actions[bot]` containing the token `<!-- vsdd-opt-out-brand -->`. The bot-as-author convention is the only spoof-resistant marker: labels and other PR metadata can be flipped by anyone with PR write access, but only `github-actions[bot]` can author comments under its own identity.

Brand state is computed from three properties:

- **Whitelist match** — the PR's diff against base is non-empty AND every changed-file path (added, modified, deleted, copied, rename source, rename destination) is non-impl by the `isWhitelistPath` predicate in `.github/scripts/vsdd-brand.js`. The predicate matches: paths under `.github/`, files ending in `.md` (markdown documentation), and recognized root-level repo-metadata files (`.gitignore`, `.gitattributes`, `LICENSE`, `LICENSE.*`, `CODEOWNERS`). No symlink resolution.
- **Has impl content** — the PR's diff against base modifies at least one non-test file (test files classified by `.github/scripts/classify-changes.sh`'s default pattern set).
- **Marker present** — earned marker exists on the thread (per the diode definition above).

Brand applied iff `whitelist OR (hasImpl AND !markerPresent)`. When applied, the bot posts a brand comment if none exists; when un-applied, the bot deletes the brand comment if one exists. The brand is informational; it does not block merge. It records the consequence of choosing impl-first (or being a `.github/`-only meta-PR for which TDD discipline is exempt).

Manual deletion of the Red-gate-cleared marker comment by a human moves the PR back to no-marker state; the bot does not re-post (no comment-deletion handler exists; absence of the handler IS the mechanism). The brand workflow re-evaluates state on every PR event and on `issue_comment.deleted` (resolved to PR via `github.event.issue.pull_request`).

### Reusing the workflows

Each workflow exposes a `workflow_call:` trigger so other `sw2m` repos can reuse them:

```yaml
jobs:
  vsdd-pulls:
    uses: sw2m/philosophies/.github/workflows/pr-review.yml@main
    secrets: inherit
```

Required repo secrets: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`.

---

## Sources

- Sections I–VI: [VSDD canonical gist](https://gist.github.com/dollspace-gay/d8d3bc3ecf4188df049d7a4726bb2a00) by [@dollspace-gay](https://github.com/dollspace-gay), used verbatim.
- Section VII (Spec Discipline): original to this document; codifies a working principle for sw2m projects.
- Section VIII (Regression Sets and the 4-Result Rule): adapted from [anonhostpi/Agent-World CLAUDE.md](https://github.com/anonhostpi/Agent-World/blob/main/CLAUDE.md), Phase 2a addition.
- Section IX (Multi-Word Symbol Analysis): from [anonhostpi/Agent-World CLAUDE.md](https://github.com/anonhostpi/Agent-World/blob/main/CLAUDE.md), Section VII, used verbatim (renumbered to IX).
