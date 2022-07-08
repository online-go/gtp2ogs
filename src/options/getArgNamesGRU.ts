export function getArgNamesGRU(optionName: string): string[] {
    return ["", "ranked", "unranked"].map((e) => `${optionName}${e}`);
}
