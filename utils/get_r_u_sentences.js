function get_r_u_opposite(r_u) {
    return (r_u === "ranked" ? "unranked" : "ranked");
}

function get_r_u_sentences(rankedArgSameRuleAsUnrankedArg, r_u, speed) {
    const r_u_opposite = get_r_u_opposite(r_u);

    if (rankedArgSameRuleAsUnrankedArg) {
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
            suggestion: `.\nYou can change the ${r_u} setting, or use the same setting in an ${r_u_opposite} and it will be accepted`,
            alternative: `.\nYou cannot change the ${r_u} setting, but the same setting in an ${r_u_opposite} unranked game will be accepted`                                               
        });
    }
}

exports.get_r_u_sentences = get_r_u_sentences;
