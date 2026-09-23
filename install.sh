#!/usr/bin/env bash
#
# SocialLive installer — Linux / macOS / Termux
#
#   curl -fsSL https://raw.githubusercontent.com/AxionAura/social-live/main/install.sh | bash
#
# Installs Node.js and FFmpeg if missing (prefers user-local runtimes, asks for
# sudo only when a system package is the cleanest option), clones SocialLive,
# builds it, installs a background service (systemd user service on Linux,
# launchd on macOS), and prints the dashboard URL.
#
# Read before running: this file lives in the repository and every step is visible.
#
# Flags:
#   --uninstall     remove SocialLive, its service and data
#   --no-service    install the app but skip the background service
#   --port N        dashboard port (default 3000)
#   --dir PATH      install location (default $HOME/.social-live)
#
# Environment overrides: SOCIAL_LIVE_DIR, APP_PORT, SKIP_SERVICE=1, DRY_RUN=1
set -euo pipefail
# ══ AxionInstaller v1 (auto-embedded — edit AxionInstaller/lib instead) ══
#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
#  AxionInstaller — bash UI library          v1.0 · AxionAura
#  Branded terminal UI for project installers.
#  Design tokens: indigo #6366f1 · violet #8b5cf6 · purple #a855f7 ·
#  fuchsia #d946ef · bg #06090f · fg #e6edf3 · muted #8b949e
#
#  Public API:
#    axion_init  <Project Name> [Tagline]
#    axion_step  "label"  <command args...>     (runs cmd, atom spinner)
#    axion_info / axion_ok / axion_warn / axion_fail "msg"
#    axion_banner                                (big atom + wordmark)
#    axion_done  "line1" ["line2" ...]           (summary card)
#  Rules:
#    • Call axion_init first. Non-TTY output falls back to plain logs
#      automatically (CI / piped output safe).
#    • Long work goes through axion_step — never bare echo during work.
# ══════════════════════════════════════════════════════════════════

# ── AxionInstaller palette (truecolor; falls back gracefully) ──
AX_C_INDIGO='\033[38;2;99;102;241m'
AX_C_VIOLET='\033[38;2;139;92;246m'
AX_C_PURPLE='\033[38;2;168;85;247m'
AX_C_FUCHSIA='\033[38;2;217;70;239m'
AX_C_FG='\033[38;2;230;237;243m'
AX_C_MUTED='\033[38;2;139;148;158m'
AX_C_OK='\033[38;2;63;185;80m'
AX_C_ERR='\033[38;2;248;81;73m'
AX_C_DIM='\033[38;2;48;54;61m'
AX_C_BOLD='\033[1m'
AX_RESET='\033[0m'

AX_PROJECT=""
AX_TTY=0

axion_init() {
  AX_PROJECT="${1:-AxionInstaller}"
  AX_TAGLINE="${2:-Open source by default. Free for everyone.}"
  if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then AX_TTY=1; fi
}

_ax() { if [ "$AX_TTY" = "1" ]; then printf '%b' "$1"; else printf '%b' "$2"; fi; }

axion_info() { _ax "${AX_C_VIOLET}●${AX_C_FG} $*${AX_RESET}\n" "● $*\n"; }
axion_ok()   { _ax "${AX_C_OK}✔${AX_C_FG} $*${AX_RESET}\n" "✔ $*\n"; }
axion_warn() { _ax "${AX_C_FUCHSIA}▲${AX_C_FG} $*${AX_RESET}\n" "▲ $*\n"; }
axion_fail() { _ax "${AX_C_ERR}✘${AX_C_FG} $*${AX_RESET}\n" "✘ $*\n"; }

# ── The atom: 6 frames, electrons orbiting three gradient orbitals ──
# Each frame is 5 lines; electrons ● ride the orbital ring.
AX_FRAMES=(
'    ·────────·
   ╱          ╲
  ●────┼──────●
   ╲          ╱
    ·────────·'
'    ·───●────·
   ╱     │    ╲
  ·─────┼─────●
   ╲    │    ╱
    ·────────·'
'    ·──────·─·
   ╱     │   ╲
  ·──────┼────●
   ╲    │    ╱
    ·──●─────·'
'    ·──────·─●
   ╱     │   ╲
  ·──────┼────·
   ╲    │    ╱
    ·──●─────·'
'    ·──●─────·
   ╱    │    ╲
  ·─────┼─────·
   ╲    │    ╱
    ·────────●·'
'    ·────────·
   ╱    ●    ╲
  ●─────┼─────·
   ╲    │    ╱
    ·────────·'
)
AX_FI=0

