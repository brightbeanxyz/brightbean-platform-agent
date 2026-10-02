#!/usr/bin/env bash
# Who is this key? Workspace, effective permissions and channels.
#   bash 01_whoami.sh
source "$(dirname "$0")/_common.sh"
bb GET /me/
