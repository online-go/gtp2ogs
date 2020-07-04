function getOptionName(argName) {
    return argName.split("unranked")[0]
                  .split("ranked")[0];
}

exports.getOptionName = getOptionName;
