const gulp = require("gulp");
const gulpEslint = require("gulp-eslint-new");
//var ts = require("gulp-typescript");
//var sourcemaps = require("gulp-sourcemaps");
//var tsProject = ts.createProject("tsconfig.json");
const spawn = require("child_process").spawn;
const tsj = require("ts-json-schema-generator");
const fs = require("fs");

const ts_sources = ["src/**/*.ts", "src/**/*.tsx", "!src/**/*.test.ts", "!src/**/*.test.tsx"];
const schema_sources = ["src/config.ts"];

gulp.task("watch_eslint", watch_eslint);
//gulp.task("watch_build", watch_build);
gulp.task("watch_schema", watch_schema);
gulp.task("eslint", eslint);
//gulp.task("build", build);
gulp.task("background_webpack", background_webpack);
gulp.task("schema", build_schema);
gulp.task(
    "default",
    gulp.series("schema", gulp.parallel("watch_eslint", "watch_schema", "background_webpack")),
);

function watch_eslint(done) {
    gulp.watch(ts_sources, { ignoreInitial: false }, eslint);
    done();
}

function watch_schema(done) {
    gulp.watch(schema_sources, { ignoreInitial: false }, build_schema);
    done();
}

/*
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
*/

function background_webpack(done) {
    function spawn_webpack() {
        let env = process.env;
        let webpack = spawn("npm", ["run", "webpack-watch"], { stdio: "inherit", shell: true });

        webpack.on("exit", spawn_webpack);
    }
    spawn_webpack();

    done();
}

function build_schema(done) {
    /* We reference the schema within our config.ts file, so we need to
     * generate a stub for it if it doesn't already exist */
    if (!fs.existsSync("schema/Config.schema.json")) {
        if (!fs.existsSync("schema")) {
            fs.mkdirSync("schema");
        }
        console.warn("Generating stub schema/Config.schema.json");
        fs.writeFileSync("schema/Config.schema.json", "{}");
    }

    const schema = tsj
        .createGenerator({
            path: "src/config.ts",
            type: "Config",
            tsconfig: "tsconfig.json",
        })
        .createSchema("Config");

    //fs.mkdirSync("dist", { recursive: true });
    fs.writeFile("schema/Config.schema.json", JSON.stringify(schema, null, 4), done);
}
function eslint() {
    return gulp
        .src(ts_sources)
        .pipe(gulpEslint({ overrideConfigFile: "eslint.config.mjs" }))
        .pipe(gulpEslint.format())
        .pipe(gulpEslint.failAfterError());
}
