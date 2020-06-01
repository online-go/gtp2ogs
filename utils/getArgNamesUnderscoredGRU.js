function getArgNamesUnderscoredGRU(familyName) {
    return ["", "_ranked", "_unranked"].map( e => `${familyName}${e}` );
}

exports.getArgNamesUnderscoredGRU = getArgNamesUnderscoredGRU;
