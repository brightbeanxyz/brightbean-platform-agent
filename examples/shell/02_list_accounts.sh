#!/usr/bin/env bash
# The channels this key may use, with what each one can take.
#   bash 02_list_accounts.sh
source "$(dirname "$0")/_common.sh"
if command -v jq >/dev/null; then
  bb GET /accounts/ | jq -r '.data[] | "\(.id)  \(.platform)  @\(.handle)  max \(.capabilities.charLimit) chars  needsReconnect=\(.needsReconnect)  mediaRequired=\(.capabilities.mediaRequired)  firstComment=\(.capabilities.firstComment)"'
else
  bb GET /accounts/
fi
