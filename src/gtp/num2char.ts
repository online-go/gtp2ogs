export function num2char(num: number): string {
    if (num === -1) {
        return ".";
    }
    return "abcdefghijklmnopqrstuvwxyz"[num];
}
