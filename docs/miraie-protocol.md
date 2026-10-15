# MirAIe: how Panasonic's app reaches swing and the rest

> **Unofficial and untested here.** This is the protocol the community library
> [`miraie-ac`](https://pypi.org/project/miraie-ac/) (version 1.1.2, by Raj Kishore / rkzofficial) uses,
> which Home Assistant integrations build on. It was worked out from the app, not published by
> Panasonic, so it can change without notice and may conflict with MirAIe's terms. Nothing in this repo
> calls it yet.

The AC listens on no local ports. Its Wi-Fi module holds an outbound connection to Panasonic's MirAIe
cloud, and the app reaches it through that cloud, so this route needs the internet and a MirAIe account.

## 1. HTTPS API

| Purpose | Request |
|---|---|
| Log in | `POST https://auth.miraie.in/simplifi/v1/userManagement/login` with `{"clientId", "scope", "password", "mobile" or "email"}` → `accessToken`, `refreshToken`, `userId`, `expiresIn` |
| Homes and devices | `GET https://app.miraie.in/simplifi/v1/homeManagement/homes` → `homeId`, `spaces[].devices[]` with `deviceId`, `deviceName` and `topic[0]` |
| Device details | `GET https://app.miraie.in/simplifi/v1/deviceManagement/devices/deviceId/<id,id,…>` → model, MAC, firmware, serials |
| Status | `GET https://app.miraie.in/simplifi/v1/deviceManagement/devices/<deviceId>/mobile/status` |
| Energy use | `GET https://app.miraie.in/simplifi/v1/powerConsumption/devices/<deviceId>?grain=Daily\|Weekly\|Monthly&startDate=…&endDate=…` → kWh per day, week or month (dates `DDMMYYYY`, monthly `MMYYYY`, weekly dates must be Sundays) |

Requests after login send `Authorization: Bearer <accessToken>`. The library sends a fixed
`clientId` (`PBcMcfG19njNCL8AOgvRzIC8AjQa`) and `scope` (`an_14214235325`) taken from the app.

## 2. MQTT over TLS

- Broker `mqtt.miraie.in:8883`, TLS. Username is the `homeId`, password the `accessToken`; log in again
  when the token expires.
- Publish commands to `<topic>/control`.
- Subscribe to `<topic>/status` (state changes) and `<topic>/connectionStatus` (online/offline).

Every command is JSON: a fixed base plus the settings to change.

```json
{"ki": 1, "cnt": "an", "sid": "1", "acvs": 0}
```

| Setting | Key | Values |
|---|---|---|
| Power | `ps` | `"on"`, `"off"` |
| Mode | `acmd` | `"cool"`, `"auto"`, `"dry"`, `"fan"`, `"heat"` |
| Target temperature | `actmp` | `"24.0"` |
| Fan | `acfs` | `"auto"`, `"low"`, `"medium"`, `"high"`, `"quiet"` |
| Vertical swing | `acvs` | `0` auto swing, `1`–`5` fixed positions |
| Horizontal swing | `achs` | `0` auto swing, `1`–`5` fixed positions |
| Display light | `acdc` | `"on"`, `"off"` |
| Eco | `acem` | `"on"`, `"off"`; the library also sets `actmp` 26 |
| Powerful | `acpm` | `"on"`, `"off"` |
| Clean | `acec` | `"on"`, `"off"` |
| Converti (capacity) | `cnv` | `110`, `100`, `90`, `80`, `70`, `55`, `40`; `0` off |
| Room temperature | `rmtmp` | status only |

Status messages use the same keys, plus `ty` (`"AC"`) and `onlineStatus`. Eco, Powerful, Clean and
Converti exclude each other: the library switches the others off when it sets one.

Which keys a given model honours varies; horizontal swing especially. The app may use keys the library
doesn't, such as for nanoe or timers, which would only show up by watching the app's own traffic.

## The local alternative: infrared

The remote speaks Panasonic's IR protocol, which
[IRremoteESP8266](https://github.com/crankyoldgit/IRremoteESP8266) implements (`IRPanasonicAc`:
swing, quiet, powerful, ion and more). An ESP32 with an IR LED, or an IR blaster, gives local control
of everything on the remote with no cloud, but only one way: the AC can't report back over IR. Paired
with Matter for state, that covers it all locally.
