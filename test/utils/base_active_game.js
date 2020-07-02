function base_active_game(overrides) {
    let base = {
        id: 1,
        phase: 'play',
        name: 'Friendly Match',
        player_to_move: 1,
        time_per_move: 89280,
        width: 19,
        height: 19,
        move_number: 0,
        paused: 0,
        private: false,
        black: {
            id: 1,
            username: 'testbot',
            rank: 10,
            professional: false,
            accepted: false,
        },
        white: {
            id: 2,
            username: 'human',
            rank: 10,
            professional: false,
            accepted: false,
        },
    }
    return Object.assign({}, base, overrides);
}

exports.base_active_game = base_active_game;
