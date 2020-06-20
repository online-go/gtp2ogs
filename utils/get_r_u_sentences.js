function get_r_u_opposite(r_u) {
    return (r_u === "ranked" ? "unranked" : "ranked");
}

function get_r_u_sentences(rankedArgEqualsUnrankedArg, r_u, speed) {
    const r_u_opposite = get_r_u_opposite(r_u);

    const prettier_r_u_opposite = r_u_opposite[0].toUpperCase() + r_u_opposite.slice(1);

    if (rankedArgEqualsUnrankedArg) {
        return ({
            r_u,
            r_u_opposite,
            r_u_all: "",
            r_u_all_opposite: "",
            for_r_u_games: "", // no need to say explicitly " for all games"
            from_r_u_games: "", // no need to say explicitly " from all games"
            for_blc_r_u_games: ` for ${speed} games`,
            suggestion: "",
            alternative: ""
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
            // if user can change the ranked/unranked value to be accepted
            suggestion: `.\nOr ${r_u_opposite} is also accepted`,
            // if user can never be accepted in ranked/ranked but can in unranked/ranked
            alternative: `.\n${prettier_r_u_opposite} is accepted`                                               
        });
    }
}

exports.get_r_u_sentences = get_r_u_sentences;