axion_atom_frame() {
  # gradient-lit frame: orbital dim, electrons in AxionAura gradient
  local f="${AX_FRAMES[$((AX_FI % ${#AX_FRAMES[@]}))]}"
  AX_FI=$((AX_FI + 1))
  _ax "${AX_C_DIM}${f//'─'/${AX_C_DIM}─${AX_C_DIM}}${AX_RESET}" "${f}\n"
}

# ── axion_step: run a command behind the orbiting atom ──
# Output is captured; on failure the last lines are shown (debuggable UX).
axion_step() {
  local label="$1"; shift
  local tmplog
  tmplog="$(mktemp "${TMPDIR:-/tmp}/axion-step.XXXXXX")"
  if [ "$AX_TTY" != "1" ]; then
    axion_info "$label"
    "$@" 2>&1 | tee "$tmplog"
    local rc=${PIPESTATUS[0]}
    rm -f "$tmplog"
    if [ "$rc" -eq 0 ]; then
      axion_ok "$label"
    else
      axion_fail "$label (exit $rc) — log above"
    fi
    return "$rc"
  fi
  "$@" >"$tmplog" 2>&1 &
  local pid=$! rc
  # প্রতি ইটারেশনে ঠিক ৭ লাইন ছাপা হয় (divider + ৫-লাইনের পরমাণু + label)
  # তাই ঠিক ৭ লাইনই মুছতে হয় — কম মুছলে frame গুলো স্তূপ হয়ে যায়
  local clr=$'\033[2K\033[1A\033[2K\033[1A\033[2K\033[1A\033[2K\033[1A\033[2K\033[1A\033[2K\033[1A\033[2K\r'
  local spin='⠋⠙⠹⠸⠼⠴⠦⠧' si=0
  printf '\033[?25l'                                  # hide cursor
  local frame="${AX_FRAMES[$((AX_FI % ${#AX_FRAMES[@]}))]}"; AX_FI=$((AX_FI + 1))
  printf '%b\n' "${AX_C_DIM}  ────────────────────────────${AX_RESET}"
  printf '%b\n' "$(printf '%b' "${AX_C_DIM}${frame}${AX_RESET}" | sed $'s/●/\033[38;2;168;85;247m●\033[38;2;48;54;61m/g')"
  printf '%b' "${AX_C_VIOLET}${spin:0:1}${AX_RESET} ${AX_C_FG}${label}${AX_RESET} ${AX_C_MUTED}…"
  while kill -0 "$pid" 2>/dev/null; do
    sleep 0.12
    local b="${spin:$((si % ${#spin})):1}"; si=$((si + 1))
    frame="${AX_FRAMES[$((AX_FI % ${#AX_FRAMES[@]}))]}"; AX_FI=$((AX_FI + 1))
    printf '%b' "$clr"
    printf '%b\n' "${AX_C_DIM}  ────────────────────────────${AX_RESET}"
    printf '%b\n' "$(printf '%b' "${AX_C_DIM}${frame}${AX_RESET}" | sed $'s/●/\033[38;2;168;85;247m●\033[38;2;48;54;61m/g')"
    printf '%b' "${AX_C_VIOLET}${b}${AX_RESET} ${AX_C_FG}${label}${AX_RESET} ${AX_C_MUTED}…"
  done
  wait "$pid"; rc=$?
  printf '%b' "$clr"
  printf '\033[?25h'
  if [ $rc -eq 0 ]; then
    axion_ok "$label"
  else
    axion_fail "$label (exit $rc)"
    axion_warn 'last output lines:'
    tail -n 12 "$tmplog" | sed 's/^/    /'
  fi
  rm -f "$tmplog"
  return $rc
}

