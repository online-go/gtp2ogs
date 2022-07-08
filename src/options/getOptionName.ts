export function getOptionName(argName: string): string {
    return argName.split("unranked")[0].split("ranked")[0];
}
