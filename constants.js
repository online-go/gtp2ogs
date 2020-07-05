const ogsPvAIs = ["LeelaZero", "Sai", "KataGo", "PhoenixGo", "Leela"];

const rankedUnrankedOptions = [
    { name: "bans" },
    { name: "boardsizes", default: "9,13,19" },
    { name: "komis", default: "automatic" },
    { name: "speeds", default: "all" },
    { name: "timecontrols", default: "fischer,byoyomi,simple,canadian" },
    { name: "proonly" },
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

exports.constants = { ogsPvAIs, rankedUnrankedOptions };
