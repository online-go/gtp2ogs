(global as any).WebSocket = undefined;

import * as fs from "fs";
import { PvOutputParser } from "../PvOutputParser";
//import * as sinon from "sinon";

const katago_output = fs.readFileSync("src/__tests__/pv_samples/kataGoOutput.txt", "utf8");
const leela_output = fs.readFileSync("src/__tests__/pv_samples/leelaOutput.txt", "utf8");
const leela_zero_output = fs.readFileSync("src/__tests__/pv_samples/leelaZeroOutput.txt", "utf8");
const phoenix_output = fs.readFileSync("src/__tests__/pv_samples/phoenixGoOutput.txt", "utf8");
const sai18_output = fs.readFileSync("src/__tests__/pv_samples/saiOutput18.txt", "utf8");
const sai_output = fs.readFileSync("src/__tests__/pv_samples/saiOutput.txt", "utf8");

describe("PvOutputParser", () => {
    test("should parse a valid response", () => {
        expect(1).toBe(1);
    });

    test("Have output files", () => {
        expect(katago_output).not.toBeNull();
        expect(leela_output).not.toBeNull();
        expect(leela_zero_output).not.toBeNull();
        expect(phoenix_output).not.toBeNull();
        expect(sai18_output).not.toBeNull();
        expect(sai_output).not.toBeNull();
    });

    test("KataGo output parsing", () => {
        const chatBody = {
            type: "analysis",
            name: "Win rate: 41.7%, Score: -0.9, Visits: 4005",
            from: 2,
            moves: "cdpddpppfdfqcmcqdq",
            marks: { circle: "cd" },
        };
        doTest("katago", katago_output, chatBody);
    });

    test("Leela Zero output parsing", () => {
        const chatBody = {
            type: "analysis",
            name: "Win rate: 57.5%, Visits: 17937, Playouts: 17936",
            from: 2,
            moves: "ddcccddcedfbpddpqqpqqpqnrnrmqopnpooo",
            marks: { circle: "dd" },
        };
        doTest("leela_zero", leela_zero_output, chatBody);
    });

    test("Leela output parsing", () => {
        const chatBody = {
            type: "analysis",
            name: "Win rate: 51.3%, Visits: 1435",
            from: 2,
            moves: "fqeqerdr",
            marks: { circle: "fq" },
        };
        doTest("leela", leela_output, chatBody);
    });

    test("Sai output parsing", () => {
        const chatBody = {
            type: "analysis",
            name: "Win rate: 56.8%, Score: -3.1, Visits: 12681, Playouts: 12680",
            from: 2,
            moves: "nceqepdqfrbobncocrdrbqdodnengobpcqdsemfnglec",
            marks: { circle: "nc" },
        };
        doTest("sai", sai_output, chatBody);
    });

    test("Sai18 output parsing", () => {
        const chatBody = {
            type: "analysis",
            name: "Win rate: 55.9%, Score: 2, Visits: 10201, Playouts: 10199",
            from: 2,
            moves: "qcqdpcncocodnbqnblbmdlepgr",
            marks: { circle: "qc" },
        };
        doTest("sai18", sai18_output, chatBody);
    });

    test("Phoenix Go output parsing", () => {
        const chatBody = {
            type: "analysis",
            name: "Win rate: 55.8%, N: 40, Q: 0.115749, p: 0.898028, v: 0.083483, cost: 5815ms, sims: 44",
            from: 2,
            moves: "eoncfdqcnqqnnk",
            marks: { circle: "eo" },
        };
        doTest("phoenixgo", phoenix_output, chatBody);
    });

    function doTest(engine_type: string, contents: string, expected_chat: any) {
        let chat: any;

        const game: any = {
            sendChat: (obj: any, _move_number: number, _channel: string) => {
                chat = obj;
                //console.log("sendChat", ...args);
            },
            processing: true,
            state: {
                width: 19,
                height: 19,
                moves: { length: 2 },
            },
        };

        const parser = new PvOutputParser(game);

        for (const line of contents.split("\n")) {
            //console.log(line);
            parser.processBotOutput(line);
        }

        expect(chat).toEqual(expected_chat);
        expect(parser.detected_engine).toEqual(engine_type);
    }
});
