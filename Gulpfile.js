const gulp = require("gulp");
const gulpEslint = require("gulp-eslint-new");
var ts = require("gulp-typescript");
var tsProject = ts.createProject("tsconfig.json", { watch: true });

const ts_sources = ["src/**/*.ts", "src/**/*.tsx", "!src/**/*.test.ts", "!src/**/*.test.tsx"];

gulp.task("watch_eslint", watch_eslint);
gulp.task("eslint", eslint);
gulp.task("build", function () {
    return tsProject.src().pipe(tsProject()).js.pipe(gulp.dest("dist"));
});
gulp.task("default", gulp.parallel("watch_eslint", "build"));

function watch_eslint(done) {
    gulp.watch(ts_sources, { ignoreInitial: false }, eslint);
    done();
}

function eslint() {
    return gulp
        .src(ts_sources)
        .pipe(gulpEslint())
        .pipe(gulpEslint.format())
        .pipe(gulpEslint.failAfterError());
}
