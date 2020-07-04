function getRankedUnrankedUnderscored(rankedUnranked) {
    if (rankedUnranked.includes("ranked")) {
        return `_${rankedUnranked}`;
    } else {
        return "";
    }
}

exports.getRankedUnrankedUnderscored = getRankedUnrankedUnderscored;
