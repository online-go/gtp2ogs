const droppedOptions = [
    [["botid", "bot", "id"], "username"],
    [["mingamesplayed", "mingamesplayedranked", "mingamesplayedunranked"], undefined],
    [["fakerank"], undefined],
    [["minrankedhandicap"], "minhandicapranked"],
    [["minunrankedhandicap"], "minhandicapunranked"],
    [["maxrankedhandicap"], "maxhandicapranked"],
    [["maxunrankedhandicap"], "maxhandicapunranked"],
    [["maxtotalgames"], "maxconnectedgames"],
    [["maxactivegames"], "maxconnectedgamesperuser"],
    [["maxmaintime"],  getBLCString("maxmaintime", "")],
    [["maxmaintimeranked"], getBLCString("maxmaintime", "ranked")],
    [["maxmaintimeunranked"], getBLCString("maxmaintime", "unranked")],
    [["minmaintime"], getBLCString("minmaintime", "")],
    [["minmaintimeranked"], getBLCString("minmaintime", "ranked")],
    [["minmaintimeunranked"], getBLCString("minmaintime", "unranked")],
    [["maxperiodtime"], getBLCString("maxperiodtime", "")],
    [["maxperiodtimeranked"], getBLCString("maxperiodtime", "ranked")],
    [["maxperiodtimeunranked"], getBLCString("maxperiodtime", "unranked")],
    [["minperiodtime"], getBLCString("minperiodtime", "")],
    [["minperiodtimeranked"], getBLCString("minperiodtime", "ranked")],
    [["minperiodtimeunranked"], getBLCString("minperiodtime", "unranked")],
    [["maxperiods"],  getBLCString("maxperiods", "")],
    [["maxperiodsranked"], getBLCString("maxperiods", "ranked")],
    [["maxperiodsunranked"], getBLCString("maxperiods", "unranked")],
    [["minperiods"], getBLCString("minperiods", "")],
    [["minperiodsranked"], getBLCString("minperiods", "ranked")],
    [["minperiodsunranked"], getBLCString("minperiods", "unranked")],
    [["ban"], "bans"],
    [["banranked"], "bansranked"],
    [["banunranked"], "bansunranked"],
    [["boardsize"], "boardsizes"],
    [["boardsizeranked"], "boardsizesranked"],
    [["boardsizeunranked"], "boardsizesunranked"],
    [["boardsizewidths", "boardsizewidthsranked", "boardsizewidthsunranked",
        "boardsizeheights", "boardsizeheightsranked", "boardsizeheightsunranked"], "boardsizes"],
    [["komi"], "komis"],
    [["komiranked"], "komisranked"],
    [["komiunranked"], "komisunranked"],
    [["speed"], "speeds"],
    [["speedranked"], "speedsranked"],
    [["speedunranked"], "speedsunranked"],
    [["timecontrol"], "timecontrols"],
    [["timecontrolranked"], "timecontrolsranked"],
    [["timecontrolunranked"], "timecontrolsunranked"]
];

const ogsPvAIs = ["LeelaZero", "Sai", "Sai18", "KataGo", "PhoenixGo", "Leela"];

const rootOptionsDefaults = {
    host: 'online-go.com',
    maxconnectedgames: 20,
    maxconnectedgamesperuser: 3,
    port: 443,
    rejectnewmsg: 'Currently, this bot is not accepting games, try again later',
    startupbuffer: 5,
    timeout: 0,
};

const rankedUnrankedOptions = [
    { name: "bans" },
    { name: "boardsizes", default: "9,13,19" },
    { name: "komis", default: "automatic" },
    { name: "speeds", default: "all" },
    { name: "timecontrols", default: "fischer,byoyomi,simple,canadian" },
    { name: "proonly" },
    { name: "noprovisional" },
    { name: "nopause" },
    { name: "nopauseonweekends" },
    { name: "noautohandicap" },
    { name: "minrank" },
    { name: "maxrank" },
    { name: "minhandicap" },
    { name: "maxhandicap" },
    { name: "minmaintimeblitz", default: 15 }, // 15 seconds
    { name: "minmaintimelive", default: 60 }, // 1 minutes
    { name: "minmaintimecorr", default: 259200 }, // 3 days
    { name: "minperiodsblitz", default: 3 },
    { name: "minperiodslive", default: 3 },
    { name: "minperiodscorr", default: 3 },
    { name: "minperiodtimeblitz", default: 5 }, // 5 seconds
    { name: "minperiodtimelive", default: 10 }, // 10 seconds
    { name: "minperiodtimecorr", default: 14400 }, // 4 hours
    { name: "maxmaintimeblitz", default: 300 }, // 5 minutes
    { name: "maxmaintimelive", default: 7200 }, // 2 hours
    { name: "maxmaintimecorr", default: 604800 }, // 7 days
    { name: "maxperiodsblitz", default: 20 },
    { name: "maxperiodslive", default: 20 },
    { name: "maxperiodscorr", default: 10 },
    { name: "maxperiodtimeblitz", default: 10 }, // 10 seconds
    { name: "maxperiodtimelive", default: 120 }, // 2 minutes
    { name: "maxperiodtimecorr", default: 259200 } // 3 days
];

function getBLCString(optionName, rankedUnranked) {
    return `${optionName}blitz${rankedUnranked}, --${optionName}live${rankedUnranked} and/or --${optionName}corr${rankedUnranked}`;
}

module.exports = { droppedOptions, ogsPvAIs, rootOptionsDefaults, rankedUnrankedOptions };
