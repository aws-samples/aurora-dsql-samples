#!/usr/bin/env bash
# scripts/cleanup_demo.sh: remove this walkthrough's Aurora DSQL cluster and its local demo wiring.
#
# Usage:
#   bash scripts/cleanup_demo.sh           check everything, show the plan, ask once for the cluster ID, clean up
#   bash scripts/cleanup_demo.sh --check   check everything and show the plan; changes no resource
#
# Changes, made only after every check passes and you type the exact cluster ID:
#   1. stop this workspace's FastAPI app (uvicorn on 127.0.0.1:8000 started from this workspace)
#   2. remove the "mc-dev-dsql-readonly" entry from THIS workspace's .kiro/settings/mcp.json
#   3. disable deletion protection on the recorded cluster and wait for it to settle
#   4. delete that exact cluster and wait until it no longer exists
# Never touched: IAM, S3, the AWS profile, ~/.kiro (Aurora DSQL Power), .venv, tools, the application,
# specs, data and evidence. Safe to rerun: finished steps are detected and skipped.
#
# Exit codes: 0 done or check passed | 2 local records missing or invalid | 3 credentials expired or
# unavailable | 4 stopped on a mismatch or failed step | 5 not confirmed | 6 still in progress, rerun later
set -euo pipefail
umask 077
export AWS_PAGER=""

MODE="run"
case "${1:-}" in
  "") ;;
  --check) MODE="check" ;;
  -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
  *) echo "Unknown option: $1 (use --check, --help, or no option)" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PRIV="$ROOT/.private"
WS_MCP="$ROOT/.kiro/settings/mcp.json"
USER_MCP="$HOME/.kiro/settings/mcp.json"
REPORT="$ROOT/evidence/70-prompt-7-cleanup/cleanup-report.md"
APP_PORT=8000
APP_CMD="uvicorn mcapp.web:app --host 127.0.0.1 --port $APP_PORT"
MCP_NAME="mc-dev-dsql-readonly"
MCP_PKG="awslabs.aurora-dsql-mcp-server@1.1.4"
MCP_PROC="aurora-dsql-mcp-server"
WAIT_ROUNDS=15      # AWS CLI dsql waiters poll for up to 120 s per round (2 s x 60): 30 minutes total
POLL_SECONDS=10
POLL_LIMIT=90       # settle polling: 15 minutes
RETAINED="mcapp .kiro/specs db tests scripts data evidence logs run-log.md .venv tools"

records_fail() { echo "STOP: $1. Nothing was changed." >&2; exit 2; }

PY="$ROOT/.venv/bin/python"
[ -x "$PY" ] || PY="$(command -v python3 || true)"
[ -n "$PY" ] || records_fail "python3 is required"
command -v aws >/dev/null 2>&1 || records_fail "the AWS CLI v2 is required"
for tool in lsof ps curl; do command -v "$tool" >/dev/null 2>&1 || records_fail "$tool is required"; done

# ---- private records for this run (never printed to the report) -----------------------------
[ -d "$PRIV" ] || records_fail ".private/ was not found in $ROOT"
CLUSTER_ID="$(tr -d '[:space:]' 2>/dev/null < "$PRIV/cluster-id" || true)"
REGION="$(tr -d '[:space:]' 2>/dev/null < "$PRIV/region" || true)"
FINGERPRINT="$(tr -d '[:space:]' 2>/dev/null < "$PRIV/identity-fingerprint" || true)"
PROFILE="$("$PY" -c 'import json,sys; print(json.load(open(sys.argv[1]))["aws_profile"])' "$PRIV/runtime.json" 2>/dev/null || true)"
[[ "$CLUSTER_ID" =~ ^[a-z0-9]{26}$ ]] || records_fail ".private/cluster-id is missing or malformed"
[[ "$REGION" =~ ^[a-z]{2}(-[a-z]+)+-[0-9]$ ]] || records_fail ".private/region is missing or malformed"
[[ "$FINGERPRINT" =~ ^[0-9a-f]{64}$ ]] || records_fail ".private/identity-fingerprint is missing or malformed"
[[ "$PROFILE" =~ ^[A-Za-z0-9._-]{1,64}$ ]] || records_fail ".private/runtime.json has no valid aws_profile"
TOKEN="mc-demo-cleanup-$("$PY" -c 'import hashlib,sys; print(hashlib.sha256(sys.argv[1].encode()).hexdigest()[:16])' "$CLUSTER_ID")"

