#!/usr/bin/env bash
# MULIA owner hardening helper. Run with sudo on the server.
#
#   sudo ./owner-hardening.sh check            read-only report (default, changes nothing)
#   sudo ./owner-hardening.sh apply-caddy      Cloudflare-only block for mulia.pattanasak.com (backup + validate + auto-rollback)
#   sudo ./owner-hardening.sh rollback-caddy   restore the newest Caddyfile backup made by this script
#
# SSH, firewall and port 19222 are NEVER changed by this script (a wrong change can lock you out).
# `check` prints suggested commands for them; run those yourself, with a second SSH session open.
set -euo pipefail

CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
DOMAIN="${DOMAIN:-mulia.pattanasak.com}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SNIPPET_SRC="${SNIPPET_SRC:-$SCRIPT_DIR/../caddy/mulia.caddy}"
RELOAD_CMD="${RELOAD_CMD:-systemctl reload caddy}"   # tests may override
MARK="@not_cloudflare"

say()  { printf '\n== %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
need_root() { [ "$(id -u)" -eq 0 ] || die "run with sudo"; }

has_block() { grep -q "$MARK" "$CADDYFILE" 2>/dev/null; }

check() {
  say "SSH effective values (sshd -T)"
  if command -v sshd >/dev/null && [ "$(id -u)" -eq 0 ]; then
    sshd -T 2>/dev/null | grep -Ei '^(permitrootlogin|passwordauthentication|pubkeyauthentication|port) ' || warn "sshd -T gave no output"
  else
    warn "need root + sshd to read effective values"
  fi

  say "Firewall (ufw status verbose)"
  if command -v ufw >/dev/null; then ufw status verbose || true; else echo "ufw not installed"; fi

  say "Listeners on 22 / 80 / 443 / 19222"
  ss -tlnp 2>/dev/null | awk 'NR==1 || $4 ~ /:(22|80|443|19222)$/' || true

  say "fail2ban"
  if command -v fail2ban-client >/dev/null; then
    systemctl is-active fail2ban || true
    fail2ban-client status 2>/dev/null || true
  else
    echo "fail2ban not installed"
  fi

  say "Caddy: Cloudflare-only block in $CADDYFILE"
  if has_block; then echo "PRESENT ($MARK found)"; else echo "NOT PRESENT (run: sudo $0 apply-caddy)"; fi

  say "Suggested commands (NOT run by this script)"
  cat <<'TXT'
SSH  : keep a second SSH session open, then edit /etc/ssh/sshd_config.d/99-hardening.conf with
         PermitRootLogin no
         PasswordAuthentication no
       (only after confirming key login works for a non-root sudo user)
       sudo sshd -t && sudo systemctl reload ssh
Port 19222: owned by codync-host. If it should not be public, bind it to localhost/Tailscale in its own
       config, or block it:  sudo ufw deny 19222/tcp
Firewall (strict origin lock, covers :80 too): allow only Cloudflare ranges on 80/443, e.g.
       for ip in $(curl -s https://www.cloudflare.com/ips-v4 https://www.cloudflare.com/ips-v6); do
         sudo ufw allow from "$ip" to any port 80,443 proto tcp; done
       Do this BEFORE `ufw enable`, and always `sudo ufw allow 22/tcp` first so you keep SSH.
TXT
}

apply_caddy() {
  need_root
  [ -f "$CADDYFILE" ] || die "$CADDYFILE not found"
  [ -f "$SNIPPET_SRC" ] || die "snippet source $SNIPPET_SRC not found"
  if has_block; then echo "Block already present in $CADDYFILE. Nothing to do."; return 0; fi
  command -v caddy >/dev/null || die "caddy binary not found"

  local backup="$CADDYFILE.bak-$(date +%F-%H%M%S)"
  cp -p "$CADDYFILE" "$backup"
  echo "Backup: $backup"

  # Take the matcher + abort lines (with their comments) from the repo snippet and insert them just
  # above the reverse_proxy line of the target vhost.
  python3 - "$CADDYFILE" "$SNIPPET_SRC" "$DOMAIN" <<'PY' || { cp -p "$backup" "$CADDYFILE"; die "edit failed; backup restored"; }
import re, sys
target, src, domain = sys.argv[1:4]
snip = open(src).read().splitlines()
start = next(i for i, l in enumerate(snip) if "MULIA-SEC-FIX" in l)
end = next(i for i, l in enumerate(snip) if l.strip().startswith("abort @not_cloudflare"))
insert = snip[start:end + 1] + [""]
lines = open(target).read().splitlines()
in_site = False
for i, l in enumerate(lines):
    if re.match(r"^" + re.escape(domain) + r"\s*\{", l):
        in_site = True
    elif in_site and l.strip().startswith("reverse_proxy"):
        lines[i:i] = insert
        open(target, "w").write("\n".join(lines) + "\n")
        sys.exit(0)
    elif in_site and l.startswith("}"):
        break
sys.exit("vhost or reverse_proxy line for " + domain + " not found")
PY

  if ! caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
    cp -p "$backup" "$CADDYFILE"
    die "caddy validate FAILED; backup restored, nothing reloaded"
  fi
  echo "caddy validate: OK"

  $RELOAD_CMD || { cp -p "$backup" "$CADDYFILE"; $RELOAD_CMD || true; die "reload failed; backup restored"; }
  sleep 2

  local code
  code="$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$DOMAIN/" || true)"
  case "$code" in
    2??|3??) echo "Through Cloudflare: https://$DOMAIN/ -> $code OK" ;;
    *)
      cp -p "$backup" "$CADDYFILE"; $RELOAD_CMD || true
      die "https://$DOMAIN/ returned '$code' after change; backup restored and Caddy reloaded" ;;
  esac

  local direct
  direct="$(curl -sk -o /dev/null -m 8 -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" || true)"
  if [ "$direct" = "000" ]; then
    echo "Direct origin hit (not from Cloudflare): dropped, as intended"
  else
    warn "direct origin hit returned $direct (expected the connection to be dropped); review the block"
  fi
  echo "Done. Rollback any time: sudo $0 rollback-caddy"
}

rollback_caddy() {
  need_root
  local latest
  latest="$(ls -1t "$CADDYFILE".bak-* 2>/dev/null | head -1 || true)"
  [ -n "$latest" ] || die "no backup found next to $CADDYFILE"
  cp -p "$latest" "$CADDYFILE"
  caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1 || die "restored file does not validate; check $latest manually"
  $RELOAD_CMD
  echo "Restored $latest and reloaded Caddy"
}

case "${1:-check}" in
  check) check ;;
  apply-caddy) apply_caddy ;;
  rollback-caddy) rollback_caddy ;;
  *) echo "usage: $0 [check|apply-caddy|rollback-caddy]"; exit 2 ;;
esac
