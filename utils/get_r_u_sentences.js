function get_r_u_opposite(r_u) {
    return (r_u === "ranked" ? "unranked" : "ranked");
}

function get_r_u_sentences(rankedArgEqualsUnrankedArg, r_u, speed) {
    const r_u_opposite = get_r_u_opposite(r_u);

    if (rankedArgEqualsUnrankedArg) {
        return ({
            r_u,
            r_u_opposite,
            r_u_all: "",
            r_u_all_opposite: "",
            for_r_u_games: "", // no need to say explicitly " for all games"
            from_r_u_games: "", // no need to say explicitly " from all games"
            for_blc_r_u_games: ` for ${speed} games`,
            suggestion: ""
        });
    } else {
        return ({
            r_u,
            r_u_opposite,
            r_u_all: r_u,
            r_u_all_opposite: r_u_opposite,
            for_r_u_games: ` for ${r_u} games`,
            from_r_u_games: ` from ${r_u} games`,
            for_blc_r_u_games: ` for ${speed} ${r_u} games`,
            suggestion: `.\nYou may try ${r_u_opposite}`
        });
    }
}

exports.get_r_u_sentences = get_r_u_sentences;