TMPD="$(mktemp -d "$PRIV/cleanup.XXXXXX")"
NOTES="$TMPD/notes"
: > "$NOTES"
STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
OUTCOME="stopped unexpectedly"
ACCOUNT="-"
PROT_OFF=0          # 1 while deletion protection is (or may be) off and deletion isn't confirmed accepted

redact() {
  "$PY" -c '
import re, sys
cid, prof, home = sys.argv[1:4]
t = sys.stdin.read()
t = re.sub(r"arn:aws[^\s\"\x27,)]*", "<ARN>", t)
t = re.sub(r"[a-z0-9]{26}\.dsql[\w.-]*", "<CLUSTER_ENDPOINT>", t)
t = t.replace(cid, "<CLUSTER_ID>")
t = re.sub(r"(?<![\d.])\d{12}(?![\d.])", "<ACCOUNT_ID>", t)
t = t.replace(prof, "<DEMO_PROFILE>").replace(home, "~")
sys.stdout.write(t)' "$CLUSTER_ID" "$PROFILE" "$HOME"
}

say() { printf '%s\n' "$*" | redact | tee -a "$NOTES"; }

warn_protection() {
  local msg="WARNING: deletion protection may be OFF on cluster $CLUSTER_ID in $REGION, and its deletion was not confirmed."
  {
    echo
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    echo "$msg"
    echo "Finish the cleanup by running:  bash scripts/cleanup_demo.sh"
    echo "Or keep the cluster and restore protection:"
    echo "  aws dsql update-cluster --identifier $CLUSTER_ID --deletion-protection-enabled --region $REGION --profile $PROFILE"
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    echo
  } >&2
  printf '%s\n' "$msg" | redact >> "$NOTES"
}

finish() {
  local rc=$?
  set +e
  [ "$PROT_OFF" = 1 ] && warn_protection
  mkdir -p "$(dirname "$REPORT")"
  if [ ! -f "$REPORT" ]; then
    printf '%s\n' "# Cleanup report: material-control walkthrough" "" \
      "Written by \`scripts/cleanup_demo.sh\`. Identifiers are redacted. Each run appends one section." > "$REPORT"
  fi
  { printf '\n## Run %s (%s mode), exit %s\n\nOutcome: %s\n\n' "$STARTED" "$MODE" "$rc" "$OUTCOME"
    sed 's/^/- /' "$NOTES"; } | redact >> "$REPORT"
  rm -f -- "$TMPD/out" "$TMPD/err" "$TMPD/notes" "$TMPD/before.json" "$TMPD/after.json"
  rmdir -- "$TMPD"
  [ "$rc" -eq 0 ] || echo "Report: evidence/70-prompt-7-cleanup/cleanup-report.md" >&2
}
trap finish EXIT

stop() { OUTCOME="STOPPED: $2"; say "STOP: $2"; exit "$1"; }

# Every AWS call names the recorded Region and profile explicitly. Callers use: rc=0; awsj ... || rc=$?
awsj() { aws "$@" --region "$REGION" --profile "$PROFILE" --output json >"$TMPD/out" 2>"$TMPD/err"; }
aws_err() { head -c 300 "$TMPD/err" | tr '\n' ' '; }
cred_error() {
  grep -qE 'ExpiredToken|RequestExpired|InvalidClientTokenId|UnrecognizedClientException|Unable to locate credentials|Token has expired|SSO session|Error when retrieving token|Error loading SSO Token|security token included in the request is (expired|invalid)' "$TMPD/err"
}
creds_help() {
  OUTCOME="credentials expired or unavailable"
  say "AWS credentials for the recorded profile are expired or unavailable."
  cat >&2 <<EOF

  Refresh the credentials for profile "$PROFILE" the way you normally do, for example:
      aws sso login --profile $PROFILE
  Confirm they work:
      aws sts get-caller-identity --profile $PROFILE
  Then run again:
      bash scripts/cleanup_demo.sh
  Steps that already finished are detected and skipped.

EOF
  exit 3
}

