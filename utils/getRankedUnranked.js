function getRankedUnranked(argName) {
    if (argName.includes("unranked")) return "unranked";
    if (argName.includes("ranked"))   return "ranked";
    else                              return "";
}

exports.getRankedUnranked = getRankedUnranked;
