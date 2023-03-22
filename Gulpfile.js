const gulp = require("gulp");
const gulpEslint = require("gulp-eslint-new");
var ts = require("gulp-typescript");
var sourcemaps = require("gulp-sourcemaps");
var tsProject = ts.createProject("tsconfig.json");
const tsj = require("ts-json-schema-generator");
const fs = require("fs");

const ts_sources = ["src/**/*.ts", "src/**/*.tsx", "!src/**/*.test.ts", "!src/**/*.test.tsx"];
const schema_sources = ["src/Settings.ts"];

gulp.task("watch_eslint", watch_eslint);
gulp.task("watch_build", watch_build);
gulp.task("watch_schema", watch_schema);
gulp.task("eslint", eslint);
gulp.task("build", build);
gulp.task("schema", build_schema);
gulp.task(
    "default",
    gulp.series("schema", gulp.parallel("watch_eslint", "watch_schema", "watch_build")),
);

function watch_eslint(done) {
    gulp.watch(ts_sources, { ignoreInitial: false }, eslint);
    done();
}

function watch_schema(done) {
    gulp.watch(schema_sources, { ignoreInitial: false }, build_schema);
    done();
}

function watch_build(done) {
    gulp.watch(ts_sources, { ignoreInitial: false }, build);
    done();
}

function build(done) {
    return tsProject
        .src()
        .pipe(sourcemaps.init())
        .pipe(tsProject())
        .pipe(sourcemaps.write("../dist"))
        .pipe(gulp.dest("dist"))
        .on("end", done);
}

function build_schema(done) {
    const schema = tsj
        .createGenerator({
            path: "src/Settings.ts",
            type: "Settings",
            tsconfig: "tsconfig.json",
        })
        .createSchema("Settings");
        
    fs.mkdirSync("dist", { recursive: true });
    //fs.writeFile("src/Settings.schema.json", JSON.stringify(schema, null, 4), done);
    fs.writeFile("dist/Settings.schema.json", JSON.stringify(schema, null, 4), done);
}
function eslint() {
    return gulp
        .src(ts_sources)
        .pipe(gulpEslint())
        .pipe(gulpEslint.format())
        .pipe(gulpEslint.failAfterError());
}
