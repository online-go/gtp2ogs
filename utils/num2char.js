function num2char(num) {
    if (num === -1) return ".";
    return "abcdefghijklmnopqrstuvwxyz"[num];
}

exports.num2char = num2char;
