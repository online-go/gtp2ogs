/** Utility functions for library use */

import { Move } from "../types";

export function gtpchar2num(ch: string): number {
    if (ch === "." || !ch) {
        return -1;
    }
    return "abcdefghjklmnopqrstuvwxyz".indexOf(ch.toLowerCase());
}

export function num2gtpchar(num: number): string {
    if (num === -1) {
        return ".";
    }
    return "abcdefghjklmnopqrstuvwxyz"[num];
}

export function move2gtpvertex(move, width: number, height: number): string {
    if (move.x < 0) {
        return "pass";
    }
    return num2gtpchar(move["x"]) + (height - move["y"]);
}

export function ignore_promise(_promise: Promise<any>) {
    // noop - used to explicitly mark promises we don't care about
}

/** Convert board coordinate to server format character */
export function num2char(num: number): string {
    if (num === -1) {
        return ".";
    }
    return "abcdefghijklmnopqrstuvwxyz"[num];
}

/** Encode a Move object to server format */
export function encodeMove(move: Move): string {
    if (move["x"] === -1 || move.pass) {
        return "..";
    }
    return num2char(move["x"]) + num2char(move["y"]);
}
