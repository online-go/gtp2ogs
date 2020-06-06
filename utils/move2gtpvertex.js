function move2gtpvertex(move, width, height) {
    if (move.x < 0) {
        return "pass";
    }
    return num2gtpchar(move['x']) + (height-move['y'])
}
function num2gtpchar(num) {
    if (num === -1) 
        return ".";
    return "abcdefghjklmnopqrstuvwxyz"[num];
}

exports.move2gtpvertex = move2gtpvertex;
