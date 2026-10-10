# GX10 setup log
Every system change on the borrowed GX10, one line each, with its exact undo step. Undo in reverse order before returning the machine. No secrets in this file.

## Baseline (2026-10-10, before any change)
- **OS:** Ubuntu 24.04.4 LTS, DGX OS 7.5.0 (build 2026-03-23, platform GX10). Kernel 6.17.0-1014-nvidia, aarch64. Hostname `8X2P`, user `asus` (in `sudo`, `adm`, `ollama`; not in `docker`; sudo needs a password).
- **GPU:** NVIDIA GB10, driver 580.142, CUDA 13.0. Idle: Xorg, gnome-shell and Firefox only. RAM 121 GiB visible, ~116 GiB available.
- **Disk:** `/` on nvme0n1p2 (ext4), 916G, 251G used, 619G free. No USB SSD mounted.
- **Network:** `enP7s7` 192.168.2.151/24 (wired, up); `wlP9s9` down; `tailscale0` present but Tailscale logged out; `docker0` 172.17.0.1/16.
- **SSH:** openssh-server installed, socket-activated (`ssh.socket` enabled, listening on 0.0.0.0:22 and [::]:22). Stock sshd_config (password auth allowed by default). `~/.ssh` has only `known_hosts`, no `authorized_keys`.
- **Firewall:** ufw installed, `ENABLED=no` (inactive).
- **Remote desktop:** xrdp not installed; xfce4 not installed. `gnome-remote-desktop` 46.3 installed and its service active, not listening on 3389. GDM `custom.conf` all defaults. Local GNOME session on seat0/tty2 (X11).
- **Already running (owner's, leave alone):** `ollama.service` (enabled, 127.0.0.1:11434; models gemma4:26b, nemotron-3-super, nemotron3:33b, qwen3.6:35b, none loaded), `docker.service` (docker-ce 29.2.1), an `openclaw` gateway (user process, 127.0.0.1:18789/18791), something on 127.0.0.1:11000, CUPS on 127.0.0.1:631.
- **LM Studio:** not installed (no `~/.lmstudio`, no `lms`). `libfuse2t64` not installed. AppArmor `apparmor_restrict_unprivileged_userns=1`.
- **Repo:** no root `.gitignore`; `web/.gitignore` does not list `.env`.

## Changes
| # | Date | Change | Undo |
|---|---|---|---|
| 1 | 2026-10-10 | Temporary passwordless sudo for setup: `/etc/sudoers.d/99-innercove-setup` (`asus ALL=(ALL) NOPASSWD:ALL`, mode 440) | `sudo rm /etc/sudoers.d/99-innercove-setup` (remove as soon as setup is done) |
| 2 | 2026-10-10 | `apt-get install xrdp` (xrdp 0.9.24-4ubuntu0.1~esm1); new packages: xrdp, xorgxrdp, pipewire-module-xrdp, libpipewire-0.3-modules-xrdp, libfuse2t64. Services `xrdp` and `xrdp-sesman` enabled | `sudo apt-get purge -y xrdp xorgxrdp pipewire-module-xrdp libpipewire-0.3-modules-xrdp libfuse2t64 && sudo apt-get autoremove -y` (if LM Studio is removed first, libfuse2t64 can go too) |
| 3 | 2026-10-10 | `/etc/xrdp/xrdp.ini` line 23 `port=3389` → `port=tcp://.:3389` (listen on 127.0.0.1 only; was on *:3389 for ~1 min after install). Backup at `/etc/xrdp/xrdp.ini.innercove-orig` | Removed by the purge in #2; or `sudo mv /etc/xrdp/xrdp.ini.innercove-orig /etc/xrdp/xrdp.ini && sudo systemctl restart xrdp` |
| 4 | 2026-10-10 | ufw rule `allow 22/tcp` (keeps SSH open as before; v4+v6) | `sudo ufw delete allow 22/tcp` |
| 5 | 2026-10-10 | ufw rule `allow from 192.168.2.0/24 to any port 3389 proto tcp` (RDP from this LAN only, per team request "allow LAN connection") | `sudo ufw delete allow from 192.168.2.0/24 to any port 3389 proto tcp` |
| 6 | 2026-10-10 | `ufw --force enable` (was inactive; default deny incoming, allow outgoing) | `sudo ufw --force disable && sudo ufw --force reset` (reset also removes #4–#5; baseline had no rules) |
| 7 | 2026-10-10 | `/etc/xrdp/xrdp.ini` line 23 → `port=tcp://:3389` (all IPv4; access limited by ufw #5) | Same as #3 |
| 8 | 2026-10-10 | `apt-get install --no-install-recommends xfce4 xfce4-terminal dbus-x11` for xrdp sessions (GNOME over xrdp exits at once while the local GNOME session is open). 31 new packages: dbus-x11 exo-utils libexo-2-0 libexo-common libgarcon-1-0 libgarcon-common libgarcon-gtk3-1-0 libkeybinder-3.0-0 libthunarx-3-0 libxfce4panel-2.0-4 libxfce4ui-2-0 libxfce4ui-common libxfce4ui-utils libxfce4util7 libxfce4util-common libxfconf-0-3 libxpresent1 thunar thunar-data xfce4 xfce4-appfinder xfce4-helpers xfce4-panel xfce4-pulseaudio-plugin xfce4-session xfce4-settings xfce4-terminal xfconf xfdesktop4 xfdesktop4-data xfwm4 | `sudo apt-get purge -y dbus-x11 exo-utils libexo-2-0 libexo-common libgarcon-1-0 libgarcon-common libgarcon-gtk3-1-0 libkeybinder-3.0-0 libthunarx-3-0 libxfce4panel-2.0-4 libxfce4ui-2-0 libxfce4ui-common libxfce4ui-utils libxfce4util7 libxfce4util-common libxfconf-0-3 libxpresent1 thunar thunar-data xfce4 xfce4-appfinder xfce4-helpers xfce4-panel xfce4-pulseaudio-plugin xfce4-session xfce4-settings xfce4-terminal xfconf xfdesktop4 xfdesktop4-data xfwm4 && sudo apt-get autoremove -y` |
| 9 | 2026-10-10 | Created `~/.xsession` (exec startxfce4) so xrdp starts Xfce; GDM/GNOME locally unchanged | `rm ~/.xsession` |
| 10 | 2026-10-10 | Downloaded LM Studio 0.4.26-4 ARM64 .deb (no SSD) to `~/Downloads/innercove-lmstudio/` (sha256 58c9a0648b7c90adc5898bee2de9db9542d4ac8c9f6239c4ce9e4ebfa62057f6) | `rm -r ~/Downloads/innercove-lmstudio` |
| 11 | 2026-10-10 | `apt-get install ./LM-Studio-0.4.26-4-arm64.deb` (package `lm-studio` 0.4.26+4, no extra deps): `/opt/LM-Studio`, `/usr/bin/lm-studio` alternative, desktop entry, AppArmor profile `/etc/apparmor.d/lm-studio` (userns for that binary only) | `sudo apt-get purge -y lm-studio` (postrm unloads and deletes the AppArmor profile; then check `ls /etc/apparmor.d/lm-studio` is gone) |
