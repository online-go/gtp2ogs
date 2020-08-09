function disableAllOtherTimeSettingsOptions(config, optionType, timecontrolAbridged) {
    for (const timesettingsOption of ["maintime", "periods", "periodtime"]) {
        if (timesettingsOption !== optionType) {
            // we do not test these (disable default)
            config[`min${timesettingsOption}${timecontrolAbridged}`] = undefined;
            config[`max${timesettingsOption}${timecontrolAbridged}`] = undefined;
        }
    }
}

exports.disableAllOtherTimeSettingsOptions = disableAllOtherTimeSettingsOptions;
