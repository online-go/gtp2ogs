function getArgNamesUnderscoredGRU(optionName) {
    return ["", "_ranked", "_unranked"].map( e => `${optionName}${e}` );
}

exports.getArgNamesUnderscoredGRU = getArgNamesUnderscoredGRU;
