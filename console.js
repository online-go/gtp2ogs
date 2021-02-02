// vim: tw=120 softtabstop=4 shiftwidth=4

const tracer = require('tracer');

let DEBUG = false;

const console_fmt = (debug) => ("{{timestamp}} {{title}} "
    + (debug ? "{{file}}:{{line}}{{space}} " : "")
    + "{{message}}");


const console_config = {
    format: [console_fmt(DEBUG)],
    dateformat: 'mmm dd HH:MM:ss',
    preprocess: function (data) {
        switch (data.title) {
            case 'debug': data.title = ' '; break;
            case 'log': data.title = ' '; break;
            case 'info': data.title = ' '; break;
            case 'warn': data.title = '!'; break;
            case 'error': data.title = '!!!!!'; break;
        }
        if (DEBUG) data.space = " ".repeat(Math.max(0, 30 - `${data.file}:${data.line}`.length));
    }
};

exports.setLogfileConsole = (argv, fs) => {
    DEBUG = argv.debug;
    console_config.format = [console_fmt(DEBUG)];
    if (argv.logfile) {
        const real_console = require('console');
        console_config.transport = (data) => {
            real_console.log(data.output);
            fs.open(argv.logfile, 'a', parseInt('0644', 8), function (e, id) {
                fs.write(id, data.output + "\n", null, 'utf8', function () {
                    fs.close(id, () => { });
                });
            });
        };
    }
    exports.console = tracer.colorConsole(console_config);
}

exports.console = tracer.colorConsole(console_config);
