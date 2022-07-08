export function getRankedUnranked(rankedUnranked: string): string {
    if (rankedUnranked.includes("unranked")) {
        return "unranked";
    }
    if (rankedUnranked.includes("ranked")) {
        return "ranked";
    } else {
        return "";
    }
}
