#!/usr/bin/env python3
"""Consensus aggregator for VSDD CI pipeline.

This module provides the exit-code computation for the consensus job.
The pure function decide_exit_code determines the process exit code based
on the aggregated verdict and the count of newly opened gap issues.
"""


def decide_exit_code(verdict: str, opened_count: int) -> int:
    """Compute the process exit code from verdict and opened_count.

    Args:
        verdict: Aggregated PR-scope verdict, must be "pass" or "fail".
        opened_count: Number of new (non-duplicate) gap issues filed.

    Returns:
        0 if verdict is "pass" and opened_count is 0, otherwise 1.

    Raises:
        ValueError: If verdict is not "pass" or "fail", or opened_count < 0.
    """
    if verdict not in ("pass", "fail"):
        raise ValueError(f"verdict must be 'pass' or 'fail', got {verdict!r}")
    if opened_count < 0:
        raise ValueError(f"opened_count must be >= 0, got {opened_count}")
    if verdict == "fail" or opened_count > 0:
        return 1
    return 0
