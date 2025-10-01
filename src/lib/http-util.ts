/** HTTP utilities for making API calls to OGS server */

import * as http from "http";
import * as https from "https";
import * as querystring from "querystring";

export interface RequestOptions {
    server: string;
    apikey: string;
    bot_id?: number;
}

export function request(
    method: string,
    path: string,
    data: any,
    options: RequestOptions,
): Promise<{ response: http.IncomingMessage; body: string }> {
    const url = options.server;
    const host = url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const m = url.match(/:(\d+)$/);
    const port = m ? parseInt(m[1]) : url.match(/^https/) ? 443 : 80;
    const insecure = url.indexOf("https") !== 0;

    // Add credentials to data
    data = { ...data };
    data.apikey = options.apikey;
    if (options.bot_id) {
        data.bot_id = options.bot_id;
    }

    return new Promise((resolve, reject) => {
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

        const req_options = {
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
                req_options.headers[k] = headers[k];
            }
        }

        const req = (insecure ? http : https).request(req_options, (res) => {
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

export function post(
    path: string,
    data: any,
    options: RequestOptions,
): Promise<{ response: http.IncomingMessage; body: string }> {
    return request("POST", path, data, options);
}

export function api1(str: string): string {
    return `/api/v1/${str}`;
}
