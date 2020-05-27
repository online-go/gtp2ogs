function rejectNewByTime(config, now, startTime = new Date()) {
    const [t1, t2] = config.split('-').concat(`${startTime.getHours()}:${startTime.getMinutes()}`);
    const [hh1, mm1] = t1.split(':');
    const [hh2, mm2] = t2.split(':');
    const start = Number(hh1) * 60 + Number(mm1);
    const end = Number(hh2) * 60 + Number(mm2);
    const cur = now.getHours() * 60 + now.getMinutes();
    return (start <= cur && cur < end
    ||   (start < cur || cur < end) && end < start)
}

function testRejectNewByTime(config) {
    if (!config) return;
    if ((/^[1-2]?\d:[0-5]?\d(-[1-2]?\d:[0-5]?\d)?$/).exec(config) === null) throw `invalid format in rejectNewByTime: ${config}`;
}

module.exports = { rejectNewByTime, testRejectNewByTime };
