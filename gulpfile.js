const path = require("path");
const fileExists = require("file-exists");
const gulp = require("gulp");
const babel = require("gulp-babel");
const less = require("gulp-less");
const uglify = require("gulp-uglify");
const cleanCSS = require("gulp-clean-css");
const rename = require("gulp-rename");
const del = require("del");
const imagemin = require("gulp-imagemin");
const qcloud = require("qcloud-upload");
const gulpif = require("gulp-if");
const gutil = require("gulp-util");
const replace = require("gulp-replace");
const newer = require("gulp-newer");
const px2rpx = require("gulp-px2rpx");
const ci = require("miniprogram-ci");
const sourcemaps = require("gulp-sourcemaps");
const child_process = require("child_process");
const dayjs = require("dayjs");

const postcss = require("gulp-postcss");
const autoprefixer = require("gulp-autoprefixer");
const cache = require("gulp-cached");
const debug = require("gulp-debug");
const alias = require("gulp-path-alias");
const pkg = require("./package.json");
const projectConfig = require("./project.config.json");

const buildPath = path.join(__dirname, "dist/");

const uploadFolder = path.join(__dirname, "./src/images");
const isPro = process.env.NODE_ENV === "production";
const env = process.env.NODE_ENV;
const branchName = child_process.execSync("git symbolic-ref --short HEAD", {
	encoding: "utf8",
});
const config = {
	assetsCDN: "https://sbl-1257135381.cos.ap-guangzhou.myqcloud.com/",
	cos: {
		Bucket: "sbl-1257135381",
		Region: "ap-guangzhou",
		SecretId: "AKIDjT7RH9DE6sY3Rg7o7MUZXK9qOowylmaX",
		SecretKey: "nU1TluwnU5d97zf3VSL7jAWhR8jz61lO",
		prefix: `images/${pkg.name}/images`, // 上传到油漆桶的哪个文件夹
		src: uploadFolder, // 上传哪个文件夹到油漆桶
		overWrite: 1,
	},
	enablePx2Rpx: true,
	enableCleanCSS: false,
	enableAuto: true, // 自动补全css
	enableUglify: false,
	enableSourcemap: true,
};

const paths = {
	styles: {
		src: ["src/**/*.less"],
		dest: buildPath,
	},
	images: {
		src: "src/images/**/*.{png,jpg,jpeg,svg,gif}",
		dest: buildPath,
	},
	scripts: {
		src: "src/**/*.js",
		dest: buildPath,
	},
	copy: {
		src: [
			"src/**",
			"!src/**/*.less",
			"!src/images/**",
			"!src/**/*.js",
			"package.json",
		],
		dest: buildPath,
	},
};

// 删除构建
function clean() {
	return del([buildPath]);
}

function log() {
	const data = Array.prototype.slice.call(arguments);
	gutil.log.apply(false, data);
}

function upload() {
	return new Promise(function (resolve, reject) {
		// 普通函数，resolve()的时候，qcloud不一定执行结束
		qcloud(config.cos);
		resolve();
	});
}

function test() {
	// console.log(gitData)
}

// 任务处理函数
function styles() {
	return gulp
		.src(paths.styles.src, { base: "src" })
		.pipe(
			alias({
				paths: {
					"@": path.resolve(__dirname, "./src/"),
				},
			})
		)
		.pipe(less())
		.pipe(autoprefixer())
		.pipe(replace("%CDN_IMG%/", config.assetsCDN + config.cos.prefix + "/"))
		.pipe(gulpif(config.enableCleanCSS, cleanCSS()))
		.pipe(
			gulpif(
				config.enablePx2Rpx,
				px2rpx({
					screenWidth: 375, // 设计稿屏幕, 默认750
					wxappScreenWidth: 750, // 微信小程序屏幕, 默认750
					remPrecision: 6,
				})
			)
		)
		.pipe(replace("PX", "px"))
		.pipe(rename((path) => (path.extname = ".wxss")))
		.pipe(gulp.dest(paths.styles.dest));
}

function scripts() {
	return (
		gulp
			.src(paths.scripts.src, { base: "src" })
			.pipe(
				alias({
					paths: {
						"@": path.resolve(__dirname, "./src/"), // src 目录
					},
				})
			)
			.pipe(gulpif(config.enableSourcemap, sourcemaps.init()))
			// .pipe(babel({ presets: ['@babel/env'], 'plugins': [] }))
			.pipe(
				gulpif(
					isPro,
					replace("%ENV%", "production"),
					replace("%ENV%", "development")
				)
			)
			// 环境变量静态替换
			.pipe(replace("%CDN_IMG%/", config.assetsCDN + config.cos.prefix + "/"))
			.pipe(replace("%VERSION%", pkg.version))
			.pipe(gulpif(config.enableUglify, uglify()))
			.pipe(gulpif(config.enableSourcemap, sourcemaps.write(".")))
			.pipe(gulp.dest(paths.scripts.dest))
	);
}

// 不需要处理的文件直接复制过去
function copy() {
	return gulp
		.src(paths.copy.src)
		.pipe(replace("%CDN_IMG%/", config.assetsCDN + config.cos.prefix + "/"))
		.pipe(gulp.dest(paths.copy.dest));
}

// 新图片压缩处理
function images() {
	return gulp
		.src(paths.images.src, { base: "src" })
		.pipe(newer(paths.images.dest))
		.pipe(imagemin())
		.pipe(gulp.dest(paths.images.dest));
}

