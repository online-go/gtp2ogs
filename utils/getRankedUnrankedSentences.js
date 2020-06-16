function getRankedUnrankedStateName(rankedState) {
    return (rankedState ? "ranked" : "unranked");
}

function getRankedUnrankedStateNameOpposite(rankedState) {
    return (rankedState ? "unranked" : "ranked");
}

function getRankedUnrankedSentences(rankedState, speed) {
    const r_u = getRankedUnrankedStateName(rankedState);
    const r_u_opposite = getRankedUnrankedStateNameOpposite(rankedState);

    const r_u_sentences = {
        r_u,
        r_u_opposite,
        for_r_u_games: {
            all: "",
            r_u: `for ${r_u} games`
        },
        from_r_u_games: {
            all: "from all games",
            r_u: `from ${r_u} games`
        },
        for_blc_r_u_games: {
            all: `for ${speed} games`,
            r_u: `for ${speed} ${r_u} games`
        }
    };

    return r_u_sentences;
}

exports.getRankedUnrankedSentences = getRankedUnrankedSentences;