# ── banner: gradient wordmark + atom ──
axion_banner() {
  if [ "$AX_TTY" != "1" ]; then
    printf '════════════════════════════════\n  %s — %s\n════════════════════════════════\n' \
      "$AX_PROJECT" "$AX_TAGLINE"
    return
  fi
  printf '%b' "
${AX_C_DIM}        ·────────·
       ╱    ${AX_C_PURPLE}●${AX_C_DIM}     ╲
      ${AX_C_INDIGO}●${AX_C_DIM}──────┼──────${AX_C_FUCHSIA}●${AX_C_DIM}
       ╲          ╱
        ·────────·${AX_RESET}
"
  printf '%b' "${AX_C_BOLD}${AX_C_INDIGO}  Axion${AX_C_PURPLE}Aura${AX_C_FG}  ${AX_RESET}${AX_C_MUTED}presents${AX_RESET}\n"
  printf '%b' "${AX_C_BOLD}${AX_C_FG}  $AX_PROJECT${AX_RESET}  ${AX_C_MUTED}$AX_TAGLINE${AX_RESET}\n\n"
}

axion_done() {
  printf '%b' "${AX_C_DIM}  ────────────────────────────${AX_RESET}\n"
  printf '%b' "${AX_C_OK}  ✔${AX_C_BOLD}${AX_C_FG}  $AX_PROJECT is ready${AX_RESET}\n"
  local line
  for line in "$@"; do
    printf '%b' "${AX_C_MUTED}  · ${AX_C_FG}$line${AX_RESET}\n"
  done
  printf '%b' "${AX_C_VIOLET}  ── AxionAura · Open source by default. Free for everyone. ──${AX_RESET}\n\n"
}

# ══ end AxionInstaller ══

# ────────────────────────── configuration ──────────────────────────
NODE_VERSION="22.14.0"          # pinned nodejs.org runtime used when the system Node is too old
REQUIRED_NODE_MAJOR=22
REQUIRED_NODE_MINOR=13

INSTALL_DIR="${SOCIAL_LIVE_DIR:-$HOME/.social-live}"
APP_PORT="${APP_PORT:-3000}"
SKIP_SERVICE="${SKIP_SERVICE:-0}"
DRY_RUN="${DRY_RUN:-0}"
DO_UNINSTALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --uninstall) DO_UNINSTALL=1 ;;
    --no-service) SKIP_SERVICE=1 ;;
    --port) APP_PORT="$2"; shift ;;
    --dir) INSTALL_DIR="$2"; shift ;;
    *) echo "Unknown option: $1 (supported: --uninstall, --no-service, --port N, --dir PATH)"; exit 1 ;;
  esac
  shift
done

# ────────────────────────── helpers ──────────────────────────
axion_init "SocialLive" "Self-hosted live streaming dashboard"
info()  { axion_info "$*"; }
warn()  { axion_warn "$*"; }
die()   { axion_fail "$*"; exit 1; }
have()  { command -v "$1" >/dev/null 2>&1; }
run()   { if [ "$DRY_RUN" = "1" ]; then info "(dry-run) $*"; else "$@"; fi; }

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if have sudo; then SUDO="sudo"; fi
fi

# ────────────────────────── OS detection ──────────────────────────
OS="unknown"      # linux | macos | termux
PKG="none"        # apt | dnf | pacman | brew | termux | none

if [ -n "${TERMUX_VERSION:-}" ] || [ -n "${TERMUX_PREFIX:-}" ]; then
  OS="termux"; PKG="termux"
elif [ "$(uname -s)" = "Darwin" ]; then
  OS="macos"; have brew && PKG="brew"
elif [ "$(uname -s)" = "Linux" ]; then
  OS="linux"
  if have apt-get; then PKG="apt"
  elif have dnf; then PKG="dnf"
  elif have pacman; then PKG="pacman"
  fi
fi
[ "$OS" = "unknown" ] && die "Unsupported OS: $(uname -s). Supported: Linux, macOS, Termux."

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|aarch64|arm64) ;;
  *) warn "Unusual architecture '$ARCH' — dependency downloads may fail." ;;
esac

pkg_install() {
  case "$PKG" in
    termux) run pkg install -y "$@" ;;
    apt)    run $SUDO apt-get update && run $SUDO apt-get install -y "$@" ;;
    dnf)    run $SUDO dnf install -y "$@" ;;
    pacman) run $SUDO pacman -S --noconfirm "$@" ;;
    brew)   run brew install "$@" ;;
    *)      return 1 ;;
  esac
}

