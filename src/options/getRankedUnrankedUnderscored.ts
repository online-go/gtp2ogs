export function getRankedUnrankedUnderscored(rankedUnranked: string): string {
    if (rankedUnranked.includes("ranked")) {
        return `_${rankedUnranked}`;
    } else {
        return "";
    }
}
