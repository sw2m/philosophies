// VSDD-flavored Check Run base. Currently empty — extends `BaseCheck`
// without overrides. Reserved for VSDD-base-but-not-round content as more
// VSDD CI surface migrates into this structure (e.g., a hypothetical
// Phase-4 implementation Check that doesn't use the review-round cycle).
//
// Round-cycle behavior (title/summary formatting, RoundOpen/RoundClose,
// auto-formatting overrides) lives in `./round.ts` — Round extends this
// class. Phase-3-specific code lives in `./phase-3-check.ts` — Phase3
// extends Round.

import { Check as BaseCheck } from "../github/check.ts";

export class Check extends BaseCheck {}