# ────────────────────────── uninstall path ──────────────────────────
if [ "$DO_UNINSTALL" = "1" ]; then
  info "Uninstalling SocialLive from $INSTALL_DIR"
  if [ "$OS" = "linux" ] && have systemctl; then
    run systemctl --user disable --now social-live.service || true
    run rm -f "$HOME/.config/systemd/user/social-live.service"
    run systemctl --user daemon-reload || true
  elif [ "$OS" = "macos" ]; then
    run launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.axionaura.social-live.plist" || true
    run rm -f "$HOME/Library/LaunchAgents/com.axionaura.social-live.plist"
  fi
  run rm -f "$HOME/.local/bin/social-live"
  run rm -rf "$INSTALL_DIR"
  info "Removed. Your dashboard data went with $INSTALL_DIR — the encryption key too."
  exit 0
fi

# ────────────────────────── Node.js ──────────────────────────
node_ok() {
  have node || return 1
  [ "$(node -p 'process.versions.node.split(".").map(Number).slice(0,2).reduce((a,b,i)=>a+b*[100,1][i],0)')" \
      -ge $((REQUIRED_NODE_MAJOR * 100 + REQUIRED_NODE_MINOR)) ] 2>/dev/null
}

RUNTIME_DIR="$INSTALL_DIR/runtime"

install_node_tarball() {
  case "$ARCH" in
    aarch64|arm64) NODE_ARCH="arm64" ;;
    *)             NODE_ARCH="x64" ;;
  esac
  case "$OS" in
    macos) NODE_OS="darwin" ;;
    *)     NODE_OS="linux"  ;;
  esac
  NODE_TARBALL="node-v${NODE_VERSION}-${NODE_OS}-${NODE_ARCH}.tar.gz"
  NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}"
  info "Downloading Node.js v${NODE_VERSION} (${NODE_OS}-${NODE_ARCH}) → $RUNTIME_DIR"
  run mkdir -p "$RUNTIME_DIR"
  axion_step "Downloading Node.js runtime (portable)" fetch "$NODE_URL" "$RUNTIME_DIR/$NODE_TARBALL"
  run tar -xzf "$RUNTIME_DIR/$NODE_TARBALL" -C "$RUNTIME_DIR"
  run rm -f "$RUNTIME_DIR/$NODE_TARBALL"
  run ln -sfn "$RUNTIME_DIR/node-v${NODE_VERSION}-${NODE_OS}-${NODE_ARCH}/bin/node" "$RUNTIME_DIR/node"
  run ln -sfn "$RUNTIME_DIR/node-v${NODE_VERSION}-${NODE_OS}-${NODE_ARCH}/bin/npm"  "$RUNTIME_DIR/npm"
  run ln -sfn "$RUNTIME_DIR/node-v${NODE_VERSION}-${NODE_OS}-${NODE_ARCH}/bin/npx"  "$RUNTIME_DIR/npx"
  export PATH="$RUNTIME_DIR:$PATH"
}

if node_ok; then
  info "Node.js $(node --version) found — OK (needs >= ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR})"
else
  if [ "$PKG" != "none" ] && [ "$OS" != "macos" ]; then
    # distro repos rarely ship Node >= 22; go straight to the official runtime
    install_node_tarball
  elif [ "$PKG" = "brew" ]; then
    pkg_install node || install_node_tarball
  else
    install_node_tarball
  fi
  node_ok || die "Node.js ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR}+ could not be provisioned. Install it manually and re-run."
  info "Node.js $(node --version) provisioned at $RUNTIME_DIR"
fi

# ────────────────────────── FFmpeg ──────────────────────────
if [ -n "$SUDO" ]; then
  if sudo -n true 2>/dev/null; then
    info "Sudo: passwordless ✓"
  else
    info "System packages need your sudo password (asked once, cached ~15 min)"
    sudo -v || warn "Sudo failed — will fall back to user-local downloads where possible."
  fi
fi

if have ffmpeg; then
  info "FFmpeg $(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f3) found — OK"
