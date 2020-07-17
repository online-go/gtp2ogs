function getUnreservedFilename(filename) {
    // list of reserved filenames on different operating systems:
    // https://stackoverflow.com/a/31976060
    //

    const reservedFilenames = ["CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7","COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"];
    
    for (const reservedFilename of reservedFilenames) {
        if (filename === reservedFilename) return (`${filename}-unreserved`);
    }

    return filename;
}

function getValidFilename(filename) {
    let validFilename = getUnreservedFilename(filename);

    const singleFiguresToString = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

    // generated with https://stackoverflow.com/a/24597663
    const upperCaseCharacters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
    const lowerCaseCharacters = upperCaseCharacters.map( (e) => e.toLowerCase() );

    const allowedCharacters = singleFiguresToString.concat(upperCaseCharacters).concat(lowerCaseCharacters);

    for (const char of validFilename) {
        if (!allowedCharacters.includes(char)) {
            validFilename = validFilename.split(char).join("-");
        }
    }

    return validFilename;
}

exports.getValidFilename = getValidFilename;
