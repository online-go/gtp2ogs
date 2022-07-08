export function getArgNamesUnderscoredGRU(optionName: string): string[] {
    return ["", "_ranked", "_unranked"].map((e) => `${optionName}${e}`);
}
