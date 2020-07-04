function getArgNamesGRU(optionName) {
    return ["", "ranked", "unranked"].map( e => `${optionName}${e}` );
}

exports.getArgNamesGRU = getArgNamesGRU;