CLUSTER_CHECK='
import json, re, sys
src, snap, cid, region, account = sys.argv[1:6]
d = json.load(open(src))
problems = []
if d.get("identifier") != cid:
    problems.append("identifier differs")
if not re.fullmatch(r"arn:aws:dsql:%s:%s:cluster/%s" % (re.escape(region), account, cid), d.get("arn", "")):
    problems.append("ARN Region, account or identifier differs from the records")
mrp = d.get("multiRegionProperties") or {}
if mrp.get("witnessRegion") or mrp.get("clusters"):
    problems.append("cluster is not single-Region")
tags = d.get("tags")
if not isinstance(tags, dict):
    problems.append("tags were not returned")
    tags = {}
for key, value in (("Purpose", "material-control-demo"), ("DataClassification", "synthetic"),
                   ("Environment", "development")):
    if tags.get(key) != value:
        problems.append("tag %s is not %s" % (key, value))
status = d.get("status", "")
if status not in ("ACTIVE", "IDLE", "INACTIVE", "UPDATING", "DELETING"):
    problems.append("status %s is not handled by this script" % status)
if problems:
    print("MISMATCH: " + "; ".join(problems))
    sys.exit(0)
keep = {k: d.get(k) for k in ("identifier", "arn", "encryptionDetails", "tags", "multiRegionProperties")}
json.dump(keep, open(snap, "w"), sort_keys=True)
enc = d.get("encryptionDetails") or {}
print(status, "true" if d.get("deletionProtectionEnabled") else "false",
      "%s/%s" % (enc.get("encryptionType", "-"), enc.get("encryptionStatus", "-")), d.get("endpoint") or "-")
'

# Sets CL_STATE=absent, or CL_STATE=present with CL_STATUS, CL_PROTECTION, CL_ENC, CL_ENDPOINT.
read_cluster() {
  local rc=0 line
  awsj dsql get-cluster --identifier "$CLUSTER_ID" || rc=$?
  if [ "$rc" -ne 0 ]; then
    if grep -q ResourceNotFoundException "$TMPD/err"; then CL_STATE=absent; return 0; fi
    if cred_error; then creds_help; fi
    stop 4 "get-cluster failed (exit $rc): $(aws_err)"
  fi
  line="$("$PY" -c "$CLUSTER_CHECK" "$TMPD/out" "$1" "$CLUSTER_ID" "$REGION" "$ACCOUNT")"
  case "$line" in MISMATCH*) stop 4 "cluster $line" ;; esac
  CL_STATE=present
  read -r CL_STATUS CL_PROTECTION CL_ENC CL_ENDPOINT <<< "$line"
}

INSPECT='
import json, sys
d = json.load(open(sys.argv[1]))
print(d.get("status") or "-", "true" if d.get("deletionProtectionEnabled") else "false")
'
# Never exits. Sets INS_STATE=absent|present|unknown, with INS_STATUS and INS_PROTECTION when present.
inspect_cluster() {
  local rc=0
  INS_STATE=unknown; INS_STATUS="-"; INS_PROTECTION="-"
  awsj dsql get-cluster --identifier "$CLUSTER_ID" || rc=$?
  if [ "$rc" -ne 0 ]; then
    if grep -q ResourceNotFoundException "$TMPD/err"; then INS_STATE=absent; fi
    return 0
  fi
  read -r INS_STATUS INS_PROTECTION <<< "$("$PY" -c "$INSPECT" "$TMPD/out" 2>/dev/null || echo "- -")"
  if [ "$INS_STATUS" != "-" ]; then INS_STATE=present; fi
  return 0
}

port_listeners() { lsof -nP -iTCP:"$APP_PORT" -sTCP:LISTEN -t 2>/dev/null | sort -u || true; }

