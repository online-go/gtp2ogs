function get_r_u_strings(rankedStatus, speedStatus) {
    const r_u = rankedStatus ? "ranked" : "unranked";
    return { r_u,
             _r_u:              `_${r_u}`,
             for_r_u_games:     `for ${r_u} games`,
             for_blc_r_u_games: `for ${speedStatus} ${r_u} games`,
             from_r_u_games:    `from ${r_u} games` };
}

exports.get_r_u_strings = get_r_u_strings;