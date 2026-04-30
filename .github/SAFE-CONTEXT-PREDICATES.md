# Safe-Context Predicates per Event Type

This document defines the **safe-context predicate** for each GitHub event type from which the composite actions (gemini/claude reviewers) may be invoked. The predicate determines when callers may safely set `trust-github-actions-bot: 'true'`.

Each predicate is a GitHub Actions expression that evaluates to `'true'` or `'false'`. When the predicate is `'true'`, the caller may safely opt in. When `'false'`, the caller must NOT set the trust input (or must set it to `'false'`).

The predicate gate and the identity gate are independent; both must pass for trust acceptance.

---

## `pull_request`

```yaml
${{ github.event.pull_request.head.repo.full_name == github.repository }}
```

**Rationale:** A fork's head branch lives at `<fork-owner>/<repo>`, not `<our-org>/<repo>`. When the head repo matches the base repo, the PR's head branch is in our repo and could only have been pushed by someone with write access (i.e., us). External contributors' fork PRs evaluate to `'false'` and are denied trust.

**Dependabot edge case.** Dependabot creates PRs from branches on the base repository (Dependabot has push access via GitHub's `dependabot[bot]` integration). For our purposes, this is *intended* to be trusted at the predicate level — the `head.repo.full_name == github.repository` evaluates to `'true'` for Dependabot PRs. However, the trust opt-in only applies when the resolved actor is *exactly* `github-actions[bot]` — `dependabot[bot]` is a different bot identity and falls through to the normal org-membership check (which it fails). So Dependabot PRs trigger the safe-context predicate `'true'`, but the trust opt-in still doesn't grant Dependabot any privileges.

---

## `pull_request_target`

```yaml
'false'
```

**Rationale:** `pull_request_target` runs in the BASE repo's context with elevated permissions (full GITHUB_TOKEN, secrets access), but the PR can come from a fork. The actor could be `github-actions[bot]` for arbitrary reasons, including malicious fork PR triggers. Trust is **never** safe in `pull_request_target`. Callers must NOT opt in.

---

## `push`

```yaml
${{ 'true' }}
```

**Rationale:** Push events on protected branches (main, etc.) require write access. Anyone who can push is implicitly trusted to be us. Push events on feature branches similarly require write access. Safe to opt in.

---

## `workflow_dispatch`

```yaml
${{ 'true' }}
```

**Rationale:** Triggering `workflow_dispatch` requires the user have write access to the repo. The `github.actor` is the user who clicked the button (or `github-actions[bot]` if a workflow re-dispatches itself, which is also our trust surface). Safe to opt in.

---

## `repository_dispatch`

```yaml
${{ github.event.client_payload.trusted == true }}
```

**Rationale:** `repository_dispatch` is triggered via a custom dispatch token. The payload should explicitly mark trustedness via a `trusted: true` field. If the payload doesn't include or doesn't set `trusted`, default to deny. The dispatching workflow is responsible for signing the payload appropriately; the receiving workflow simply checks the marker. This event type requires extra caller diligence; the predicate is conservative.

---

## `schedule`

```yaml
${{ 'true' }}
```

**Rationale:** Scheduled workflows run with the repo's own GITHUB_TOKEN; the actor is `github-actions[bot]` and the trigger is internal. Safe to opt in.

---

## `workflow_run`

```yaml
${{ github.event.workflow_run.head_repository.full_name == github.repository }}
```

**Rationale:** Similar to `pull_request` — only consider the chained workflow run trusted when its source is our repo, not a fork's CI cascading into us.

---

## `issues`

```yaml
${{ 'true' }}
```

**Rationale:** `issues` events fire on issue lifecycle in this repository. The issue lives in our repo (no fork-equivalent). The trust opt-in is only relevant when the *resolved actor* is `github-actions[bot]`; non-bot identities are unaffected. When the actor is the bot, it can only have acted via one of our own workflows. When the actor is an external user (issue opener, commenter, assigner), the opt-in has no effect on them. Safe to opt in.

---

## `issue_comment`

```yaml
'false'
```

**Rationale:** `issue_comment` is unsafe specifically because of `pull_request_target`-adjacent behavior: workflows triggered by `issue_comment` events on PR-style issue comments can be configured to run with elevated permissions, and the comment can come from a fork PR's commenter. While the resolved actor in a normal context is the human commenter (non-bot, opt-in irrelevant), `issue_comment` is also a documented escalation vector for cross-repo trust confusion. Fail-closed by default. The `issues` event does not have this PR-comment-adjacent escalation path, which is why it is safe and `issue_comment` is not.

---

### Other / unrecognized event types

```yaml
'false'
```

**Rationale:** Fail-closed default. If a future event type is added (or this composite action is invoked from an event not enumerated above), the safe predicate is "no, don't trust." Each new event type that wants opt-in must explicitly add a predicate via a follow-up tech-spec.
