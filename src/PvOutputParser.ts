import { char2num, num2char } from "goban/src/GoMath";
//import { gtpchar2num } from "./Bot";
import { Game } from "./Game";

type SUPPORTED_ENGINE_TYPES = "leela" | "leela_zero" | "katago" | "sai" | "sai18" | "phoenixgo";

/** Utility class to work with Principle Variations (PV) output for different bots. */
export class PvOutputParser {
    game: Game;
    lookingForPv: boolean = false;
    saiScore: boolean = false;

    detected_engine?: SUPPORTED_ENGINE_TYPES;
    detected_pv?: RegExpMatchArray;

    constructor(game) {
        this.game = game;
        this.lookingForPv = false;
        this.saiScore = false;
    }

    /** Scans the bot output for PVs and posts them to the chat. */
    public processBotOutput(line: string): void {
        this.detectEngine(line);
        this.processLine(line);
    }

    private checkPondering(): boolean {
        if (!(this.game.processing || this.lookingForPv)) {
            return true;
        }
        this.lookingForPv = true; // Once we are processing, we continue to look for pv even after processing stops.
        return false;
    }

    private createAnalysisMessage(name: string, pv_move: string) {
        return {
            type: "analysis",
            name: name,
            from: this.game.state.moves.length,
            moves: pv_move,
            marks: { circle: pv_move.substring(0, 2) },
        };
    }

    /** Takes moves like "A19" => "aa" */
    private formatMove(str: string): string {
        return str
            .trim()
            .split(" ")
            .map((s) =>
                s === "pass"
                    ? ".."
                    : num2char(gtpchar2num(s[0].toLowerCase())) +
                      num2char(this.game.state.width - parseInt(s.slice(1))),
            )
            .join("");
    }

    /** This function scans through the stderr output of the bot until it
     *  finds a line that can be used to determine what bot is being used. */
    private detectEngine(line: string) {
        if (this.detected_engine) {
            return;
        }

        if (/KataGo/.test(line)) {
            this.detected_engine = "katago";
            return;
        }

        if (/EvalRoutine:.*init model done.*global_step/.test(line)) {
            this.detected_engine = "phoenixgo";
            return;
        }

        if (/^MC winrate=.*/.test(line)) {
            this.detected_engine = "leela";
            return;
        }

        if (/.*\(V:.*\) \(LCB:.*\) \(N:.*\) \(A:.*\) PV: .*/.test(line)) {
            this.detected_engine = "sai";
            return;
        }

        if (/.*\(V:.*\) \(LCB:.*\) \(N:.*\) PV: .*/.test(line)) {
            this.detected_engine = "leela_zero";
            return;
        }

        if (/move\s+visits\s+reuse\s+ppv\s+winrate\s+agent/.test(line)) {
            this.detected_engine = "sai18";
            return;
        }
    }

