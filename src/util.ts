import * as http from "http";
import * as https from "https";
import * as querystring from "querystring";
import { config } from "./config";

export function gtpchar2num(ch: string): number {
    if (ch === "." || !ch) {
        return -1;
    }
    return "abcdefghjklmnopqrstuvwxyz".indexOf(ch.toLowerCase());
}

export function move2gtpvertex(move, width: number, height: number): string {
    if (move.x < 0) {
        return "pass";
    }
    return num2gtpchar(move["x"]) + (height - move["y"]);
}

function num2gtpchar(num: number): string {
    if (num === -1) {
        return ".";
    }
    return "abcdefghjklmnopqrstuvwxyz"[num];
}

export function request(method, host, port, path, data) {
    return new Promise((resolve, reject) => {
        if (config.DEBUG) {
            /* Keeping a backup of old copy syntax just in case.
            /  const noapidata = JSON.parse(JSON.stringify(data));
            /  noapidata.apikey = "hidden";*/

            // ES6 offers shallow copy syntax using spread
            const noapidata = { ...data, apikey: "hidden" };
            console.debug(method, host, port, path, noapidata);
        }

        let enc_data_type = "application/x-www-form-urlencoded";
        for (const k in data) {
            if (typeof data[k] === "object") {
                enc_data_type = "application/json";
            }
        }

        let headers = null;
        if (data._headers) {
            data = JSON.parse(JSON.stringify(data));
            headers = data._headers;
            delete data._headers;
        }

        let enc_data = null;
        if (enc_data_type === "application/json") {
            enc_data = JSON.stringify(data);
        } else {
            enc_data = querystring.stringify(data);
        }

        const options = {
            host: host,
            port: port,
            path: path,
            method: method,
            headers: {
                "Content-Type": enc_data_type,
                "Content-Length": enc_data.length,
            },
        };
        if (headers) {
            for (const k in headers) {
                options.headers[k] = headers[k];
            }
        }

        const req = (config.insecure ? http : https).request(options, (res) => {
            //test
            res.setEncoding("utf8");
            let body = "";
            res.on("data", (chunk) => {
                body += chunk;
            });
            res.on("end", () => {
                if (res.statusCode < 200 || res.statusCode > 299) {
                    reject({ error: `${res.statusCode} - ${body}`, response: res, body: body });
                    return;
                }
                resolve({ response: res, body: body });
            });
        });
        req.on("error", (e) => {
            reject({ error: e.message });
        });

        req.write(enc_data);
        req.end();
    });
}

export function post(path, data): Promise<any> {
    return request("POST", config.host, config.port, path, data);
}

export function api1(str) {
    return `/api/v1/${str}`;
}
