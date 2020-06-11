function getRankedUnranked(rankedUnranked) {
    if (rankedUnranked.includes("unranked")) return "unranked";
    if (rankedUnranked.includes("ranked"))   return "ranked";
    else                                     return "";
}

exports.getRankedUnranked = getRankedUnranked;