function watchFiles() {
	const w1 = gulp.watch(paths.styles.src, styles).on("unlink", function (file) {
		log(gutil.colors.yellow(file) + " is deleted");
		const filePath = file.replace(/src\\/, "dist\\");
		del([filePath]);
	});

	const w2 = gulp
		.watch(paths.scripts.src, scripts)
		.on("unlink", function (file) {
			log(gutil.colors.yellow(file) + " is deleted");
			const filePath = file.replace(/src\\/, "dist\\");
			del([filePath]);
		});

	const w3 = gulp.watch(paths.copy.src, copy).on("unlink", function (file) {
		log(gutil.colors.yellow(file) + " is deleted");
		const filePath = file.replace(/src\\/, "dist\\");
		del([filePath]);
	});

	const w4 = gulp.watch(paths.images.src, upload).on("unlink", function (file) {
		log(gutil.colors.yellow(file) + " is deleted");
		const filePath = file.replace(/src\\/, "tmp\\");
		del([filePath]);
	});
	return Promise.all([w1, w2, w3, w4]);

	// gulp.watch(paths.tmp.src, upload);
}

/**
 * 小程序ci相关函数
 */
let project = {};

const keyFile = fileExists.sync(`./private.${projectConfig.appid}.key`);
if (keyFile) {
	project = new ci.Project({
		appid: projectConfig.appid,
		type: "miniProgram",
		projectPath: "./dist",
		privateKeyPath: `./private.${projectConfig.appid}.key`,
		ignores: ["images/**/*"],
	});
}
async function npmBuild() {
	await ci.packNpmManually({
		packageJsonPath: "./package.json",
		miniprogramNpmDistDir: "./src/",
	});
}

async function mpUpload() {
	// 在master分支，不允许使用deploy-dev
	if (isPro && branchName.trim() !== "master") {
		log(
			gutil.colors.red(
				"请在master分支执行发布命令，当前分支为",
				branchName.trim()
			)
		);
		return false;
	}
	// 在非master分支，不允许执行deploy-pro命令
	if (!isPro && branchName.trim() != "dev") {
		log(
			gutil.colors.red(
				"请在dev分支执行发布体验版命令，当前分支为",
				branchName.trim()
			)
		);
		return false;
	}
	const uploadResult = await ci.upload({
		project,
		version: pkg.version,
		desc: pkg.description,
		setting: {
			es7: true,
			es6: true,
			minify: true,
			autoPrefixWXSS: true,
		},
		robot: isPro ? 2 : 1,
		onProgressUpdate: console.log,
	});
	console.log("[uploadResult:]", uploadResult);
}

async function preview() {
	const previewResult = await ci.preview({
		project,
		desc: pkg.description, // 此备注将显示在“小程序助手”开发版列表中
		qrcodeFormat: "image",
		qrcodeOutputDest: "./preview.jpg",
		setting: {
			es7: true,
			es6: true,
			minify: true,
			autoPrefixWXSS: true,
		},
		onProgressUpdate: console.log,
		// pagePath: 'pages/index/index', // 预览页面
		// searchQuery: 'a=1&b=2',  // 预览参数 [注意!]这里的`&`字符在命令行中应写成转义字符`\&`
	});
	console.log("[previewResult:]", previewResult);
}
// 清理陈旧分支
async function clearBranch() {
	const brans = child_process
		.execSync(
			'for branch in `git branch -r | grep -v HEAD`;do echo `git show --format="%ci" $branch | head -n 1` $branch; done | sort -r'
		)
		.toString()
		.split("\n");
	// 获取当前所有分支
	const branArr = brans
		.map((item) => {
			const arr = item.split(" ");
			const d = `${arr[0]} ${arr[1]}`; //yyyy-MM-DD
			log(
				gutil.colors.red(`当前符合的分支有${d}====${arr[3] && arr[3].slice(7)}`)
			);
			return {
				date: d,
				timestamp: Date.parse(d),
				branch: arr[3] && arr[3].slice(7),
			};
		})
		.filter((item) => item.date && item.branch);
	// 条件处理（默认超过3个月）
	const filterBranch = (monthAgo = 3) => {
		const time = Date.parse(dayjs().subtract(monthAgo, "month").toDate());
		log(gutil.colors.red(`${time} delete fail`));
		branArr.map((i) => {
			log(gutil.colors.red(`branArr====${i.timestamp}`));
		});
		const branchs = branArr.filter((item) => item.timestamp <= time);
		log(gutil.colors.red(`当前符合的分支有${branchs.length}个`));
		return branchs;
	};
	// 执行
	filterBranch(1).forEach((item) => {
		log(gutil.colors.red(`${item.branch} delete fail`));
		//   try {
		//     child_process.execSync(`git push origin -d ${item.branch}`)
		//   } catch (error) {
		//     log(gutil.colors.red(`${item.branch} delete fail`))
		//   }
	});
}
exports.watch = watchFiles;
exports.preview = preview;

exports.clearBranch = clearBranch;
// ci 自动构建npm
exports.npm = npmBuild;
exports.test = test;
exports.upload = mpUpload;

exports.default = gulp.series(styles, scripts, copy, upload, watchFiles);
// exports.upload = gulp.series(upload)

exports.build = gulp.series(clean, styles, scripts, copy, upload);
