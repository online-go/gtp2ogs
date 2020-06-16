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
        all: {
            for_r_u_games: "", // no need to say explicitly "for all games"
            from_r_u_games: "from all games",
            for_blc_r_u_games: `for ${speed} games`,
            suggestion: ""
        },
        r_or_u: {
            for_r_u_games: `for ${r_u} games`,
            from_r_u_games: `from ${r_u} games`,
            for_blc_r_u_games: `for ${speed} ${r_u} games`,
            suggestion: `.\nYou may try ${r_u_opposite}`
        }
    };

    return r_u_sentences;
}

exports.getRankedUnrankedSentences = getRankedUnrankedSentences;
