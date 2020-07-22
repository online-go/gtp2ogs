function base_challenge(overrides) {
    const base = {
        type: 'challenge',
        challenge_id: 1,
        player_id: 1,
        game_id: 1,
        id: '1', // GUID
        challenger_color: 'white',
        user: {
            id: 2,
            username: 'human',
            professional: false,
            ranking: 10.0,
        },
        rules: 'chinese',
        ranked: true,
        width: 19,
        height: 19,
        handicap: 0,
        komi: 7.5,
        time_control: {
            speed: 'live',
            system: 'fischer',
            time_control: 'fischer',
            initial_time: 120,
            max_time: 300,
            time_increment: 30,
            pause_on_weekends: false,
        },
        disable_analysis: false,
        aga_rated: false,
        aux_delivered: 0,
        read: 0,
        timestamp: 0,
        read_timestamp: 0,
    }
    return Object.assign({}, base, overrides);
}

exports.base_challenge = base_challenge;
