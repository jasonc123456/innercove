#!/usr/bin/env bash
# HTTPS for the GX10 dev site (D58): a local CA plus a certificate for the hub's addresses, so phones
# and laptops on the LAN or Tailscale get a secure context (the browser only allows the microphone there).
#
#   scripts/make-dev-cert.sh <address or name>...
#   e.g. scripts/make-dev-cert.sh 192.168.2.151 100.70.13.9 innercove-gx10.example.ts.net
#
# Re-run with the new address if the hub's IP changes; the CA is kept, so devices stay trusted.
# The CA key stays in ~/.config/innercove/tls-ca (wiped by resetBeforeReturn.sh) and never enters the
# repo or a container. The CA only vouches for private, Tailscale and localhost addresses (name
# constraints) and expires in 30 days. Remove it from every device after the event.
set -euo pipefail
[ "$#" -ge 1 ] || { echo "usage: $0 <address or name>..." >&2; exit 2; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CA_DIR="${INNERCOVE_CA_DIR:-$HOME/.config/innercove/tls-ca}"
OUT_DIR="$ROOT/data/tls"
PUBLIC_CA="$ROOT/web/public/innercove-ca.cer"
umask 077
mkdir -p "$CA_DIR" "$OUT_DIR" "$(dirname "$PUBLIC_CA")"

if [ ! -f "$CA_DIR/ca.key" ]; then
  openssl req -x509 -new -newkey rsa:2048 -nodes -sha256 -days 30 \
    -keyout "$CA_DIR/ca.key" -out "$CA_DIR/ca.crt" \
    -subj "/CN=InnerCove Demo CA (GX10)/O=InnerCove hackathon" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "nameConstraints=critical,permitted;IP:10.0.0.0/255.0.0.0,permitted;IP:172.16.0.0/255.240.0.0,permitted;IP:192.168.0.0/255.255.0.0,permitted;IP:100.64.0.0/255.192.0.0,permitted;IP:127.0.0.0/255.0.0.0,permitted;DNS:localhost,permitted;DNS:ts.net" \
    2>/dev/null
  echo "Created CA: $CA_DIR/ca.crt"
fi

san="DNS:localhost,IP:127.0.0.1"
for host in "$@"; do
  if [[ $host =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then san="$san,IP:$host"; else san="$san,DNS:$host"; fi
done
openssl req -new -newkey rsa:2048 -nodes -keyout "$OUT_DIR/server.key" -out "$OUT_DIR/server.csr" \
  -subj "/CN=InnerCove GX10" 2>/dev/null
openssl x509 -req -in "$OUT_DIR/server.csr" -CA "$CA_DIR/ca.crt" -CAkey "$CA_DIR/ca.key" -set_serial "0x$(openssl rand -hex 16)" \
  -days 30 -sha256 -out "$OUT_DIR/server.crt" \
  -extfile <(printf 'basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=%s\n' "$san") \
  2>/dev/null
rm -f "$OUT_DIR/server.csr"
# DER .cer: served as application/pkix-cert, which iOS, Android and Windows offer to install.
openssl x509 -in "$CA_DIR/ca.crt" -outform der -out "$PUBLIC_CA"
chmod 644 "$OUT_DIR/server.crt" "$PUBLIC_CA"
openssl verify -CAfile "$CA_DIR/ca.crt" "$OUT_DIR/server.crt" >/dev/null
echo "Certificate for: $san"
echo "Devices install the CA from https://<hub address>:8000/innercove-ca.cer (README \"HTTPS on the local network\")."
