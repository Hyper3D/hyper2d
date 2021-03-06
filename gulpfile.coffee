'use strict'

gulp = require('gulp')
concat = require('gulp-concat')
concatUtil = require('gulp-concat-util')
del = require('del')
util = require('gulp-util')
es = require('event-stream')
ts = require('gulp-typescript')
bump = require('gulp-bump')
git = require('gulp-git')
through = require('through2')
hyperShaders = require('./tools/gulp-hyper-shaders')
filter = require('gulp-filter')
tagVersion = require('gulp-tag-version')
inquirer = require('inquirer')
path = require('path')
browserify = require('browserify')
uglify = require('gulp-uglify')
browserifyGlobalShim = require('browserify-global-shim')
buffer = require('vinyl-buffer')
source = require('vinyl-source-stream')
rename = require('gulp-rename')
pipe = require('multipipe')
mirror = require('gulp-mirror')
licensify = require('licensify')
fs = require('fs')
tslint = require('gulp-tslint')

# --------------------- path -----------------------

sources =
  lib:
    js: [ './src/**/*.js' ]
    tsd: [ './src/*.d.ts' ]
    ts: [
      './src/**/*.ts'
      '!./src/*.d.ts'
    ]
    tsMain: [ './src/renderer/public/*.ts' ]
    shaders: [ './src/renderer/shaders/**/*.glsl' ]

shaderTemplateSource = './src/renderer/shaders/shaderchunktemplate.txt'
bundleMain = 'src/bundle-main.js'
destinations =
  pub_js: './dist/'
  bundle_js: './build/'

# ---------------- helper functions -----------------

addSource = (inp) ->
  p = through.obj()
  es.duplex p, es.merge(inp, p)

versionModule = (path) ->
  packageInfo = JSON.parse fs.readFileSync('./package.json')
  version = packageInfo.version

  stream = source(path)
  stream.end "exports.REVISION = #{JSON.stringify(version)};\n"
  stream

# ---------------------- tasks ----------------------

gulp.task 'dep:lib', ->
  return

gulp.task 'js:lib', ->
  tsProject = ts.createProject('tsconfig.json', sortOutput: true)

  tsFiles = gulp.src(sources.lib.ts)

  shaderChunks = gulp.src(sources.lib.shaders)
    .pipe(hyperShaders(shaderTemplateSource))


  versionFile = versionModule('./renderer/public/Version.js')

  tsStream = tsFiles
    .pipe(addSource(shaderChunks))
    .pipe(ts(tsProject))

  es.merge(
    tsStream.js
      .pipe(gulp.dest(destinations.pub_js)),
    #tsStream.dts
    #  .pipe(gulp.dest(destinations.pub_js)),
    gulp.src(sources.lib.js, base: 'src')
      .pipe(gulp.dest(destinations.pub_js)),
    gulp.src(sources.lib.tsd, base: 'src')
      .pipe(gulp.dest(destinations.pub_js)),
    versionFile
      .pipe(gulp.dest(destinations.pub_js))
  )

gulp.task 'js:bundle', [ 'js:lib' ], ->
  # replace require('three') with THREE
  gs = browserifyGlobalShim.configure('three': 'THREE')

  browserify(entries: bundleMain)
    .transform(gs)
    .plugin(licensify)
    .bundle()
    .pipe(source('hyper2d.js'))
    .pipe(buffer())
    .pipe(mirror(
       pipe(
         uglify(preserveComments: 'license'),
         rename('hyper2d.min.js')),
       rename('hyper2d.js')))
    .pipe(gulp.dest(destinations.bundle_js))

gulp.task 'js:lint', ->
  gulp.src(sources.lib.ts)
    .pipe(tslint())
    .pipe(tslint.report('verbose'))

# deletes the dist folder for a clean build
gulp.task 'clean', ->
  del [ './dist', './build' ], (err, deletedFiles) ->
    if deletedFiles.length
      util.log 'Deleted', util.colors.red(deletedFiles.join(' ,'))
    else
      util.log util.colors.yellow('empty - nothing to delete')
    return
  return

gulp.task 'build', [
  'js:lib'
  'dep:lib'
  'js:bundle'
]

gulp.task 'bump', ->
  questions = [
    type: 'input'
    name: 'bump'
    message: 'Are you sure you want to bump the patch version? [Y/N]'
  ]

  inquirer.prompt questions, (answers) ->
    if answers.bump == 'Y'
      gulp.src([ './package.json' ])
        .pipe(bump(type: 'patch'))
        .pipe(gulp.dest('./'))
        .pipe(git.commit('bump patch version'))
        .pipe(filter('package.json'))
        .pipe(tagVersion())
    else
      null

  return

# watch scripts, styles, and templates
gulp.task 'watch', ->
  buildTasks = [ 'js:lint', 'js:lib' ]
  gulp.watch sources.lib.ts, buildTasks
  gulp.watch sources.lib.tsd, buildTasks
  gulp.watch sources.lib.js, buildTasks
  gulp.watch sources.lib.shaders, buildTasks
  gulp.watch [ shaderTemplateSource ], buildTasks
  return

# ---------------- default task -----------------

gulp.task 'default', [
  'js:lint',
  'js:lib'
  'watch'
]
