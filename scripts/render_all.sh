#!/usr/bin/env bash
# Render every PDF in weekN_sourcebricks/ to PNG pages under data/pages/weekN/<id>/p-NN.png.
# Skips bricks already rendered. Parallelized at 6 jobs.
set -u

render_one() {
  local pdf="$1"
  local week
  week=$(printf '%s' "$pdf" | grep -oE '^week[0-9]')
  local id
  id=$(basename "$pdf" .pdf)
  local out="data/pages/${week}/${id}"
  if [ -f "${out}/p-01.png" ]; then
    echo "skip ${week}/${id}"
    return 0
  fi
  mkdir -p "$out"
  if pdftoppm -png -r 110 "$pdf" "${out}/p" 2>/dev/null; then
    echo "done ${week}/${id}"
  else
    echo "FAIL ${week}/${id}"
    return 1
  fi
}

export -f render_one

ls week*_sourcebricks/*.pdf | xargs -I{} -P 6 bash -c 'render_one "$@"' _ {}
echo "all done"
