const { char2num } = require("./char2num");

function decodeMoves(move_obj, width, height) {
    const ret = [];

    /*
    if (DEBUG) {
        console.log("Decoding ", move_obj);
    }
    */

   const decodeSingleMoveArray = (arr) => {
        const obj = {
            x         : arr[0],
            y         : arr[1],
            timedelta : arr.length > 2 ? arr[2] : -1,
            color     : arr.length > 3 ? arr[3] : 0,
        }
        const extra = arr.length > 4 ? arr[4] : {};
        for (const k in extra) {
            obj[k] = extra[k];
        }
        return obj;
    }

    if (move_obj instanceof Array) {
        if (move_obj.length && typeof(move_obj[0]) === 'number') {
            ret.push(decodeSingleMoveArray(move_obj));
        }
        else {
            for (let i = 0; i < move_obj.length; ++i) {
                const mv = move_obj[i];
                if (mv instanceof Array) {
                    ret.push(decodeSingleMoveArray(mv));
                }
                else { 
                    throw new Error("Unrecognized move format: ", mv);
                }
            }
        }
    } 
    else if (typeof(move_obj) === "string") {

        if (/[a-zA-Z][0-9]/.test(move_obj)) {
            /* coordinate form, used from human input. */
            const move_string = move_obj;

            const moves = move_string.split(/([a-zA-Z][0-9]+|[.][.])/);
            for (let i = 0; i < moves.length; ++i) {
                if (i%2) { /* even are the 'splits', which should always be blank unless there is an error */
                    let x = pretty_char2num(moves[i][0]);
                    let y = height - parseInt(moves[i].substring(1));
                    if ( ((width && x >= width) || x < 0) ||
                         ((height && y >= height) || y < 0) ) {
                        x = y = -1;
                    }
                    ret.push({"x": x, "y": y, "edited": false, "color": 0});
                } else {
                    if (moves[i] !== "") { 
                        throw `Unparsed move input: ${moves[i]}`;
                    }
                }
            }
        } else {
            /* Pure letter encoded form, used for all records */
            const move_string = move_obj;

            for (let i = 0; i < move_string.length-1; i += 2) {
                let edited = false;
                let color = 0;
                if (move_string[i + 0] === '!') {
                    edited = true;
                    color = parseInt(move_string[i + 1]);
                    i += 2;
                }


                let x = char2num(move_string[i]);
                let y = char2num(move_string[i + 1]);
                if ((width && x >= width) || (height && y >= height)) {
                    x = y = -1;
                }
                ret.push({"x": x, "y": y, "edited": edited, "color": color});
            }
        }
    } 
    else {
        throw new Error("Invalid move format: ", move_obj);
    }

    return ret;
}
function pretty_char2num(ch) {
    if (ch === ".") return -1;
    return "abcdefghjklmnopqrstuvwxyz".indexOf(ch.toLowerCase());
}

exports.decodeMoves = decodeMoves;
