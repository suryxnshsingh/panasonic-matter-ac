# What the AC exposes over Matter

Read from a Panasonic **CS-CU-SU18BKY3W** (firmware 3.02, hardware 1.00) using each cluster's
`FeatureMap`, `AttributeList` and `AcceptedCommandList`, so this is what the device says it supports,
not what the Matter spec allows.

- Vendor ID `0x0001` (Panasonic), product ID `0x0147` (327). The CSA ledger (DCL) lists one software
  version, 302, and the device has no OTA Requestor cluster, so there are no Matter firmware updates.
- Wi-Fi only (ESP32 module). It advertises only `_matter._tcp` and has no open TCP ports.
- Device attestation verifies against the DCL, so it is a genuine certified Panasonic product.
- `CapabilityMinima`: **3 CASE sessions and 3 subscriptions per fabric**, and 5 fabrics in total.

## Endpoint 1: Room Air Conditioner (device type `0x0072`)

Server clusters: Descriptor `0x001D`, Identify `0x0003`, On/Off `0x0006`, Thermostat `0x0201`,
Fan Control `0x0202`. There is no Groups cluster, so group commands can't reach it.

### On/Off `0x0006` (revision 5, no features)

| ID | Name | Access | Notes |
|---|---|---|---|
| `0x0000` | OnOff | read | power |
| `0x4003` | StartUpOnOff | read/write | after a power cut: `null` previous state (current), `0` off, `1` on, `2` toggle |

Commands: `Off 0x00`, `On 0x01`, `Toggle 0x02`.

### Thermostat `0x0201` (revision 6, feature: **Cooling** only)

| ID | Name | Access | Notes |
|---|---|---|---|
| `0x0000` | LocalTemperature | read | room temperature in 0.01 °C |
| `0x0001` | OutdoorTemperature | read | always 100 (1.00 °C), a placeholder |
| `0x0002` | Occupancy | read | always occupied |
| `0x0005` / `0x0006` | AbsMin/AbsMaxCoolSetpointLimit | read | 1600 / 3200 |
| `0x0007` | PICoolingDemand | — | listed in AttributeList, but reads fail with *unsupported* |
| `0x0011` | OccupiedCoolingSetpoint | read/write | the target temperature, 1600–3000 |
| `0x0012` | OccupiedHeatingSetpoint | read/write | 2000, meaningless on a cooling-only unit |
| `0x0017` / `0x0018` | Min/MaxCoolSetpointLimit | read/write | 1600 / 3000; narrowing them limits what anyone can set |
| `0x001B` | ControlSequenceOfOperation | read/write | `0` cooling only |
| `0x001C` | SystemMode | read/write | `0` off, `3` cool; `7` fan only and `8` dry are allowed by the spec but untested; no `1` auto (no AutoMode feature) and no `4` heat |
| `0x001E` | ThermostatRunningMode | read | what it's doing now, `3` cool |

Commands: `SetpointRaiseLower 0x00` (mode, amount in 0.1 °C).

### Fan Control `0x0202` (revision 4, feature: **Auto** only)

| ID | Name | Access | Notes |
|---|---|---|---|
| `0x0000` | FanMode | read/write | `0` off, `1` low, `2` medium, `3` high, `5` auto |
| `0x0001` | FanModeSequence | read | `2`: Off/Low/Med/High/Auto |
| `0x0002` | PercentSetting | read/write | 0–100 |
| `0x0003` | PercentCurrent | read | actual fan speed |

No MultiSpeed, Rocking (swing), Wind, Step or AirflowDirection features.

### Identify `0x0003`

`IdentifyType` is `3`, an audible beep. Command `Identify 0x00` (seconds).

## Endpoint 0: the device

| Cluster | What's useful in an app |
|---|---|
| Basic Information `0x0028` | vendor, product, serial, hardware and software versions, manufacturing date, unique ID; `NodeLabel` and `Location` are writable (the label arrives as 32 NUL bytes, so trim it) |
| General Diagnostics `0x0033` | network interfaces (MAC, IPv4, IPv6), `RebootCount`; no `UpTime` or `BootReason` |
| Wi-Fi Network Diagnostics `0x0036` | BSSID, security type, Wi-Fi version, channel, RSSI; no packet or error counts |
| Network Commissioning `0x0031` | scan, add/update, connect and remove a Wi-Fi network; it holds 1 network |
| Administrator Commissioning `0x003C` | open a pairing window to share the AC with another app, or revoke one |
| Operational Credentials `0x003E` | list fabrics (read with fabric filtering off to see every controller's vendor ID and label), remove a fabric, update this fabric's label |
| Access Control `0x001F` | 4 entries per fabric, 4 subjects and 3 targets per entry, e.g. operate-only access for another controller |
| Group Key Management `0x003F` | 4 groups and 3 key sets per fabric |
| General Commissioning `0x0030` | fail-safe, regulatory config |

None of the clusters support `EventList`, so the device publishes no Matter events. Subscribe to
attributes instead.

## Not available over Matter

Swing (vertical or horizontal), Powerful, Quiet, Eco, Clean, Converti, display light, sleep mode,
timers and schedules, energy use, humidity, filter alerts and error codes. The device advertises none
of them. Panasonic's MirAIe app reaches some of these through its cloud; see
[miraie-protocol.md](miraie-protocol.md).

## Quirks

- `FanMode` has read `0` (off) while the fan ran at 10%, and `5` (auto) while the unit was off. Show
  `PercentCurrent` for what the fan is doing.
- `OutdoorTemperature` is a fixed placeholder.
- `PICoolingDemand` is listed but unreadable, so trust reads over `AttributeList`.
- ICMP over IPv4 went unanswered while IPv6 ping worked, with about 200 ms round trips (Wi-Fi power saving).