    private processLine(line: string) {
        if (line.match(/^Alpha head: /)) {
            this.saiScore = true;
        }

        if (!this.detected_engine) {
            return;
        }

        if (this.checkPondering()) {
            return;
        }
        /*
            LEELAZERO : this.postPvToChatDualLine,
            SAI       : this.postPvToChatDualLine,
            SAI18     : this.postPvToChatDualLine,
            PHOENIXGO : this.postPvToChatDualLine,
            KATAGO    : this.postPvToChatSingleLine,
            LEELA     : this.postPvToChatSingleLine,
        */

        let message: any = null;
        switch (this.detected_engine) {
            case "katago":
                {
                    const match = line.match(
                        /CHAT:Visits (\d*) Winrate (\d+\.\d\d)% ScoreLead (-?\d+\.\d) ScoreStdev (-?\d+\.\d) (\(PDA (-?\d+.\d\d)\) )?PV (.*)/,
                    );
                    if (match) {
                        this.lookingForPv = false;
                        const visits = match[1];
                        const win_rate = parseFloat(match[2]).toFixed(1);
                        const scoreLead = match[3];
                        const PDA = match[6] ? ` PDA: ${match[6]}` : "";
                        const pv = this.formatMove(match[7]);
                        const name = `Win rate: ${win_rate}%, Score: ${scoreLead}${PDA}, Visits: ${visits}`;

                        message = this.createAnalysisMessage(name, pv);
                    }
                }
                break;

            case "leela":
                {
                    const match = line.match(/(\d*) visits, score (\d+\.\d\d)% \(from.* PV: (.*)/);
                    if (match) {
                        const visits = match[1];
                        const win_rate = parseFloat(match[2]).toFixed(1);
                        const pv = this.formatMove(match[3]);
                        const name = `Win rate: ${win_rate}%, Visits: ${visits}`;

                        message = this.createAnalysisMessage(name, pv);
                    }
                }
                break;

            case "leela_zero":
                {
                    const pv_match = line.match(
                        /([A-Z]\d+|pass) -> +(\d+) \(V: +(\d+.\d\d)%\) (\(LCB: +(\d+.\d\d)%\) )?\(N: +(\d+.\d\d)%\) PV:(( ([A-Z][0-9]+|pass)+)+)/,
                    );

                    if (!this.detected_pv && pv_match) {
                        this.detected_pv = pv_match;
                        break;
                    }

                    const match = line.match(
                        /(\d+) visits, (\d+) nodes, (\d+) playouts, (\d+) n\/s/,
                    );

                    if (match && this.detected_pv) {
                        const win_rate = parseFloat(this.detected_pv[3]).toFixed(1);
                        const visits = match[1];
                        const playouts = match[3];
                        const name = `Win rate: ${win_rate}%, Visits: ${visits}, Playouts: ${playouts}`;
                        const pv = this.formatMove(this.detected_pv[7]);

                        delete this.detected_pv;

                        message = this.createAnalysisMessage(name, pv);
                    }
                }
                break;

            case "sai":
                {
                    const pv_match = line.match(
                        /([A-Z]\d+|pass) -> +(\d+) \(V: +(\d+\.\d\d)%\) (\(LCB: +(-?\d+\.\d\d)%\) )?\(N: +(\d+\.\d\d)%\) \(A: +(-?\d+\.\d)\)( \(B: (-?\d+\.\d\d)\))? PV:(( ([A-Z][0-9]+|pass)+)+)/,
                    );

                    if (!this.detected_pv && pv_match) {
                        this.detected_pv = pv_match;
                        break;
                    }

                    const match = line.match(
                        /(\d+) visits, (\d+) nodes, (\d+) playouts, (\d+) n\/s/,
                    );

                    if (match && this.detected_pv) {
                        const winrate = parseFloat(this.detected_pv[3]).toFixed(1);
                        const score =
                            this.game.my_color === "black"
                                ? this.detected_pv[7]
                                : -parseFloat(this.detected_pv[7]);
                        const scoreLine = this.saiScore ? `, Score: ${score}` : "";
                        const visits = match[1];
                        const playouts = match[3];
                        const name = `Win rate: ${winrate}%${scoreLine}, Visits: ${visits}, Playouts: ${playouts}`;
                        const pv = this.formatMove(this.detected_pv[10]);

                        delete this.detected_pv;

                        message = this.createAnalysisMessage(name, pv);
                    }
                }
                break;

            case "sai18":
                {
                    const pv_match = line.match(
                        /([A-Z]\d+|pass) +(\d+) +(\d)+ +(\d)+ +(\d+\.\d\d)% +(\d+\.\d\d)% +(\d+\.\d\d)% +(\d+\.\d\d)% +(\d+\.\d\d)% +(\d+\.\d\d)% +(-?\d+\.\d) +(\d+)%(( ([A-Z][0-9]+|pass)+)+)/,
                    );

                    if (!this.detected_pv && pv_match) {
                        this.detected_pv = pv_match;
                        break;
                    }

                    const match = line.match(
                        /(\d+) visits, (\d+) nodes, (\d+) playouts, (\d+) n\/s/,
                    );

                    if (match && this.detected_pv) {
                        const winrate = parseFloat(this.detected_pv[5]).toFixed(1);
                        const score =
                            this.game.my_color === "black"
                                ? this.detected_pv[11]
                                : -parseFloat(this.detected_pv[11]);
                        const scoreLine = this.saiScore ? `, Score: ${score}` : "";
                        const visits = match[1];
                        const playouts = match[3];
                        const name = `Win rate: ${winrate}%${scoreLine}, Visits: ${visits}, Playouts: ${playouts}`;
                        const pv = this.formatMove(this.detected_pv[13]);

                        delete this.detected_pv;

                        message = this.createAnalysisMessage(name, pv);
                    }
                }
                break;

            case "phoenixgo":
                {
                    const pv_match = line.match(
                        /main move path: ((,?[a-z]{2}\(((\(ind\))|[^()])*\))+)/,
                    );

                    if (!this.detected_pv && pv_match) {
                        this.detected_pv = pv_match;
                        break;
                    }

                    const match = line.match(
                        /[0-9]+.. move\([bw]\): [a-z]{2}, (winrate=([0-9]+\.[0-9]+)%, N=([0-9]+), Q=(-?[0-9]+\.[0-9]+), p=(-?[0-9]+\.[0-9]+), v=(-?[0-9]+\.[0-9]+), cost (-?[0-9]+\.[0-9]+)ms, sims=([0-9]+)), height=([0-9]+), avg_height=([0-9]+\.[0-9]+), global_step=([0-9]+)/,
                    );

                    if (match && this.detected_pv) {
                        const win_rate = parseFloat(match[2]).toFixed(1);
                        const N = parseInt(match[3]);
                        const Q = parseFloat(match[4]);
                        const p = parseFloat(match[5]);
                        const v = parseFloat(match[6]);
                        const cost = parseFloat(match[7]);
                        const sims = parseInt(match[8]);

                        //const name = match[1];
                        const name = `Win rate: ${win_rate}%, N: ${N}, Q: ${Q}, p: ${p}, v: ${v}, cost: ${Math.round(cost)}ms, sims: ${sims}`;
                        const pv = this.detected_pv[1]
                            .replace(/-nan\(ind\)/g, "")
                            .replace(/\([^()]*\)/g, "")
                            .split(",")
                            .map((s) =>
                                s === ".."
                                    ? ".."
                                    : s[0] + num2char(this.game.state.width - char2num(s[1]) - 1),
                            )
                            .join("");

                        delete this.detected_pv;

                        message = this.createAnalysisMessage(name, pv);
                    }
                }
                break;
        }

        if (message) {
            this.game.sendChat(message, this.game.state.moves.length + 1, "malkovich");
        }
    }
}

export function gtpchar2num(ch: string): number {
    if (ch === "." || !ch) {
        return -1;
    }
    return "abcdefghjklmnopqrstuvwxyz".indexOf(ch.toLowerCase());
}
