export function char2num(ch: string): number {
    if (ch === ".") {
        return -1;
    }
    return "abcdefghijklmnopqrstuvwxyz".indexOf(ch);
}
