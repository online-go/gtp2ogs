function rejectNewByTime(config, now) {
    const [t1, t2] = config.split('-');
    const [hh1, mm1] = t1.split(':');
    const [hh2, mm2] = t2.split(':');
    const start = Number(hh1) * 60 + Number(mm1);
    const end = Number(hh2) * 60 + Number(mm2);
    const cur = now.getHours() * 60 + now.getMinutes();
    return (start <= cur && cur < end
    ||   (start < cur || cur < end) && end < start)
}

exports.rejectNewByTime = rejectNewByTime;
