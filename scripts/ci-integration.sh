#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

now_epoch() {
  date +%s
}

SHARD_INDEX="${ZENITH_CI_SHARD_INDEX:-?}"
SHARD_TOTAL="${ZENITH_CI_SHARD_TOTAL:-?}"
RETRY_ATTEMPT="${ZENITH_CI_RETRY_ATTEMPT:-1}"
SECTION_START_EPOCH="$(now_epoch)"
OVERALL_START_EPOCH="$SECTION_START_EPOCH"
CURRENT_PHASE="startup"
CURRENT_COMMAND="none"
HEARTBEAT_PID=""

log_ci() {
  printf '[ci-integration][%s] shard=%s/%s attempt=%s %s\n' \
    "$(timestamp)" \
    "$SHARD_INDEX" \
    "$SHARD_TOTAL" \
    "$RETRY_ATTEMPT" \
    "$*"
}

stop_heartbeat() {
  if [[ -n "$HEARTBEAT_PID" ]]; then
    kill "$HEARTBEAT_PID" 2>/dev/null || true
    wait "$HEARTBEAT_PID" 2>/dev/null || true
    HEARTBEAT_PID=""
  fi
}

start_heartbeat() {
  local interval="${ZENITH_CI_HEARTBEAT_SECONDS:-30}"

  (
    while sleep "$interval"; do
      local elapsed
      elapsed="$(( $(now_epoch) - SECTION_START_EPOCH ))"
      log_ci "phase=${CURRENT_PHASE} event=heartbeat elapsed=${elapsed}s command=${CURRENT_COMMAND}"
    done
  ) &

  HEARTBEAT_PID="$!"
}

phase_start() {
  local phase="$1"
  local command="$2"

  CURRENT_PHASE="$phase"
  CURRENT_COMMAND="$command"
  SECTION_START_EPOCH="$(now_epoch)"

  log_ci "phase=${CURRENT_PHASE} event=start elapsed=0s command=${CURRENT_COMMAND}"
  start_heartbeat
}

phase_end() {
  local exit_code="$1"
  local elapsed

  elapsed="$(( $(now_epoch) - SECTION_START_EPOCH ))"
  stop_heartbeat
  log_ci "phase=${CURRENT_PHASE} event=end elapsed=${elapsed}s exit=${exit_code}"
}

run_phase() {
  local phase="$1"
  shift

  local command_string
  local exit_code

  printf -v command_string '%q ' "$@"
  command_string="${command_string% }"

  phase_start "$phase" "$command_string"
  if "$@"; then
    exit_code=0
  else
    exit_code=$?
  fi
  phase_end "$exit_code"

  return "$exit_code"
}

on_exit() {
  local exit_code="$?"
  local total_elapsed

  total_elapsed="$(( $(now_epoch) - OVERALL_START_EPOCH ))"
  stop_heartbeat
  log_ci "event=script_exit total_elapsed=${total_elapsed}s final_phase=${CURRENT_PHASE} exit=${exit_code}"
}

trap on_exit EXIT

log_ci "event=script_start cwd=${ROOT} prepare=${ZENITH_CI_PREPARE:-0}"

if [[ "${ZENITH_CI_PREPARE:-0}" == "1" ]]; then
  run_phase build bash ./scripts/build.sh
fi

run_phase test bun run --cwd apps/integration-tests test:ci
