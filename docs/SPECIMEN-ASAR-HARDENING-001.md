# SPECIMEN-ASAR-HARDENING-001 — explicit archive path qualification

**Status:** narrow follow-up to SPECIMEN-ASAR-001. No real Desktop specimen archive has been scanned.

## Finding

`Scan-AsarSurface.mjs` supports both `--root INSTALL` and `--archive FILE`, but the original implementation referenced `dirname(archive)` when no installation root matched without importing `dirname` from `node:path`.

The existing synthetic self-test exercised only `--root`, so the explicit archive mode could fail with `ReferenceError: dirname is not defined`.

## Fix

- import `dirname` from `node:path`;
- run the synthetic scanner a second time with `--archive app.asar`;
- verify one archive is mapped and its root-relative archive path is `app.asar`.

This keeps the read-only ASAR workflow dependency-free and makes the runbook-safe explicit archive path executable before physical Windows use.

## Evidence boundary

This is deterministic tooling hardening only. It does not claim a real Claude Desktop ASAR scan, ASAR patchability, or Desktop acceptance.
