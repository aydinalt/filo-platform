#!/usr/bin/env bash

set -u

sql_file="${1:?SQL file path is required}"
log_file="$(mktemp)"
trap 'rm -f "${log_file}"' EXIT

set +e
psql --set ON_ERROR_STOP=1 --file "${sql_file}" 2>&1 | tee "${log_file}"
psql_status="${PIPESTATUS[0]}"
set -e

if [[ "${psql_status}" -ne 0 ]]; then
  error_detail="$(tail -n 20 "${log_file}")"
  error_detail="${error_detail//'%'/'%25'}"
  error_detail="${error_detail//$'\r'/'%0D'}"
  error_detail="${error_detail//$'\n'/'%0A'}"

  echo "::error file=${sql_file}::psql failed with exit code ${psql_status}%0A${error_detail}"
  exit "${psql_status}"
fi
