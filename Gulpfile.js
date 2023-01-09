const gulp = require("gulp");
const gulpEslint = require("gulp-eslint-new");
var ts = require("gulp-typescript");
var sourcemaps = require("gulp-sourcemaps");
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

function build(done) {
    //return tsProject.src().pipe(tsProject()).js.pipe(gulp.dest("dist"));

    return tsProject
        .src()
        .pipe(sourcemaps.init())
        .pipe(tsProject())
        .pipe(sourcemaps.write("../dist"))
        .pipe(gulp.dest("dist"))
        .on("end", done);
}

function eslint() {
    return gulp
        .src(ts_sources)
        .pipe(gulpEslint())
        .pipe(gulpEslint.format())
        .pipe(gulpEslint.failAfterError());
}
