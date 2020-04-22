function gtpchar2num(ch) {
    if (ch === "." || !ch)
        return -1;
    return "abcdefghjklmnopqrstuvwxyz".indexOf(ch.toLowerCase());
}

exports.gtpchar2num = gtpchar2num;