# True while the process runs. A zombie (exited, not yet reaped by its parent) counts as exited.
proc_alive() {
  local stat
  kill -0 "$1" 2>/dev/null || return 1
  stat="$(ps -o stat= -p "$1" 2>/dev/null | tr -d ' ' || true)"
  case "$stat" in ""|Z*) return 1 ;; esac
  return 0
}

# Sets APP_STATE=absent, or APP_STATE=present with APP_PID. Stops if port 8000 belongs to anything else.
find_app() {
  local pids count pid cmd cwd uid addr
  APP_STATE=absent; APP_PID=""
  pids="$(port_listeners)"
  [ -n "$pids" ] || return 0
  count="$(printf '%s\n' "$pids" | wc -l | tr -d ' ')"
  [ "$count" = 1 ] || stop 4 "$count processes listen on port $APP_PORT; expected at most this workspace's app"
  pid="$pids"
  cmd="$(ps -ww -o command= -p "$pid" 2>/dev/null || true)"
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1 || true)"
  uid="$(ps -o uid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
  addr="$(lsof -a -p "$pid" -nP -iTCP:"$APP_PORT" -sTCP:LISTEN -Fn 2>/dev/null | sed -n 's/^n//p' | sort -u | tr '\n' ' ' || true)"
  case "$cmd" in
    *"$APP_CMD"*) ;;
    *) stop 4 "port $APP_PORT belongs to pid $pid, whose command is not this app's; not touching it" ;;
  esac
  [ "$cwd" = "$ROOT" ] || stop 4 "pid $pid runs the app from another directory; not touching it"
  [ "$uid" = "$(id -u)" ] || stop 4 "pid $pid belongs to another user; not touching it"
  [ "$addr" = "127.0.0.1:$APP_PORT " ] || stop 4 "pid $pid listens on '$addr', expected 127.0.0.1:$APP_PORT only"
  APP_STATE=present; APP_PID="$pid"
}

MCP_TOOL='
import json, os, sys, tempfile
ws, user, name, pkg, cid, region, endpoint, mode, backup = sys.argv[1:10]
if os.path.exists(ws) and os.path.exists(user) and os.path.samefile(ws, user):
    print("MISMATCH: the workspace MCP file is the user-level file"); sys.exit(0)
if not os.path.exists(ws):
    print("absent (no workspace MCP file)"); sys.exit(0)
raw = open(ws, encoding="utf-8").read()
try:
    cfg = json.loads(raw)
except ValueError:
    print("MISMATCH: the workspace mcp.json is not valid JSON"); sys.exit(0)
servers = cfg.get("mcpServers")
if not isinstance(servers, dict) or name not in servers:
    print("absent (no %s entry)" % name); sys.exit(0)
args = servers[name].get("args") or []
def arg(flag):
    i = args.index(flag) if flag in args else -1
    return args[i + 1] if 0 <= i < len(args) - 1 else ""
problems = []
if pkg not in args:
    problems.append("entry does not run %s" % pkg)
ep = arg("--cluster_endpoint")
if (endpoint != "-" and ep != endpoint) or (endpoint == "-" and not ep.startswith(cid + ".")):
    problems.append("entry endpoint is not the recorded cluster")
if arg("--region") != region:
    problems.append("entry Region differs")
if problems:
    print("MISMATCH: " + "; ".join(problems)); sys.exit(0)
if mode == "check":
    print("present"); sys.exit(0)
if not os.path.exists(backup):
    with open(backup, "x", encoding="utf-8") as f:
        f.write(raw)
others = {k: v for k, v in servers.items() if k != name}
cfg["mcpServers"] = others
mode_bits = os.stat(ws).st_mode & 0o777
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(ws), prefix=".mcp.json.")
with os.fdopen(fd, "w", encoding="utf-8") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
os.chmod(tmp, mode_bits)
os.replace(tmp, ws)
after = json.load(open(ws, encoding="utf-8")).get("mcpServers", {})
print("removed" if name not in after and after == others else "MISMATCH: verification after removal failed")
'
mcp_tool() {  # $1 = check|remove
  "$PY" -c "$MCP_TOOL" "$WS_MCP" "$USER_MCP" "$MCP_NAME" "$MCP_PKG" "$CLUSTER_ID" "$REGION" \
    "${CL_ENDPOINT:--}" "$1" "$PRIV/mcp.json.before-cleanup"
}
mcp_pids() {
  ps -axww -o pid=,command= | grep -F -- "$MCP_PROC" | grep -F -- "--cluster_endpoint $CLUSTER_ID." \
    | grep -vF -- "grep" | awk '{print $1}' | tr '\n' ' ' || true
}
file_hash() {
  if [ -f "$1" ]; then
    "$PY" -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$1"
  else
    echo absent
  fi
}