else
  case "$PKG" in
    none)   die "FFmpeg is missing and no package manager was found. Install FFmpeg, then re-run." ;;
    termux|brew)
            pkg_install ffmpeg || die "Could not install FFmpeg via $PKG. Install it manually and re-run." ;;
    *)
            if [ "$(id -u)" = "0" ] || sudo -n true 2>/dev/null; then
              axion_step "Installing FFmpeg (system package via $PKG)" pkg_install ffmpeg \
                || die "Could not install FFmpeg via $PKG. Install it manually and re-run."
            else
              warn "FFmpeg is missing and sudo needs a password."
              die "Run 'sudo $PKG install ffmpeg' first (or re-run this installer and enter your password)."
            fi ;;
  esac
  have ffmpeg || die "FFmpeg still not found — install it manually and re-run."
  info "FFmpeg installed."
fi

# ────────────────────────── downloads ──────────────────────────
# curl বা wget — যেটা পাওয়া যায়। দুটোই না থাকলে স্পষ্ট বার্তা।
fetch() { # $1 = URL, $2 = output file
  if have curl; then run curl -fsSL "$1" -o "$2"
  elif have wget; then run wget -qO "$2" "$1"
  else die "Neither curl nor wget was found. Install either one ('sudo $PKG install curl') and re-run."
  fi
}

# ────────────────────────── application ──────────────────────────
# git-মুক্ত: সরাসরি সোর্স tarball নামানো হয় (Windows installer-এর মতোই)।
# data/ (ডাটাবেজ, ভিডিও, encryption key) কখনোই ওভাররাইট হয় না।
INSTALLER_URL="https://raw.githubusercontent.com/AxionAura/social-live/main/install.sh"
SRC_URL="https://codeload.github.com/AxionAura/social-live/tar.gz/refs/heads/main"

if [ -f "$INSTALL_DIR/package.json" ]; then
  info "Existing installation found at $INSTALL_DIR — updating (your data stays safe)"
else
  info "Downloading SocialLive → $INSTALL_DIR"
  run mkdir -p "$INSTALL_DIR"
fi

SRC="$INSTALL_DIR/.src.tar.gz"
axion_step "Downloading SocialLive" fetch "$SRC_URL" "$SRC"
run tar -xzf "$SRC" -C "$INSTALL_DIR" --strip-components=1
run rm -f "$SRC"

axion_step 'Installing dependencies (npm ci)' sh -c "cd '$INSTALL_DIR' && npm ci --no-audit --no-fund"

axion_step 'Building dashboard and server' sh -c "cd '$INSTALL_DIR' && npm run build"

# .env: port only — session secret / encryption key are auto-generated by the
# server on first start and persisted under data/config/ (never committed).
if [ ! -f "$INSTALL_DIR/.env" ]; then
  run sh -c "printf 'APP_PORT=%s\nDATA_DIR=%s/data\n' '$APP_PORT' '$INSTALL_DIR' > '$INSTALL_DIR/.env'"
fi

# ────────────────────────── CLI shim ──────────────────────────
write_shim() {
  # quoted heredoc: কিছুই generation-এ expand হয় না — placeholder পরে sed হয়,
  # তাই set -u-তে unbound variable বা escape-জুয়ার কোনো সুযোগ নেই
  cat > "$1" <<'AXSHIM'
#!/usr/bin/env bash
# SocialLive control command (generated by install.sh)
export SOCIAL_LIVE_DIR="__DIR__"
export PATH="__RUNTIME__:$PATH"
cd "$SOCIAL_LIVE_DIR" || exit 1
set -a; [ -f .env ] && . ./.env; set +a
if [ "${1:-}" = "update" ]; then
  if have curl; then curl -fsSL "__INSTALLER__" | bash -s -- --dir "$SOCIAL_LIVE_DIR" ${APP_PORT:+--port "$APP_PORT"}
  elif have wget; then wget -qO- "__INSTALLER__" | bash -s -- --dir "$SOCIAL_LIVE_DIR" ${APP_PORT:+--port "$APP_PORT"}
  else echo "curl or wget is required for update"; exit 1; fi
  exit 0
fi
exec node scripts/social-live.mjs "$@"
AXSHIM
  sed -i "s|__DIR__|$INSTALL_DIR|; s|__RUNTIME__|$RUNTIME_DIR|; s|__INSTALLER__|$INSTALLER_URL|" "$1"
  chmod +x "$1"
}

