import * as fs from "fs";
import * as tracer from "tracer";
import { config } from "./config";

const console_fmt =
    "{{timestamp}} {{title}} " +
    (config.verbosity > 0 ? "{{file}}:{{line}}{{space}} " : "") +
    "{{message}}";

const console_config = {
    format: console_fmt,
    dateformat: "mmm dd HH:MM:ss",
    preprocess: (data) => {
        switch (data.title) {
            case "trace":
                data.title = " ";
                break;
            case "debug":
                data.title = " ";
                break;
            case "log":
                data.title = " ";
                break;
            case "info":
                data.title = " ";
                break;
            case "warn":
                data.title = " ";
                break;
            case "error":
                data.title = "!";
                break;
        }
        if (config.verbosity > 0) {
            data.space = " ".repeat(Math.max(0, 20 - `${data.file}:${data.line}`.length));
        }
    },
};

const orig_console = console;
(console_config as any).transport = (data: any) => {
    orig_console.log(data.output);
    if (config.logfile) {
        fs.open(config.logfile, "a", parseInt("0644", 8), (_e, id) => {
            // strip color controls characters
            const stripped = data.output.replace(
                // eslint-disable-next-line no-control-regex
                /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
                "",
            );
            fs.write(id, stripped + "\n", null, "utf8", () => {
                fs.close(id, () => {
                    // noop
                });
            });
        });
    }
};

export const trace = tracer.colorConsole(console_config);

(global as any).console = trace;

if (config.verbosity <= 1) {
    trace.trace = (..._args: any[]) => {
        return null;
    };
}
if (config.verbosity <= 0) {
    trace.debug = (..._args: any[]) => {
        return null;
    };
    trace.verbose = (..._args: any[]) => {
        return null;
    };
}