wait_active() {
  local n=0 rc
  while [ "$n" -lt "$WAIT_ROUNDS" ]; do
    rc=0; awsj dsql wait cluster-active --identifier "$CLUSTER_ID" || rc=$?
    [ "$rc" -eq 0 ] && return 0
    if ! grep -q "Max attempts exceeded" "$TMPD/err"; then
      if cred_error; then creds_help; fi
      stop 4 "wait cluster-active failed (exit $rc): $(aws_err)"
    fi
    n=$((n + 1)); say "  still waiting for ACTIVE ($((n * 2)) min)"
  done
  stop 6 "cluster did not return to ACTIVE within 30 minutes; rerun later"
}

# Waits until the cluster is no longer UPDATING; with $1=unprotected also requires protection off.
wait_settled() {
  local n=0
  while [ "$n" -lt "$POLL_LIMIT" ]; do
    read_cluster "$TMPD/after.json"
    [ "$CL_STATE" = absent ] && return 0
    if [ "$CL_STATUS" != UPDATING ] && { [ "${1:-}" != unprotected ] || [ "$CL_PROTECTION" = false ]; }; then
      return 0
    fi
    n=$((n + 1)); sleep "$POLL_SECONDS"
  done
  stop 6 "cluster is still updating after 15 minutes; rerun later"
}

wait_gone() {
  local n=0 rc
  while [ "$n" -lt "$WAIT_ROUNDS" ]; do
    rc=0; awsj dsql wait cluster-not-exists --identifier "$CLUSTER_ID" || rc=$?
    [ "$rc" -eq 0 ] && return 0
    if ! grep -q "Max attempts exceeded" "$TMPD/err"; then
      if cred_error; then creds_help; fi
      stop 4 "wait cluster-not-exists failed (exit $rc): $(aws_err)"
    fi
    n=$((n + 1)); say "  still deleting ($((n * 2)) min)"
  done
  stop 6 "deletion is still in progress after 30 minutes; rerun later (safe)"
}

# Re-enable deletion protection on the exact cluster and poll until it is verified.
# Sets RESTORE_RESULT=restored, or absent if the cluster turned out to be gone.
restore_protection() {
  local rc=0 n=0
  if [ "$INS_PROTECTION" != true ]; then
    say "Cluster: aws dsql update-cluster --identifier $CLUSTER_ID --deletion-protection-enabled --region $REGION --profile $PROFILE"
    awsj dsql update-cluster --identifier "$CLUSTER_ID" --deletion-protection-enabled || rc=$?
    if [ "$rc" -ne 0 ]; then
      if cred_error; then creds_help; fi
      stop 4 "re-enabling deletion protection failed (exit $rc): $(aws_err)"
    fi
  fi
  while [ "$n" -lt "$POLL_LIMIT" ]; do
    inspect_cluster
    if [ "$INS_STATE" = absent ]; then RESTORE_RESULT=absent; PROT_OFF=0; return 0; fi
    if [ "$INS_STATE" = present ] && [ "$INS_STATUS" != UPDATING ] && [ "$INS_PROTECTION" = true ]; then
      RESTORE_RESULT=restored; PROT_OFF=0
      say "Cluster: deletion protection restored and verified (status $INS_STATUS, deletion protection true)"
      return 0
    fi
    n=$((n + 1)); sleep "$POLL_SECONDS"
  done
  stop 6 "could not verify within 15 minutes that deletion protection was restored"
}