BIN_DIR="$HOME/.local/bin"
[ "$OS" = "termux" ] && BIN_DIR="$PREFIX/bin"
run mkdir -p "$BIN_DIR"
if [ "$DRY_RUN" = "1" ]; then
  info "(dry-run) write CLI shim $BIN_DIR/social-live"
else
  write_shim "$BIN_DIR/social-live"
  info "Control command installed: social-live (start | stop | status | doctor | update)"
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) warn "$BIN_DIR is not on your PATH. Add it:  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.$([ "$OS" = "macos" ] && echo zshrc || echo bashrc)" ;;
  esac
fi

# ────────────────────────── background service ──────────────────────────
NODE_BIN="$(command -v node)"

install_service_linux() {
  UNIT_DIR="$HOME/.config/systemd/user"
  run mkdir -p "$UNIT_DIR"
  if [ "$DRY_RUN" = "1" ]; then
    info "(dry-run) write $UNIT_DIR/social-live.service"
    cat <<EOF
[Unit]
Description=SocialLive streaming dashboard
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$NODE_BIN apps/server/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
    return
  fi
  cat > "$UNIT_DIR/social-live.service" <<EOF
[Unit]
Description=SocialLive streaming dashboard
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$NODE_BIN apps/server/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
  run systemctl --user daemon-reload
  run systemctl --user enable --now social-live.service
}

install_service_macos() {
  PLIST="$HOME/Library/LaunchAgents/com.axionaura.social-live.plist"
  run mkdir -p "$HOME/Library/LaunchAgents"
  if [ "$DRY_RUN" = "1" ]; then
    info "(dry-run) write $PLIST"; return
  fi
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.axionaura.social-live</string>
  <key>WorkingDirectory</key><string>$INSTALL_DIR</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string><string>apps/server/dist/index.js</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>APP_PORT</key><string>$APP_PORT</string>
    <key>DATA_DIR</key><string>$INSTALL_DIR/data</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
EOF
  run launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
  run launchctl bootstrap "gui/$(id -u)" "$PLIST"
}

start_termux() {
  if [ "$DRY_RUN" = "1" ]; then
    info "(dry-run) write $INSTALL_DIR/start.sh"; return
  fi
  cat > "$INSTALL_DIR/start.sh" <<EOF
#!/usr/bin/env bash
cd "$INSTALL_DIR" && node apps/server/dist/index.js
EOF
  chmod +x "$INSTALL_DIR/start.sh"
  info "Termux has no system services — start SocialLive with:  $INSTALL_DIR/start.sh"
  if have termux-wake-lock; then
    info "Tip: run 'termux-wake-lock' so Android does not suspend the stream."
  fi
}

if [ "$SKIP_SERVICE" = "1" ]; then
  warn "Skipping background service (--no-service). Start manually:  social-live start"
else
  case "$OS" in
    linux)  install_service_linux
            if have systemctl && systemctl --user is-active --quiet social-live.service 2>/dev/null; then
              info "Service running (systemd user unit — restarts on failure, boots on login)."
              [ "$DRY_RUN" = "0" ] && have loginctl && ! loginctl show-user "$USER" 2>/dev/null | grep -q '^Linger=yes' && \
                warn "Optional: 'sudo loginctl enable-linger $USER' starts the dashboard even before you log in."
            else
              warn "Service installed but not active — start it later with:  systemctl --user start social-live"
            fi ;;
    macos)  install_service_macos; info "Service installed (launchd — runs at login, restarts on crash)." ;;
    termux) start_termux ;;
  esac
fi

# ────────────────────────── done ──────────────────────────
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "${LAN_IP:-}" ] && [ "$OS" = "macos" ] && LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"

axion_done \
  "Dashboard:   http://localhost:$APP_PORT" \
  "Wi-Fi:       http://${LAN_IP:-<your-ip>}:$APP_PORT" \
  "Install dir: $INSTALL_DIR" \
  "Update:      social-live update" \
  "Keys:        $INSTALL_DIR/data/config/ — back this folder up"
