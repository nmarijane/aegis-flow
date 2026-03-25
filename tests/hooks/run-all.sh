#!/bin/bash
DIR="$(dirname "$0")"
TOTAL_PASS=0; TOTAL_FAIL=0

for test_file in "$DIR"/test-*.sh; do
  echo "--- $(basename "$test_file") ---"
  bash "$test_file"
  if [ $? -ne 0 ]; then ((TOTAL_FAIL++)); else ((TOTAL_PASS++)); fi
  echo ""
done

echo "=== Hook test suites: $TOTAL_PASS passed, $TOTAL_FAIL failed ==="
[ $TOTAL_FAIL -eq 0 ] || exit 1