# delete-cluster returned an error after deletion protection was disabled: inspect before exiting.
delete_failed() {
  local why
  why="$(aws_err)"
  say "Cluster: delete-cluster failed (exit $1): $why"
  if cred_error; then creds_help; fi
  say "Cluster: inspecting the exact cluster before exiting"
  inspect_cluster
  case "$INS_STATE" in
    absent)
      PROT_OFF=0
      say "Cluster: absent after the failed call; continuing with deletion verification" ;;
    present)
      if [ "$INS_STATUS" = DELETING ]; then
        PROT_OFF=0
        say "Cluster: DELETING, so deletion was accepted; continuing with deletion verification"
        return 0
      fi
      say "Cluster: still $INS_STATUS (deletion protection $INS_PROTECTION); deletion was not accepted"
      restore_protection
      if [ "$RESTORE_RESULT" = absent ]; then
        say "Cluster: absent while restoring protection; continuing with deletion verification"
        return 0
      fi
      stop 4 "delete-cluster failed ($why). Deletion protection was re-enabled and verified; the cluster was not deleted. Fix the cause, then rerun" ;;
    *)
      stop 4 "delete-cluster failed and the cluster's state could not be determined ($(aws_err))" ;;
  esac
}

# ================================ 1-3. checks (no changes) ======================================
say "Workspace: $ROOT"
say "Records: cluster ID, Region $REGION, profile and identity fingerprint read from .private/"
USER_MCP_HASH_BEFORE="$(file_hash "$USER_MCP")"

rc=0; awsj sts get-caller-identity || rc=$?
if [ "$rc" -ne 0 ]; then
  grep -q "could not be found" "$TMPD/err" && stop 2 "the recorded AWS profile does not exist on this machine"
  if cred_error; then creds_help; fi
  stop 4 "sts get-caller-identity failed (exit $rc): $(aws_err)"
fi
read -r ACCOUNT ROLE <<< "$("$PY" -c '
import json, re, sys
m = re.fullmatch(r"arn:aws:sts::(\d{12}):assumed-role/([^/]+)/.+", json.load(open(sys.argv[1])).get("Arn", ""))
print(*(m.groups() if m else ("-", "-")))' "$TMPD/out")"
[ "$ACCOUNT" != "-" ] || stop 4 "the caller is not an assumed role, unlike the recorded identity"
SEEN="$("$PY" -c 'import hashlib,sys; print(hashlib.sha256(sys.argv[1].encode()).hexdigest())' "$ACCOUNT|$ROLE")"
[ "$SEEN" = "$FINGERPRINT" ] || stop 4 "AWS identity does not match the recorded identity fingerprint"
say "Identity: credentials valid; account and role match the recorded fingerprint"

CL_ENDPOINT=""
read_cluster "$TMPD/before.json"
if [ "$CL_STATE" = absent ]; then
  say "Cluster: get-cluster returns ResourceNotFoundException; AWS cleanup is already complete"
  CL_ENDPOINT=""
else
  say "Cluster: $CL_STATUS, deletion protection $CL_PROTECTION, encryption $CL_ENC, Region $REGION," \
      "single-Region, tags Purpose=material-control-demo DataClassification=synthetic Environment=development"
fi

find_app
if [ "$APP_STATE" = present ]; then say "App: pid $APP_PID ($APP_CMD), cwd is this workspace"
else say "App: not running"; fi

MCP_STATE_LINE="$(mcp_tool check)"
case "$MCP_STATE_LINE" in MISMATCH*) stop 4 "workspace MCP $MCP_STATE_LINE" ;; esac
say "Workspace MCP entry $MCP_NAME: $MCP_STATE_LINE"
PIDS="$(mcp_pids)"
say "Workspace MCP server process: ${PIDS:-none}"

PENDING=""
[ "$APP_STATE" = present ] && PENDING="$PENDING stop-app"
[ "$MCP_STATE_LINE" = present ] && PENDING="$PENDING remove-mcp-entry"
[ "$CL_STATE" = present ] && PENDING="$PENDING delete-cluster"
say "Pending changes:${PENDING:- none}"

if [ "$MODE" = check ]; then
  OUTCOME="check passed; no resource changed"
  say "Check mode: no resource was changed."
  exit 0
