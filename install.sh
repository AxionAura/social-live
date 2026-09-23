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

# ────────────────────────── configuration ──────────────────────────
REPO_URL="https://github.com/AxionAura/social-live.git"
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
info()  { printf '\033[1;36m[install]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
die()   { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }
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
  run curl -fsSL "$NODE_URL" -o "$RUNTIME_DIR/$NODE_TARBALL"
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
if have ffmpeg; then
  info "FFmpeg $(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f3) found — OK"
else
  case "$PKG" in
    none)   die "FFmpeg is missing and no package manager was found. Install FFmpeg, then re-run." ;;
    termux|brew)
            pkg_install ffmpeg || die "Could not install FFmpeg via $PKG. Install it manually and re-run." ;;
    *)
            if [ -n "$SUDO" ] || [ "$(id -u)" = "0" ]; then
              info "Installing FFmpeg via $PKG (needs sudo for system packages)"
              pkg_install ffmpeg || die "Could not install FFmpeg via $PKG. Install it manually and re-run."
            else
              warn "FFmpeg is missing and sudo is unavailable."
              die "Install FFmpeg (e.g. 'sudo $PKG install ffmpeg') and re-run this installer."
            fi ;;
  esac
  have ffmpeg || die "FFmpeg still not found — install it manually and re-run."
  info "FFmpeg installed."
fi

# ────────────────────────── application ──────────────────────────
have git || { info "Installing git"; pkg_install git || die "git is required to download SocialLive."; }

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Existing installation found at $INSTALL_DIR — updating"
  run git -C "$INSTALL_DIR" fetch --depth 1 origin main
  run git -C "$INSTALL_DIR" reset --hard origin/main
else
  info "Downloading SocialLive → $INSTALL_DIR"
  run mkdir -p "$INSTALL_DIR"
  run git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

info "Installing dependencies (npm ci) — a couple of minutes"
run sh -c "cd '$INSTALL_DIR' && npm ci --no-audit --no-fund"

info "Building (typecheck + web bundle + server) — a minute or two"
run sh -c "cd '$INSTALL_DIR' && npm run build"

# .env: port only — session secret / encryption key are auto-generated by the
# server on first start and persisted under data/config/ (never committed).
if [ ! -f "$INSTALL_DIR/.env" ]; then
  run sh -c "printf 'APP_PORT=%s\nDATA_DIR=%s/data\n' '$APP_PORT' '$INSTALL_DIR' > '$INSTALL_DIR/.env'"
fi

# ────────────────────────── CLI shim ──────────────────────────
write_shim() {
  cat > "$1" <<EOF
#!/usr/bin/env bash
# SocialLive control command (generated by install.sh)
export SOCIAL_LIVE_DIR="$INSTALL_DIR"
export PATH="$RUNTIME_DIR:\$PATH"
cd "$INSTALL_DIR" || exit 1
set -a; [ -f .env ] && . ./.env; set +a
if [ "\${1:-}" = "update" ]; then
  git fetch --depth 1 origin main && git reset --hard origin/main || exit 1
  npm ci --no-audit --no-fund && npm run build || exit 1
  node scripts/social-live.mjs restart || node scripts/social-live.mjs start
  echo "Updated to $(git -C "$INSTALL_DIR" rev-parse --short HEAD 2>/dev/null || echo latest)."
  exit 0
fi
exec node scripts/social-live.mjs "\$@"
EOF
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

printf '\n'
info "──────────── SocialLive is ready ────────────"
info "Dashboard:   http://localhost:$APP_PORT"
[ -n "${LAN_IP:-}" ] && info "From phones on your Wi-Fi:  http://$LAN_IP:$APP_PORT"
info "Install dir: $INSTALL_DIR"
info "First step:  open the URL, create the admin account, add a destination."
info "Update:      social-live update        Uninstall: reinstall this script with --uninstall"
info "Keys are auto-generated under $INSTALL_DIR/data/config/ — back that folder up."
printf '\n'
