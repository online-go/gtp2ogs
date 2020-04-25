function num2gtpchar(num) {
    if (num === -1) 
        return ".";
    return "abcdefghjklmnopqrstuvwxyz"[num];
}

function move2gtpvertex(move, board_size) {
    if (move.x < 0) {
        return "pass";
    }
    return num2gtpchar(move['x']) + (board_size-move['y'])
}

exports.move2gtpvertex = move2gtpvertex;