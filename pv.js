const { num2char } = require("./utils/num2char");
const { char2num } = require("./utils/char2num");
const { gtpchar2num } = require("./utils/gtpchar2num");

class Pv {
    constructor(setting, game) {
        this.game = game;
        this.lookingForPv = false;
        if (setting === 'SAI') { 
            this.saiScore = false;
        } else {
            this.startupCheckSai = () => {}; // disable sai check for other bots.
        }

        this.pvLine =  null;
        this.postPvToChat = { 'LEELAZERO':  this.postPvToChatDualLine,
                              'SAI': this.postPvToChatDualLine,
                              'KATAGO': this.postPvToChatSingleLine,
                              'PHOENIXGO':  this.postPvToChatDualLine,
                              'LEELA': this.postPvToChatSingleLine
                            }[setting];
        this.getPvChat = { 'LEELAZERO':  this.getPvChatLZ,
                           'SAI': this.getPvChatSAI,
                           'KATAGO': this.getPvChatKata,
                           'PHOENIXGO':  this.getPvChatPG,
                           'LEELA': this.getPvChatLeela
                         }[setting];
        this.PVRE =      { 'LEELAZERO':  (/([A-Z]\d+|pass) -> +(\d+) \(V: +(\d+.\d\d)%\) (\(LCB: +(\d+.\d\d)%\) )?\(N: +(\d+.\d\d)%\) PV:(( ([A-Z][0-9]+|pass)+)+)/),
                           'SAI': (/([A-Z]\d+|pass) -> +(\d+) \(V: +(\d+\.\d\d)%\) (\(LCB: +(-?\d+\.\d\d)%\) )?\(N: +(\d+\.\d\d)%\) \(A: +(-?\d+\.\d)\)( \(B: (-?\d+\.\d\d)\))? PV:(( ([A-Z][0-9]+|pass)+)+)/),
                           'PHOENIXGO':  (/main move path: ((,?[a-z]{2}\(((\(ind\))|[^()])*\))+)/)
                         }[setting];
        this.STOPRE =    { 'LEELAZERO':  (/(\d+) visits, (\d+) nodes, (\d+) playouts, (\d+) n\/s/),
                           'SAI': (/(\d+) visits, (\d+) nodes, (\d+) playouts, (\d+) n\/s/),
                           'KATAGO': (/CHAT:Visits (\d*) Winrate (\d+\.\d\d)% ScoreLead (-?\d+\.\d) ScoreStdev (-?\d+\.\d) (\(PDA (-?\d+.\d\d)\) )?PV (.*)/),
                           'PHOENIXGO':  (/[0-9]+.. move\([bw]\): [a-z]{2}, (winrate=([0-9]+\.[0-9]+)%, N=([0-9]+), Q=(-?[0-9]+\.[0-9]+), p=(-?[0-9]+\.[0-9]+), v=(-?[0-9]+\.[0-9]+), cost (-?[0-9]+\.[0-9]+)ms, sims=([0-9]+)), height=([0-9]+), avg_height=([0-9]+\.[0-9]+), global_step=([0-9]+)/),
                           'LEELA': (/(\d*) visits, score (\d+\.\d\d)% \(from.* PV: (.*)/)
                         }[setting];
        this.CLPV =      { 'PHOENIXGO':  (/\([^()]*\)/g) }[setting];
    }
    checkPondering() {
        if (!(this.game.processing || this.lookingForPv)) return true;
        this.lookingForPv = true; // Once we are processing, we continue to look for pv even after processing stops.
        return false;
    }
    postPvToChatDualLine(errline) {
        if (this.checkPondering()) return;
        this.startupCheckSai(errline);
        this.updatePvLine(errline);
        this.postPvToChatLastLine(errline);
    }
    postPvToChatSingleLine(errline) {
        if (this.checkPondering()) return;
        this.pvLine = "1";
        this.postPvToChatLastLine(errline);
    }
    postPvToChatLastLine(errline) {
        const stop = this.STOPRE.exec(errline);
        if (stop && this.pvLine) {
            this.lookingForPv = false; // we found the pv. We can stop looking.
            const body = this.getPvChat(stop);
            const move = this.game.state.moves.length + 1;
            this.game.sendChat(body, move, "malkovich");
            this.pvLine = null;
        }
    }

    startupCheckSai(line) {
        if ((/^Alpha head: /).exec(line)) this.saiScore = true;
    }
    updatePvLine(errline) {
        if (!this.pvLine) {
            const myPv = this.PVRE.exec(errline);
            if (myPv) this.pvLine = myPv;
        }
    }
    createMessage(name, pv) {
        return {
            "type": "analysis",
            "name": name,
            "from": this.game.state.moves.length,
            "moves": pv,
            "marks": { "circle": pv.substring(0, 2) }
        };
    }
    getPvChatLZ(stop) {
        const winrate  = this.pvLine[3],
              visits   = stop[1],
              playouts = stop[3],
              // nps   = stop[4]; // unused.
              name = `Winrate: ${winrate}%, Visits: ${visits}, Playouts: ${playouts}`,
              pv = this.PvToGtp(this.pvLine[7]);

        return this.createMessage(name, pv);
    }
    getPvChatSAI(stop) {
        const winrate   = this.pvLine[3],
              score     = this.game.my_color === "black" ? this.pvLine[7] : -parseFloat(this.pvLine[7]),
              scoreLine = this.saiScore ? `, Score: ${score}` : "",
              visits    = stop[1],
              playouts  = stop[3],
              // nps    = stop[4]; // unused
              name      = `Winrate: ${winrate}%${scoreLine}, Visits: ${visits}, Playouts: ${playouts}`,
              pv = this.PvToGtp(this.pvLine[10]);

        return this.createMessage(name, pv);
    }
    getPvChatPG(stop) {
        const name = stop[1],
              pv = this.pvLine[1]
                   .replace(this.CLPV, '') 
                   .split(",")
                   .map(s => s === '..' ? '..' : s[0] + num2char(this.game.state.width - char2num(s[1]) - 1))
                   .join('');

        return this.createMessage(name, pv);
    }
    getPvChatKata(stop) {
        const visits = stop[1],
              winrate =stop[2],
              scoreLead = stop[3],
              //ScoreStdev = stop[4], // unused
              PDA = stop[6] ? ` PDA: ${stop[6]}` : "",
              pv = this.PvToGtp(stop[7]),
              name = `Visits: ${visits}, Winrate: ${winrate}, Score: ${scoreLead}${PDA}`;

        return this.createMessage(name, pv);
    }
    getPvChatLeela(stop) {
        const visits = stop[1],
              score = stop[2],
              pv = this.PvToGtp(stop[3]),
              name = `Visits: ${visits}, Score: ${score}`;

        return this.createMessage(name, pv);
    }
    PvToGtp(str) { 
        return str
            .trim()
            .split(" ")
            .map(s => s === 'pass' ? '..' : num2char(gtpchar2num(s[0].toLowerCase())) + num2char(this.game.state.width - s.slice(1)))
            .join('');
    }
}

exports.Pv = Pv;