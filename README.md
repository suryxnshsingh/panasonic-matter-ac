# panasonic-matter-ac

Control a Panasonic room air conditioner from the terminal, locally, over Matter. It needs no cloud
and no Panasonic account, and leaves Apple Home or Google Home as they are: this becomes one more
controller on the AC.

Tested with a **CS-CU-SU18BKY3W** (firmware 3.02) on macOS. Other Panasonic Matter ACs that expose the
same Room Air Conditioner clusters should work.

```
$ ac
Power on · mode cool · room 25.5°C · set 24.0°C · fan off (10%)
```

## Setup

```sh
npm install                # matter.js shell; BLE native modules are skipped, Wi-Fi pairing doesn't need them
ln -s "$PWD/ac.mjs" ~/.local/bin/ac   # or anywhere on your PATH
```

### Find the AC

```sh
scripts/discover.sh
```

This lists every Matter device on the network over mDNS. A paired device shows up once per controller
under `_matter._tcp`; one in pairing mode shows under `_matterc._udp`, with its vendor and product IDs
in the `VP=` field.

### Pair

Matter devices accept several controllers at once. In the app that already has the AC, open a pairing
window, which generates a one-time code valid for about 15 minutes:

- **Apple Home:** the AC → settings → *Turn On Pairing Mode*
- **Google Home:** the AC → settings → *Linked Matter apps & services* → *Link apps & services*

Then:

```sh
ac pair 12345678901
```

The code printed under the QR on the box only works in factory pairing mode, which means after a
factory reset that removes the AC from your other apps.

## Use

```sh
ac                     # status
ac on | ac off
ac temp 24             # 16–30 °C
ac mode cool           # off | cool | fan | dry
ac fan auto            # off | low | medium | high | auto
ac beep                # identify: the AC beeps
ac info                # every endpoint, cluster and attribute with its value
ac unpair              # remove this controller from the AC
ac raw "attributes thermostat read localtemperature 1 1 --remote"
```

Each command is a fresh connection and takes about 1.5 s. Verified on the AC: every read, setting the
temperature, and beep. Switching power, `fan` and `dry` modes, and fan mode follow what the AC
advertises but are untested.

Settings come from the environment: `AC_NODE` (node id, default `1`), `AC_ENDPOINT` (default `1`) and
`AC_IFACE` (mDNS interface such as `en0`; default all).

## What the AC can and can't do over Matter

[docs/matter-capabilities.md](docs/matter-capabilities.md) lists every cluster, attribute and command
the AC reports, with IDs, ranges and quirks: the reference for building an app on it.

In short: power, cooling mode, target temperature and allowed range, room temperature, fan mode and
speed, power-on behaviour after an outage, beep, and device-level naming, diagnostics, Wi-Fi and
sharing. **Swing, Powerful, Quiet, Eco, Converti, timers and energy use are not in Matter.** Panasonic's
MirAIe app reaches those through its cloud; [docs/miraie-protocol.md](docs/miraie-protocol.md)
describes that protocol and a local infrared alternative.

## Building an app on it

- Keep one connection and one wildcard subscription. The AC allows only 3 sessions and 3
  subscriptions per controller, and publishes no Matter events.
- iOS: the AC is already in Apple Home, so HomeKit can drive it without any Matter code.
- Web or desktop: run matter.js (`@matter/main`) as a small local server and talk to it over
  WebSocket. `ac.mjs` drives the matter.js shell, which is quicker to script but reconnects every time.

## How it works

`ac.mjs` runs the [matter.js](https://github.com/project-chip/matter.js) controller shell
(`@matter/nodejs-shell`) and feeds it commands, each after the previous one finishes. The shell keeps
the controller's fabric and keys in `~/.matter/shell-1`; that directory is what makes this a paired
controller, so keep it safe and don't commit it.

The package's `bin` points at a `dist/cjs` build it doesn't ship (0.17.9), so `ac.mjs` runs
`dist/esm/app.js` directly.
