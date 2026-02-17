#!/usr/bin/env bash
set -euo pipefail

# simplicity-violation-delete.sh
#
# Deletes clustered ranges of lines from a file based on simplicity-principle
# violation line numbers.
#
# Usage: ./scripts/simplicity-violation-delete.sh <file> <line1> <line2> ...
#
# Algorithm:
#   1. Group violations within 10 lines of each other into clusters
#   2. Per cluster: expansion = 10 + (overlaps * 5), where overlaps = size - 1
#   3. Deletion zone = first_in_cluster - expansion .. last_in_cluster + expansion
#   4. Cascade-merge any overlapping zones until stable
#   5. Print ranges, confirm, then delete

# --- Argument validation ---------------------------------------------------

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <file> <line1> <line2> ..."
  exit 1
fi

FILE="$1"
shift

if [[ ! -f "$FILE" ]]; then
  echo "Error: file not found: $FILE"
  exit 1
fi

# Trim whitespace from wc output (macOS wc pads with spaces)
TOTAL_LINES=$(wc -l < "$FILE" | tr -d ' ')

# --- Collect and sort line numbers -----------------------------------------

lines=()
for arg in "$@"; do
  if ! [[ "$arg" =~ ^[0-9]+$ ]]; then
    echo "Error: '$arg' is not a valid line number"
    exit 1
  fi
  if (( arg < 1 || arg > TOTAL_LINES )); then
    echo "Warning: line $arg is out of range (file has $TOTAL_LINES lines), skipping"
    continue
  fi
  lines+=("$arg")
done

# Sort numerically and deduplicate
IFS=$'\n' sorted=($(printf '%s\n' "${lines[@]}" | sort -nu)); unset IFS

if [[ ${#sorted[@]} -eq 0 ]]; then
  echo "No valid line numbers provided."
  exit 0
fi

# --- Step 1: Group into clusters (within 10 lines of each other) -----------

clusters=()       # array of "start:end:count" strings
cluster_start="${sorted[0]}"
cluster_end="${sorted[0]}"
cluster_count=1

for ((i = 1; i < ${#sorted[@]}; i++)); do
  line="${sorted[$i]}"
  if (( line - cluster_end <= 10 )); then
    cluster_end="$line"
    ((cluster_count++))
  else
    clusters+=("${cluster_start}:${cluster_end}:${cluster_count}")
    cluster_start="$line"
    cluster_end="$line"
    cluster_count=1
  fi
done
clusters+=("${cluster_start}:${cluster_end}:${cluster_count}")

echo "Clusters:"
for cluster in "${clusters[@]}"; do
  IFS=':' read -r c_start c_end c_count <<< "$cluster"
  overlaps=$((c_count - 1))
  expansion=$((10 + overlaps * 5))
  echo "  lines ${c_start}-${c_end} (${c_count} violations, expansion=${expansion})"
done
echo ""

# --- Step 2 & 3: Compute deletion zones ------------------------------------

# Each zone is stored as "zone_start:zone_end"
zones=()
for cluster in "${clusters[@]}"; do
  IFS=':' read -r c_start c_end c_count <<< "$cluster"
  overlaps=$((c_count - 1))
  expansion=$((10 + overlaps * 5))

  zone_start=$((c_start - expansion))
  zone_end=$((c_end + expansion))

  # Clamp to file boundaries
  (( zone_start < 1 )) && zone_start=1
  (( zone_end > TOTAL_LINES )) && zone_end="$TOTAL_LINES"

  zones+=("${zone_start}:${zone_end}")
done

# --- Step 4: Cascade-merge overlapping zones until stable -------------------

# Since bash 3.2 on macOS lacks namerefs, use a global array approach.
# Zones are already sorted by start (built from sorted input).

merge_pass() {
  # Read from zones array, write merged result to merged_zones array.
  # Returns 0 if a merge happened, 1 if nothing changed.
  merged_zones=()
  local changed=0

  if [[ ${#zones[@]} -le 1 ]]; then
    merged_zones=("${zones[@]}")
    return 1
  fi

  local cur_start cur_end
  IFS=':' read -r cur_start cur_end <<< "${zones[0]}"

  for ((i = 1; i < ${#zones[@]}; i++)); do
    local next_start next_end
    IFS=':' read -r next_start next_end <<< "${zones[$i]}"

    # Overlapping or adjacent: merge
    if (( cur_end >= next_start - 1 )); then
      (( next_end > cur_end )) && cur_end="$next_end"
      changed=1
    else
      merged_zones+=("${cur_start}:${cur_end}")
      cur_start="$next_start"
      cur_end="$next_end"
    fi
  done
  merged_zones+=("${cur_start}:${cur_end}")

  return $(( changed == 0 ))
}

# Repeat merge until stable.
while merge_pass; do
  zones=("${merged_zones[@]}")
done
zones=("${merged_zones[@]}")

# --- Step 5: Print ranges and confirm --------------------------------------

echo "File: $FILE ($TOTAL_LINES lines)"
echo ""
echo "Input violation lines: ${sorted[*]}"
echo ""
echo "Deletion ranges:"

total_deleted=0
for zone in "${zones[@]}"; do
  IFS=':' read -r z_start z_end <<< "$zone"
  count=$((z_end - z_start + 1))
  total_deleted=$((total_deleted + count))
  echo "  lines ${z_start}-${z_end}  ($count lines)"
done

remaining=$((TOTAL_LINES - total_deleted))
echo ""
echo "Total lines to delete: $total_deleted / $TOTAL_LINES ($remaining lines remaining)"
echo ""
read -rp "Proceed with deletion? (y/n) " confirm

if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

# --- Step 6: Delete lines using sed ----------------------------------------

# Build a sed expression that deletes all the ranges.
sed_expr=""
for zone in "${zones[@]}"; do
  IFS=':' read -r z_start z_end <<< "$zone"
  if [[ -n "$sed_expr" ]]; then
    sed_expr="${sed_expr};"
  fi
  sed_expr="${sed_expr}${z_start},${z_end}d"
done

# macOS sed requires '' after -i; GNU sed does not. Detect platform.
if sed --version 2>/dev/null | grep -q 'GNU'; then
  sed -i "${sed_expr}" "$FILE"
else
  # macOS / BSD sed
  sed -i '' "${sed_expr}" "$FILE"
fi

new_total=$(wc -l < "$FILE" | tr -d ' ')
echo "Done. $FILE now has $new_total lines (deleted $total_deleted)."
