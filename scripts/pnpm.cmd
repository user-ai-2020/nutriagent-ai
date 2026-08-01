@echo off
REM Repo-local pnpm shim (Task 13) — use when `pnpm` is not on PATH.
REM Usage: scripts\pnpm.cmd install   OR add repo\scripts to PATH once.
npx --yes pnpm@9.15.4 %*
