// app.js
const utils = require("./utils/util.js");
const dayjs = require("dayjs");
App({
	onLaunch() {
		// 展示本地存储能力
		const logs = wx.getStorageSync("logs") || [];
		logs.unshift(Date.now());
		wx.setStorageSync("logs", logs);
		wx.$dayjs = dayjs;
		wx.$utils = utils;
		// 登录
		wx.login({
			success: (res) => {
				// 发送 res.code 到后台换取 openId, sessionKey, unionId
			},
		});
	},
	globalData: {
		userInfo: null,
	},
});