fi

# ================================ confirmation (once) ===========================================
if [ -n "$PENDING" ]; then
  {
    echo
    echo "About to make these changes:"
    [ "$APP_STATE" = present ] && echo "  - stop pid $APP_PID ($APP_CMD)"
    [ "$MCP_STATE_LINE" = present ] && echo "  - remove \"$MCP_NAME\" from $WS_MCP"
    if [ "$CL_STATE" = present ]; then
      echo "  - disable deletion protection on, then DELETE, Aurora DSQL cluster $CLUSTER_ID in $REGION"
      echo "    (all its data, database roles and IAM mappings are removed; this cannot be undone)"
    fi
    printf '\nType the cluster ID to confirm (anything else cancels): '
  } >&2
  TYPED=""
  IFS= read -r TYPED || true
  TYPED="$(printf '%s' "$TYPED" | tr -d '[:space:]')"
  if [ "$TYPED" != "$CLUSTER_ID" ]; then
    OUTCOME="not confirmed; nothing changed"
    say "Not confirmed. Nothing was changed."
    exit 5
  fi
  say "Confirmed by typing the exact cluster ID"
fi

# ================================ 4. stop the app ===============================================
if [ "$APP_STATE" = present ]; then
  find_app   # re-verify immediately before signalling
  if [ "$APP_STATE" = present ]; then
    say "App: kill -TERM $APP_PID"
    kill -TERM "$APP_PID"
    n=0   # wait up to 15 s for the process to exit AND port 8000 to close; never force-kill
    while [ "$n" -lt 30 ]; do
      if ! proc_alive "$APP_PID" && [ -z "$(port_listeners)" ]; then break; fi
      sleep 0.5; n=$((n + 1))
    done
    if proc_alive "$APP_PID"; then
      stop 4 "pid $APP_PID did not exit within 15 s of SIGTERM. It was not force-killed; stop it yourself, then rerun"
    fi
    [ -z "$(port_listeners)" ] || stop 4 "port $APP_PORT is still open 15 s after the app exited"
    say "App: pid $APP_PID exited and port $APP_PORT closed after SIGTERM"
  fi
fi
find_app
[ "$APP_STATE" = absent ] || stop 4 "the app is still listening on 127.0.0.1:$APP_PORT"
rc=0; curl -sS -m 5 -o /dev/null "http://127.0.0.1:$APP_PORT/" 2>/dev/null || rc=$?
[ "$rc" -eq 7 ] || stop 4 "a request to 127.0.0.1:$APP_PORT did not fail to connect (curl exit $rc)"
say "App: nothing listens on 127.0.0.1:$APP_PORT; request fails to connect (curl exit 7)"

# ================================ 5. workspace MCP entry ========================================
if [ "$MCP_STATE_LINE" = present ]; then
  line="$(mcp_tool remove)"
  case "$line" in MISMATCH*) stop 4 "workspace MCP $line" ;; esac
  say "Workspace MCP: removed $MCP_NAME (original kept in .private/mcp.json.before-cleanup)"
  n=0
  while [ -n "$(mcp_pids)" ] && [ "$n" -lt 12 ]; do sleep 5; n=$((n + 1)); done
fi
line="$(mcp_tool check)"
case "$line" in absent*) say "Workspace MCP entry: $line" ;; *) stop 4 "workspace MCP entry still present: $line" ;; esac

# ================================ 6-9. cluster ==================================================
if [ "$CL_STATE" = present ]; then
  read_cluster "$TMPD/before.json"
fi
if [ "$CL_STATE" = present ] && [ "$CL_STATUS" = UPDATING ]; then
  say "Cluster: UPDATING; waiting for it to settle"
  wait_settled
  [ "$CL_STATE" = absent ] || cp -- "$TMPD/after.json" "$TMPD/before.json"
