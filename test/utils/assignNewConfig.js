function assignRankedUnrankedDefaults(config, r_u) {
    // default values to be used if no arg is specified by bot admin for these options
    config[r_u].boardsizes.allowed[9] = true;
    config[r_u].boardsizes.allowed[13] = true;
    config[r_u].boardsizes.allowed[19] = true;

    config[r_u].komis.allowed["automatic"] = true;

    config[r_u].speeds.allow_all = true;

    config[r_u].timecontrols.allowed["byoyomi"] = true;
    config[r_u].timecontrols.allowed["fischer"] = true;
    config[r_u].timecontrols.allowed["canadian"] = true;
    config[r_u].timecontrols.allowed["simple"] = true;
}

function assignNewConfig(config) {
    config.DEBUG = true;
    config.apikey = 'deadbeef';
    config.host = 'test';
    config.port = 80;
    config.username = 'testbot';

    assignRankedUnrankedDefaults(config, "ranked");
    assignRankedUnrankedDefaults(config, "unranked");

    config.bot_command = ['gtp-program', '--argument'];
}

exports.assignNewConfig = assignNewConfig;