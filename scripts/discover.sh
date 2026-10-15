#!/usr/bin/env bash
# Finds Matter devices on the local network over mDNS, using macOS dns-sd.
#
# A paired device advertises _matter._tcp once per controller (fabric), named <fabric>-<node>.
# A device in pairing mode advertises _matterc._udp; its TXT record carries VP=<vendor>+<product>,
# D=<discriminator> and CM (1 = factory pairing mode, 2 = window opened by a controller).
set -u
WAIT=${WAIT:-3}

# dns-sd never exits on its own, so each query runs for $WAIT seconds.
query() {
    dns-sd "$@" &
    local pid=$!
    sleep "$WAIT"
    kill "$pid" 2>/dev/null
    wait "$pid" 2>/dev/null
}

for type in _matter._tcp _matterc._udp; do
    echo "== $type"
    instances=$(query -B "$type" local. | awk '$2 == "Add" { print $7 }' | sort -u)
    [ -z "$instances" ] && echo "   (none)" && continue
    for instance in $instances; do
        resolved=$(query -L "$instance" "$type" local.)
        target=$(sed -n 's/.* can be reached at \([^ ]*\) .*/\1/p' <<<"$resolved" | head -1)
        txt=$(awk '/can be reached at/ { getline; print; exit }' <<<"$resolved" | sed 's/^ *//')
        host=${target%:*}
        addrs=$([ -n "$host" ] && query -G v4v6 "$host" | awk '$2 == "Add" { print $6 }' | paste -sd ' ' -)
        echo "   $instance  ${target:-?}  ${addrs:-}"
        [ -n "$txt" ] && echo "      $txt"
    done
done