fi
if [ "$CL_STATE" = present ] && [ "$CL_STATUS" != DELETING ]; then
  if [ "$CL_PROTECTION" = true ]; then
    PRE_STATUS="$CL_STATUS"
    say "Cluster: aws dsql update-cluster --identifier $CLUSTER_ID --no-deletion-protection-enabled --region $REGION --profile $PROFILE"
    rc=0; awsj dsql update-cluster --identifier "$CLUSTER_ID" --no-deletion-protection-enabled || rc=$?
    if [ "$rc" -ne 0 ]; then
      if cred_error; then creds_help; fi
      stop 4 "update-cluster failed (exit $rc): $(aws_err)"
    fi
    PROT_OFF=1
    if [ "$PRE_STATUS" = ACTIVE ]; then
      say "Cluster: aws dsql wait cluster-active"
      wait_active
    fi
    wait_settled unprotected
    [ "$CL_STATE" = present ] || stop 4 "cluster disappeared while disabling deletion protection"
    if [ "$PRE_STATUS" = ACTIVE ] && [ "$CL_STATUS" != ACTIVE ]; then stop 4 "cluster settled in $CL_STATUS, not ACTIVE"; fi
    cmp -s "$TMPD/before.json" "$TMPD/after.json" \
      || stop 4 "a property other than deletion protection changed (identifier, ARN, encryption, tags or Region setup)"
    say "Cluster: $CL_STATUS; deletion protection false; identifier, Region, encryption, tags and single-Region setup unchanged"
  else
    PROT_OFF=1
    say "Cluster: deletion protection already disabled (by an earlier run)"
  fi
  say "Cluster: aws dsql delete-cluster --identifier $CLUSTER_ID --client-token $TOKEN --region $REGION --profile $PROFILE"
  rc=0; awsj dsql delete-cluster --identifier "$CLUSTER_ID" --client-token "$TOKEN" || rc=$?
  if [ "$rc" -eq 0 ]; then
    PROT_OFF=0
    say "Cluster: deletion accepted"
  elif grep -q ResourceNotFoundException "$TMPD/err"; then
    PROT_OFF=0
    say "Cluster: already gone when delete-cluster ran"
  else
    delete_failed "$rc"
  fi
fi
if [ "$CL_STATE" = present ]; then
  say "Cluster: aws dsql wait cluster-not-exists"
  wait_gone
fi

# ================================ 10. verification ==============================================
rc=0; awsj dsql get-cluster --identifier "$CLUSTER_ID" || rc=$?
if [ "$rc" -ne 0 ] && grep -q ResourceNotFoundException "$TMPD/err"; then
  say "Verify: get-cluster returns ResourceNotFoundException: PASS"
else
  if [ "$rc" -ne 0 ] && cred_error; then creds_help; fi
  stop 4 "get-cluster did not return ResourceNotFoundException (exit $rc)"
fi
rc=0; awsj dsql list-clusters --query "length(clusters[?identifier=='$CLUSTER_ID'])" || rc=$?
if [ "$rc" -ne 0 ]; then
  if cred_error; then creds_help; fi
  stop 4 "list-clusters failed (exit $rc): $(aws_err)"
fi
[ "$(tr -d '[:space:]' < "$TMPD/out")" = 0 ] || stop 4 "list-clusters still contains the cluster"
say "Verify: list-clusters in $REGION no longer contains the cluster: PASS"

PIDS="$(mcp_pids)"
if [ -n "$PIDS" ]; then
  say "Note: a workspace MCP server process is still running (pid $PIDS). Kiro started it; reload or" \
      "reconnect MCP servers in Kiro to end it. It points at the deleted cluster and can't connect."
else
  say "Verify: no workspace MCP server process for this cluster: PASS"
fi
[ "$(file_hash "$USER_MCP")" = "$USER_MCP_HASH_BEFORE" ] || stop 4 "the user-level Kiro MCP configuration changed during the run"
say "Verify: user-level Kiro MCP configuration (Aurora DSQL Power) unchanged: PASS"
for p in $RETAINED; do
  if [ -e "$ROOT/$p" ]; then say "Retained: $p"; else say "Retained: $p (not present)"; fi
done
say "Not touched: IAM roles and policies, S3, the AWS profile, the Aurora DSQL Power"

OUTCOME="complete"
say "Cleanup complete."
