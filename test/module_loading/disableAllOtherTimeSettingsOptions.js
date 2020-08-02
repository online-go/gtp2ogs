function disableAllOtherTimeSettingsOptions(config, optionType, timecontrol) {
    for (const timesettingsOption of ["maintime", "periods", "periodtime"]) {
        if (timesettingsOption !== optionType) {
            // we do not test these (disable default)
            config[`min${timesettingsOption}${timecontrol}`] = undefined;
            config[`max${timesettingsOption}${timecontrol}`] = undefined;
        }
    }
}

exports.disableAllOtherTimeSettingsOptions = disableAllOtherTimeSettingsOptions;
