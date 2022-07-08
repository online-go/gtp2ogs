const gulp = require("gulp");
const gulpEslint = require("gulp-eslint-new");
var ts = require("gulp-typescript");
var tsProject = ts.createProject("tsconfig.json");

const ts_sources = ["src/**/*.ts", "src/**/*.tsx", "!src/**/*.test.ts", "!src/**/*.test.tsx"];

gulp.task("watch_eslint", watch_eslint);
gulp.task("watch_build", watch_build);
gulp.task("eslint", eslint);
gulp.task("build", build);
gulp.task("default", gulp.parallel("watch_eslint", "watch_build"));

function watch_eslint(done) {
    gulp.watch(ts_sources, { ignoreInitial: false }, eslint);
    done();
}

function watch_build(done) {
    gulp.watch(ts_sources, { ignoreInitial: false }, build);
    done();
}

function build() {
    return tsProject.src().pipe(tsProject()).js.pipe(gulp.dest("dist"));
}


function eslint() {
    return gulp
        .src(ts_sources)
        .pipe(gulpEslint())
        .pipe(gulpEslint.format())
        .pipe(gulpEslint.failAfterError());
}
