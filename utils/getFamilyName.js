function getFamilyName(argName) {
    return argName.split("unranked")[0]
                  .split("ranked")[0];
}

exports.getFamilyName = getFamilyName;
