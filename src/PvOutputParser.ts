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
    public processBotOutput(line: string) {
        this.detectEngine(line);
        this.processLine(line);
    }

    private checkPondering() {
        if (!(this.game.processing || this.lookingForPv)) {
            return true;
        }
        this.lookingForPv = true; // Once we are processing, we continue to look for pv even after processing stops.
        return false;
    }

    private createMessage(name, pv) {
        return {
            type: "analysis",
            name: name,
            from: this.game.state.moves.length,
            moves: pv,
            marks: { circle: pv.substring(0, 2) },
        };
    }

    private PvToGtp(str) {
        return str
            .trim()
            .split(" ")
            .map((s) =>
                s === "pass"
                    ? ".."
                    : num2char(gtpchar2num(s[0].toLowerCase())) +
                      num2char(this.game.state.width - s.slice(1)),
            )
            .join("");
    }

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
                        const winrate = match[2];
                        const scoreLead = match[3];
                        const PDA = match[6] ? ` PDA: ${match[6]}` : "";
                        const pv = this.PvToGtp(match[7]);
                        const name = `Visits: ${visits}, Winrate: ${winrate}, Score: ${scoreLead}${PDA}`;

                        message = this.createMessage(name, pv);
                    }
                }
                break;

            case "leela":
                {
                    const match = line.match(/(\d*) visits, score (\d+\.\d\d)% \(from.* PV: (.*)/);
                    if (match) {
                        const visits = match[1];
                        const score = match[2];
                        const pv = this.PvToGtp(match[3]);
                        const name = `Visits: ${visits}, Score: ${score}`;

                        message = this.createMessage(name, pv);
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
                        const winrate = this.detected_pv[3];
                        const visits = match[1];
                        const playouts = match[3];
                        const name = `Winrate: ${winrate}%, Visits: ${visits}, Playouts: ${playouts}`;
                        const pv = this.PvToGtp(this.detected_pv[7]);

                        delete this.detected_pv;

                        message = this.createMessage(name, pv);
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
                        const winrate = this.detected_pv[3];
                        const score =
                            this.game.my_color === "black"
                                ? this.detected_pv[7]
                                : -parseFloat(this.detected_pv[7]);
                        const scoreLine = this.saiScore ? `, Score: ${score}` : "";
                        const visits = match[1];
                        const playouts = match[3];
                        const name = `Winrate: ${winrate}%${scoreLine}, Visits: ${visits}, Playouts: ${playouts}`;
                        const pv = this.PvToGtp(this.detected_pv[10]);

                        delete this.detected_pv;

                        message = this.createMessage(name, pv);
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
                        const winrate = this.detected_pv[5];
                        const score =
                            this.game.my_color === "black"
                                ? this.detected_pv[11]
                                : -parseFloat(this.detected_pv[11]);
                        const scoreLine = this.saiScore ? `, Score: ${score}` : "";
                        const visits = match[1];
                        const playouts = match[3];
                        const name = `Winrate: ${winrate}%${scoreLine}, Visits: ${visits}, Playouts: ${playouts}`;
                        const pv = this.PvToGtp(this.detected_pv[13]);

                        delete this.detected_pv;

                        message = this.createMessage(name, pv);
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
                        const name = match[1];
                        const pv = this.detected_pv[1]
                            .replace(/\([^()]*\)/g, "")
                            .split(",")
                            .map((s) =>
                                s === ".."
                                    ? ".."
                                    : s[0] + num2char(this.game.state.width - char2num(s[1]) - 1),
                            )
                            .join("");

                        delete this.detected_pv;

                        message = this.createMessage(name, pv);
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
