import * as fs from "fs";
import * as tracer from "tracer";
import { config } from "./config";

const console_fmt =
    "{{timestamp}} {{title}} " +
    (config.DEBUG ? "{{file}}:{{line}}{{space}} " : "") +
    "{{message}}";

const console_config = {
    format: console_fmt,
    dateformat: "mmm dd HH:MM:ss",
    preprocess: (data) => {
        switch (data.title) {
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
                data.title = "!";
                break;
            case "error":
                data.title = "!!!!!";
                break;
        }
        if (config.DEBUG) {
            data.space = " ".repeat(Math.max(0, 30 - `${data.file}:${data.line}`.length));
        }
    },
};

if (config.logfile) {
    (console_config as any).transport = (data: any) => {
        console.log(data.output);
        fs.open(config.logfile, "a", parseInt("0644", 8), (_e, id) => {
            fs.write(id, data.output + "\n", null, "utf8", () => {
                fs.close(id, () => {
                    // noop
                });
            });
        });
    };
}

export const trace = tracer.colorConsole(console_config);
