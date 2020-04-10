const { num2char } = require("./utils/num2char");
const { char2num } = require("./utils/char2num");
const { gtpchar2num } = require("./utils/gtpchar2num");

class Pv {
    constructor(setting, game) {
        this.game = game;

        this.pvLine =  null;
        this.getPvChat = { 'LZ':  this.getPvChatLZ,
                           'SAI': this.getPvChatSAI,
                           'PG':  this.getPvChatPG
                         }[setting];
        this.PVRE =      { 'LZ':  (/([A-Z]\d+|pass) -> +(\d+) \(V: +(\d+.\d\d)%\) (\(LCB: +(\d+.\d\d)%\) )?\(N: +(\d+.\d\d)%\) PV:(( ([A-Z][0-9]+|pass)+)+)/),
                           'SAI': (/([A-Z]\d+|pass) -> +(\d+) \(V: +(\d+.\d\d)%\) (\(LCB: +(\d+.\d\d)%\) )?\(N: +(\d+.\d\d)%\) \(A: +(-?\d+.\d)\) PV:(( ([A-Z][0-9]+|pass)+)+)/),
                           'PG':  (/main move path: ((,?[a-z]{2}\(((\(ind\))|[^()])*\))+)/)
                         }[setting];
        this.STOPRE =    { 'LZ':  (/(\d+) visits, (\d+) nodes, (\d+) playouts, (\d+) n\/s/),
                           'SAI': (/(\d+) visits, (\d+) nodes, (\d+) playouts, (\d+) n\/s/),
                           'PG':  (/[0-9]+.. move\([bw]\): [a-z]{2}, (winrate=([0-9]+\.[0-9]+)%, N=([0-9]+), Q=(-?[0-9]+\.[0-9]+), p=(-?[0-9]+\.[0-9]+), v=(-?[0-9]+\.[0-9]+), cost (-?[0-9]+\.[0-9]+)ms, sims=([0-9]+)), height=([0-9]+), avg_height=([0-9]+\.[0-9]+), global_step=([0-9]+)/)
                         }[setting];
        this.CLPV =      { 'PG':  (/\([^()]*\)/g) }[setting];
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
            "moves": pv
        };
    }
    clearPv() {
        this.pvLine = null;
    }
    getPvChatLZ(stop) {
        const winrate  = this.pvLine[3],
              visits   = stop[1],
              playouts = stop[3];
              // nps   = stop[4]; // unused.
        const name = `Winrate: ${winrate}%, Visits: ${visits}, Playouts: ${playouts}`;
              
        const pv = this.pvLine[7]
                   .trim()
                   .split(" ")
                   .map(s => s === 'pass' ? '..' : num2char(gtpchar2num(s[0].toLowerCase())) + num2char(this.game.state.width - s.slice(1)))
                   .join('');

        return this.createMessage(name, pv);
    }
    getPvChatSAI(stop) {
        const winrate  = this.pvLine[3],
              score    = this.pvLine[7],
              visits   = stop[1],
              playouts = stop[3];
              // nps   = stop[4]; // unused.
        const name = `Winrate: ${winrate}%, Score: ${score}, Visits: ${visits}, Playouts: ${playouts}`;

        const pv = this.pvLine[8]
                  .trim()
                  .split(" ")
                  .map(s => s === 'pass' ? '..' : num2char(gtpchar2num(s[0].toLowerCase())) + num2char(this.game.state.width - s.slice(1)))
                  .join('');

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
}

exports.Pv = Pv;