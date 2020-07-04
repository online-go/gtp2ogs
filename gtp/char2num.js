function char2num(ch) {
    if (ch === ".") return -1;
    return "abcdefghijklmnopqrstuvwxyz".indexOf(ch);
}

exports.char2num = char2num;
