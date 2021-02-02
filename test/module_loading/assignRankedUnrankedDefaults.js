const { rankedUnrankedOptions } = require('../../constants');

function assignAllowedGroupDefaults(args, option) {
    const optionArgs = option.default.split(',');

    for (const optionArg of optionArgs) {
        if (optionArg === "all") {
            args[`allow_all_${option.name}`] = true;
        } else if (optionArg === "automatic" && option.name === "komis") {
            args[`allowed_${option.name}`]["null"] = true;
        } else {
            args[`allowed_${option.name}`][optionArg] = true;
        }
    }
}

function assignRankedUnrankedDefaults(args) {
    for (const option of rankedUnrankedOptions) {
        if ("default" in option) {
            args[option.name] = option.default;

            // allowed groups defaults also need to assign defaults in underscored exports
            if (["boardsizes", "komis", "speeds", "timecontrols"].includes(option.name)) {
                assignAllowedGroupDefaults(args, option);
            }
        }
    }

}

exports.assignRankedUnrankedDefaults = assignRankedUnrankedDefaults;
