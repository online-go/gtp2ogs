function getArgNamesGRU(familyName) {
    return ["", "ranked", "unranked"].map( e => `${familyName}${e}` );
}

exports.getArgNamesGRU = getArgNamesGRU;
