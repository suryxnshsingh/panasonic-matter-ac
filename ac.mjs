#!/usr/bin/env node
// ac — control a Panasonic room air conditioner over Matter, through the matter.js shell.
//
// Settings (environment):
//   AC_NODE      Matter node id the AC was paired as (default 1)
//   AC_ENDPOINT  endpoint holding the air conditioner (default 1)
//   AC_IFACE     network interface for mDNS, e.g. en0 (default: all)
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(realpathSync(fileURLToPath(import.meta.url)));
// The package's bin entry points at a dist/cjs build it doesn't ship, so run the ESM entry directly.
const SHELL = join(here, "node_modules/@matter/nodejs-shell/dist/esm/app.js");
const NODE = process.env.AC_NODE ?? "1";
const AT = `${NODE} ${process.env.AC_ENDPOINT ?? "1"}`;

// Only what the AC advertises: the Thermostat cluster is cooling-only, FanControl has the Auto feature.
const MODES = { off: 0, cool: 3, fan: 7, dry: 8 };
const FANS = { off: 0, low: 1, medium: 2, high: 3, auto: 5 };
const nameOf = (map, v) => Object.keys(map).find(k => map[k] === v) ?? `#${v}`;

const strip = text => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
const isLog = line => /^\d{4}-\d\d-\d\d \S+ (DEBUG|INFO|NOTICE|WARN) /.test(line);
const isNoise = line => /^(matter>|stateInformationCallback|Started Node|Loaded \d+ history|Goodbye)/.test(line);

// Runs shell commands one at a time, each after the previous one prints "Done.", and returns what they printed.
function shell(cmds, timeoutMs = 60_000) {
    const args = [SHELL, "1", ...(process.env.AC_IFACE ? ["--netInterface", process.env.AC_IFACE] : [])];
    return new Promise((resolve, reject) => {
        const sh = spawn(process.execPath, args, { cwd: here });
        const queue = [...cmds, "exit"];
        const out = [];
        let buf = "";
        const send = () => queue.length && sh.stdin.write(queue.shift() + "\n");
        sh.stdout.on("data", chunk => {
            buf += strip(chunk.toString());
            for (let nl; (nl = buf.indexOf("\n")) >= 0; ) {
                const line = buf.slice(0, nl).trimEnd();
                buf = buf.slice(nl + 1);
                if (line.startsWith("Started Node") || /(^|> )Done\.$/.test(line)) send();
                else if (line.trim() && !isLog(line) && !isNoise(line)) out.push(line);
            }
        });
        sh.stderr.on("data", chunk => out.push(...strip(chunk.toString()).split("\n").filter(l => l.trim() && !isLog(l))));
        sh.on("exit", () => resolve(out));
        setTimeout(() => (sh.kill(), reject(new Error("timed out talking to the AC"))), timeoutMs).unref();
    });
}

const READS = [
    "onoff read onoff",
    "thermostat read systemmode",
    "thermostat read localtemperature",
    "thermostat read occupiedcoolingsetpoint",
    "fancontrol read fanmode",
    "fancontrol read percentcurrent",
].map(r => `attributes ${r} ${AT} --remote`);

function report(lines) {
    const v = {};
    for (const line of lines) {
        const m = line.match(/^Attribute value for (\w+) [\d/]+: (.*)$/);
        if (m) v[m[1]] = m[2];
        else console.log(line);
    }
    if (!("onOff" in v)) return process.exit(1);
    const c = x => (x == null || x === "null" ? "?" : (Number(x) / 100).toFixed(1) + "°C");
    // The AC reports fanMode "off" while its fan runs, so the running percentage is the truer number.
    console.log(
        `Power ${v.onOff === "true" ? "on" : "off"} · mode ${nameOf(MODES, Number(v.systemMode))} · ` +
            `room ${c(v.localTemperature)} · set ${c(v.occupiedCoolingSetpoint)} · ` +
            `fan ${nameOf(FANS, Number(v.fanMode))} (${v.percentCurrent}%)`,
    );
}

const print = lines => lines.forEach(line => console.log(line));

const usage = `usage: ac [status]
       ac on | off
       ac temp <16-30>
       ac mode <${Object.keys(MODES).join("|")}>
       ac fan <${Object.keys(FANS).join("|")}>
       ac beep [seconds]
       ac info                  every endpoint, cluster and attribute
       ac pair <pairing-code>   add this controller (code from Apple/Google Home "pairing mode")
       ac unpair                remove this controller from the AC
       ac raw "<shell command>"...`;

const [cmd, arg] = process.argv.slice(2);
const fail = message => (console.error(message), process.exit(1));
let writes;
switch (cmd) {
    case undefined:
    case "status":
        writes = [];
        break;
    case "on":
    case "off":
        writes = [`commands onoff ${cmd} ${AT}`];
        break;
    case "temp": {
        const t = Number(arg);
        if (!(t >= 16 && t <= 30)) fail("temp must be 16–30 °C");
        writes = [`attributes thermostat write occupiedcoolingsetpoint ${Math.round(t * 100)} ${AT}`];
        break;
    }
    case "mode":
        if (!(arg in MODES)) fail(usage);
        writes = [`attributes thermostat write systemmode ${MODES[arg]} ${AT}`];
        break;
    case "fan":
        if (!(arg in FANS)) fail(usage);
        writes = [`attributes fancontrol write fanmode ${FANS[arg]} ${AT}`];
        break;
    case "beep":
        writes = [`identify ${Number(arg) || 3} ${AT}`];
        break;
    case "info":
        print(await shell([`nodes log ${NODE}`]));
        process.exit(0);
    case "pair":
        if (!/^\d{11}(\d{10})?$/.test(arg?.replace(/-/g, "") ?? "")) fail("pairing code must be 11 or 21 digits");
        print(await shell([`commission pair --pairingCode ${arg.replace(/-/g, "")}`], 180_000));
        process.exit(0);
    case "unpair":
        print(await shell([`commission unpair ${NODE}`]));
        process.exit(0);
    case "raw":
        print(await shell(process.argv.slice(3), 180_000));
        process.exit(0);
    default:
        fail(usage);
}
report(await shell([...writes, ...READS]));
