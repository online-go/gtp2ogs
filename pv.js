const { num2char } = require("./utils/num2char");
const { char2num } = require("./utils/char2num");
const { gtpchar2num } = require("./utils/gtpchar2num");

class Pv {
    constructor(setting, game) {
        this.game = game;
        this.lookingForPv = false;
        this.saiScore = false;

        this.pvLine =  null;
        this.checkSaiScore = setting === 'SAI' ? (line) => {
            if ((/^Alpha head: /).exec(line)) this.saiScore = true;
        } : () => {}
        this.getPvChat = { 'LEELAZERO':  this.getPvChatLZ,
                           'SAI': this.getPvChatSAI,
                           'KATAGO': this.getPvChatKata,
                           'PHOENIXGO':  this.getPvChatPG,
                           'LEELA': this.getPvChatLeela,
                         }[setting];
        this.PVRE =      { 'LEELAZERO':  (/([A-Z]\d+|pass) -> +(\d+) \(V: +(\d+.\d\d)%\) (\(LCB: +(\d+.\d\d)%\) )?\(N: +(\d+.\d\d)%\) PV:(( ([A-Z][0-9]+|pass)+)+)/),
                           'SAI': (/([A-Z]\d+|pass) -> +(\d+) \(V: +(\d+.\d\d)%\) (\(LCB: +(\d+.\d\d)%\) )?\(N: +(\d+.\d\d)%\) \(A: +(-?\d+.\d)\) PV:(( ([A-Z][0-9]+|pass)+)+)/),
                           'KATAGO': (/CHAT:Visits (\d*) Winrate (\d+\.\d\d)% ScoreLead (-?\d+\.\d) ScoreStdev (-?\d+\.\d) (\(PDA (-?\d+.\d\d)\) )?PV (.*)/),
                           'PHOENIXGO':  (/main move path: ((,?[a-z]{2}\(((\(ind\))|[^()])*\))+)/),
                           'LEELA': (/(\d*) visits, score (\d+\.\d\d)% \(from.* PV: (.*)/)
                         }[setting];
        this.STOPRE =    { 'LEELAZERO':  (/(\d+) visits, (\d+) nodes, (\d+) playouts, (\d+) n\/s/),
                           'SAI': (/(\d+) visits, (\d+) nodes, (\d+) playouts, (\d+) n\/s/),
                           'KATAGO': this.PVRE,
                           'PHOENIXGO':  (/[0-9]+.. move\([bw]\): [a-z]{2}, (winrate=([0-9]+\.[0-9]+)%, N=([0-9]+), Q=(-?[0-9]+\.[0-9]+), p=(-?[0-9]+\.[0-9]+), v=(-?[0-9]+\.[0-9]+), cost (-?[0-9]+\.[0-9]+)ms, sims=([0-9]+)), height=([0-9]+), avg_height=([0-9]+\.[0-9]+), global_step=([0-9]+)/),
                           'LEELA': this.PVRE
                         }[setting];
        this.CLPV =      { 'PHOENIXGO':  (/\([^()]*\)/g) }[setting];
    }
    postPvToChat(errline) {
        if (!(this.game.processing || this.lookingForPv)) return;
        this.lookingForPv = true; // Once we are processing, we continue to look for pv even after processing stops.
        this.checkSaiScore(errline);
        this.updatePvLine(errline);
        const stop = this.STOPRE.exec(errline);
        
        if (stop && this.pvLine) {
            this.lookingForPv = false; // we found the pv. We can stop looking.
            const body = this.getPvChat(stop);
            const move = this.game.state.moves.length + 1;
            this.game.sendChat(body, move, "malkovich");
            this.pvLine = null;
        }
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
              playouts = stop[3];
              // nps   = stop[4]; // unused.
        const name = `Winrate: ${winrate}%, Visits: ${visits}, Playouts: ${playouts}`;
              
        const pv = this.PvToGtp(this.pvLine[7]);

        return this.createMessage(name, pv);
    }
    getPvChatSAI(stop) {
        const winrate   = this.pvLine[3],
              score     = this.game.my_color === "black" ? this.pvLine[7] : -parseFloat(this.pvLine[7]),
              scoreLine = this.saiScore ? `, Score: ${score}` : "",
              visits    = stop[1],
              playouts  = stop[3],
              // nps    = stop[4]; // unused
              name      = `Winrate: ${winrate}%${scoreLine}, Visits: ${visits}, Playouts: ${playouts}`;

        const pv = this.PvToGtp(this.pvLine[8]);

        return this.createMessage(name, pv);
    }
    getPvChatPG(stop) {
        const name = stop[1];

        const pv = this.pvLine[1]
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